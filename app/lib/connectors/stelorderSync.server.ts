import {
  fetchAllStelOrderProducts,
  fetchStelOrderCategoryNames,
  isMarkedForWeb,
  type StelOrderProduct,
} from '~/lib/connectors/stelorder.server';
import {
  classifyStelOrderProducts,
  STELORDER_CATEGORY_TAXONOMY,
  type StelOrderCategory,
} from '~/lib/connectors/stelorderCategories.server';
import {getStelOrderDescription} from '~/lib/connectors/stelorderDescriptions.server';
import {normalizeVendorName} from '~/lib/brands';
import {getImportedStelOrderIds, markStelOrderImported} from '~/lib/connectors/stelorderImports.server';
import {
  MIN_VALID_PRICE,
  SUSPICIOUS_PRICE_RATIO_HIGH,
  SUSPICIOUS_PRICE_RATIO_LOW,
} from '~/lib/connectors/sync.server';
import {
  applyStockChanges,
  createShopifyProduct,
  getOrCreateCollection,
  getPrimaryLocationId,
  getShopifyCatalogByBarcode,
  type CatalogVariant,
} from '~/lib/shopifyProducts.server';

export type StelOrderSyncRow =
  | {
      status: 'to-create';
      product: StelOrderProduct;
      category: StelOrderCategory;
    }
  | {
      status: 'to-update-stock';
      product: StelOrderProduct;
      catalogVariant: CatalogVariant;
      stockFrom: number;
      stockTo: number;
    }
  | {status: 'already-imported'; product: StelOrderProduct}
  | {status: 'unchanged'; product: StelOrderProduct; catalogVariant: CatalogVariant};

export type StelOrderPriceChange = {
  product: StelOrderProduct;
  catalogVariant: CatalogVariant;
  priceFrom: number;
  priceTo: number;
  // Nunca se aplica solo — igual que con Walkasse, un cambio de precio
  // siempre queda pendiente de que alguien lo confirme a mano. Aviso
  // aparte (además del guardado normal de "hay un cambio") cuando el
  // precio nuevo es inválido o el salto es sospechoso.
  priceWarning?: string;
};

export type StelOrderSyncSummary = {
  totalEligible: number; // marcados "web" en StelOrder, con barcode
  toCreate: Array<{product: StelOrderProduct; category: StelOrderCategory}>;
  toUpdateStock: Array<{product: StelOrderProduct; catalogVariant: CatalogVariant; stockFrom: number; stockTo: number}>;
  // Cambios de sales-price de StelOrder frente al precio actual en
  // Shopify. SOLO informativo — el cron nunca los aplica, hay que
  // confirmarlos a mano desde el panel (igual que Walkasse). OJO: esto
  // puede incluir promociones/ofertas aplicadas directamente en Shopify
  // que no son un cambio de coste real en StelOrder — no hay forma
  // automática de distinguir los dos casos, revisar antes de aplicar.
  priceChanges: StelOrderPriceChange[];
  unchanged: number;
  byCategory: Record<string, number>;
};

/**
 * Construye el resumen de lo que haría falta hacer en Shopify a partir del
 * catálogo actual de StelOrder: qué productos hay que CREAR (nuevos, con
 * marcados "web", que no existen todavía en Shopify) y a cuáles de los ya
 * importados anteriormente hay que actualizarles el stock. No escribe nada
 * en Shopify — es de solo lectura, igual que el dry-run de Walkasse.
 */
export async function buildStelOrderSyncSummary(env: Env): Promise<StelOrderSyncSummary> {
  if (!env.STELORDER_API_KEY) {
    throw new Error('Falta STELORDER_API_KEY en las variables de entorno.');
  }

  const [allProducts, catalog, importedIds] = await Promise.all([
    fetchAllStelOrderProducts(env.STELORDER_API_KEY),
    getShopifyCatalogByBarcode(env),
    getImportedStelOrderIds(env),
  ]);

  const eligible = allProducts.filter(isMarkedForWeb);
  const categories = await classifyStelOrderProducts(env, eligible);

  const toCreate: StelOrderSyncSummary['toCreate'] = [];
  const toUpdateStock: StelOrderSyncSummary['toUpdateStock'] = [];
  const priceChanges: StelOrderSyncSummary['priceChanges'] = [];
  let unchanged = 0;
  const byCategory: Record<string, number> = {};

  for (const product of eligible) {
    const category = categories.get(product.id) ?? 'Repuestos y Otros';
    byCategory[category] = (byCategory[category] ?? 0) + 1;

    const catalogVariant = catalog.get(product.barcode);
    if (catalogVariant) {
      let hasChange = false;

      if (catalogVariant.inventoryQuantity !== product.realStock) {
        toUpdateStock.push({
          product,
          catalogVariant,
          stockFrom: catalogVariant.inventoryQuantity,
          stockTo: product.realStock,
        });
        hasChange = true;
      }

      // Precios: igual que Walkasse, solo se detectan/avisan — nunca se
      // aplican en automático. Margen de 1 céntimo para no avisar por
      // ruido de redondeo.
      if (Math.abs(catalogVariant.price - product.salesPrice) > 0.005) {
        hasChange = true;
        let priceWarning: string | undefined;
        if (product.salesPrice < MIN_VALID_PRICE) {
          priceWarning = `StelOrder manda un precio inválido (${product.salesPrice}€) — se ignora, no se propone cambiarlo.`;
        } else {
          const ratio = product.salesPrice / catalogVariant.price;
          if (ratio < SUSPICIOUS_PRICE_RATIO_LOW || ratio > SUSPICIOUS_PRICE_RATIO_HIGH) {
            priceWarning = `Salto de precio inusual (${catalogVariant.price.toFixed(2)}€ → ${product.salesPrice.toFixed(2)}€) — puede ser una promoción aplicada en Shopify, no un cambio real en StelOrder. Revísalo antes de confirmar.`;
          }
        }
        priceChanges.push({
          product,
          catalogVariant,
          priceFrom: catalogVariant.price,
          priceTo: product.salesPrice,
          priceWarning,
        });
      }

      if (!hasChange) unchanged++;
      continue;
    }

    if (importedIds.has(product.id)) {
      // Ya se creó antes pero su barcode no está en el catálogo actual —
      // raro (¿se borró a mano en Shopify?), no se vuelve a crear solo.
      unchanged++;
      continue;
    }

    toCreate.push({product, category});
  }

  return {
    totalEligible: eligible.length,
    toCreate,
    toUpdateStock,
    priceChanges,
    unchanged,
    byCategory,
  };
}

// Crear ~900 productos de golpe en un solo request se pasaría del límite
// de tiempo/subpeticiones de Oxygen — la creación se hace en lotes que se
// disparan a mano desde el panel, uno detrás de otro, hasta que no quede
// nada por crear.
export const STELORDER_CREATE_BATCH_SIZE = 15;

export type ApplyCreationsResult = {
  created: number;
  errors: Array<{name: string; message: string}>;
  createdItems: Array<{
    name: string;
    productId: string;
    category: StelOrderCategory;
    descriptionBasedOnOriginal: boolean;
  }>;
};

/** Crea en Shopify hasta STELORDER_CREATE_BATCH_SIZE productos de la lista
 * "toCreate" que devuelve buildStelOrderSyncSummary, y marca cada uno como
 * importado en Firestore para que la siguiente llamada no lo repita. */
export async function applyStelOrderCreations(
  env: Env,
  items: Array<{product: StelOrderProduct; category: StelOrderCategory}>,
): Promise<ApplyCreationsResult> {
  const batch = items.slice(0, STELORDER_CREATE_BATCH_SIZE);
  const errors: ApplyCreationsResult['errors'] = [];
  const createdItems: ApplyCreationsResult['createdItems'] = [];
  let created = 0;

  if (batch.length === 0) return {created, errors, createdItems};

  const [categoryNames, locationId] = await Promise.all([
    fetchStelOrderCategoryNames(env.STELORDER_API_KEY!),
    getPrimaryLocationId(env),
  ]);
  const collectionCache = new Map<string, string>();

  for (const {product, category} of batch) {
    try {
      const collectionId = await getOrCreateCollection(env, category, collectionCache);
      const rawVendor = (product.categoryId && categoryNames.get(product.categoryId)) || 'Victor So Professional';
      const vendor = normalizeVendorName(rawVendor);
      const description = await getStelOrderDescription(env, product, category, vendor);

      const result = await createShopifyProduct(env, {
        title: product.name,
        descriptionHtml: description.html,
        vendor,
        barcode: product.barcode,
        sku: product.fullReference || product.reference,
        price: product.salesPrice,
        stock: product.realStock,
        images: product.images,
        collectionId,
        productType: category,
        taxonomyCategoryId: STELORDER_CATEGORY_TAXONOMY[category],
      });

      if (product.realStock > 0) {
        await applyStockChanges(env, locationId, [
          {inventoryItemId: result.inventoryItemId, quantity: product.realStock},
        ]);
      }

      await markStelOrderImported(env, product.id, result.productId, product.barcode);
      createdItems.push({
        name: product.name,
        productId: result.productId,
        category,
        descriptionBasedOnOriginal: description.basedOnOriginal,
      });
      created++;
    } catch (error) {
      errors.push({
        name: product.name,
        message: error instanceof Error ? error.message : 'Error desconocido.',
      });
    }
  }

  return {created, errors, createdItems};
}
