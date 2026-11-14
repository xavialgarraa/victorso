import {getSelection, type DistributorProduct} from '~/lib/connectors/distributorFeed.server';
import {classifyDistributorProducts, type DistributorCategory} from '~/lib/connectors/distributorCategories.server';
import {normalizeVendorName} from '~/lib/brands';
import {
  applyStockChanges,
  createShopifyProduct,
  getOrCreateCollection,
  getPrimaryLocationId,
  getShopifyCatalogByBarcode,
  type CatalogVariant,
} from '~/lib/shopifyProducts.server';

export type DistributorSyncSummary = {
  supplierId: string;
  totalSelected: number;
  toCreate: Array<{product: DistributorProduct; category: DistributorCategory}>;
  toUpdateStock: Array<{product: DistributorProduct; catalogVariant: CatalogVariant; stockFrom: number; stockTo: number}>;
  toUpdatePrice: Array<{product: DistributorProduct; catalogVariant: CatalogVariant; priceFrom: number; priceTo: number}>;
  unchanged: number;
};

// Comparación de precios en céntimos — dos floats que en la práctica son el
// mismo precio pueden diferir en la última cifra decimal por redondeos del
// propio feed del distribuidor, y eso no debe marcarse como "cambio".
function pricesDiffer(a: number, b: number): boolean {
  return Math.abs(a - b) >= 0.01;
}

/**
 * Igual que buildStelOrderSyncSummary pero para los productos marcados a
 * mano en /admin-interno/distribuidores (ver distributorFeed.server.ts) —
 * solo lee, no escribe nada en Shopify. El cruce es siempre por EAN.
 */
export async function buildDistributorSyncSummary(
  env: Env,
  supplierId: string,
  allProducts: DistributorProduct[],
): Promise<DistributorSyncSummary> {
  const [selection, catalog] = await Promise.all([
    getSelection(env, supplierId),
    getShopifyCatalogByBarcode(env),
  ]);

  const selectedEans = new Set(selection?.selectedEans ?? []);
  const selected = allProducts.filter((p) => selectedEans.has(p.ean));

  const toCreateRaw: DistributorProduct[] = [];
  const toUpdateStock: DistributorSyncSummary['toUpdateStock'] = [];
  const toUpdatePrice: DistributorSyncSummary['toUpdatePrice'] = [];
  let unchanged = 0;

  for (const product of selected) {
    const catalogVariant = catalog.get(product.ean);
    if (!catalogVariant) {
      toCreateRaw.push(product);
      continue;
    }
    const stockChanged = catalogVariant.inventoryQuantity !== product.stock;
    const priceChanged = pricesDiffer(catalogVariant.price, product.price);
    if (stockChanged) {
      toUpdateStock.push({
        product,
        catalogVariant,
        stockFrom: catalogVariant.inventoryQuantity,
        stockTo: product.stock,
      });
    }
    if (priceChanged) {
      toUpdatePrice.push({
        product,
        catalogVariant,
        priceFrom: catalogVariant.price,
        priceTo: product.price,
      });
    }
    if (!stockChanged && !priceChanged) unchanged++;
  }

  const categories = await classifyDistributorProducts(env, toCreateRaw);
  const toCreate = toCreateRaw.map((product) => ({
    product,
    category: categories.get(product.ean) ?? 'Otros',
  }));

  return {supplierId, totalSelected: selected.length, toCreate, toUpdateStock, toUpdatePrice, unchanged};
}

// Igual límite que StelOrder: crear todo de golpe se pasaría del tiempo
// máximo de un request en Oxygen.
export const DISTRIBUTOR_CREATE_BATCH_SIZE = 15;

export type ApplyDistributorCreationsResult = {
  created: number;
  errors: Array<{name: string; message: string}>;
};

function descriptionToHtml(description: string): string {
  const escaped = description
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<p>${escaped}</p>`;
}

/** Crea en Shopify hasta DISTRIBUTOR_CREATE_BATCH_SIZE productos de la
 * lista "toCreate" que devuelve buildDistributorSyncSummary. Se crean en
 * borrador (igual que StelOrder) para que alguien los revise antes de que
 * se vean en la tienda real. */
export async function applyDistributorCreations(
  env: Env,
  items: Array<{product: DistributorProduct; category: DistributorCategory}>,
): Promise<ApplyDistributorCreationsResult> {
  const batch = items.slice(0, DISTRIBUTOR_CREATE_BATCH_SIZE);
  const errors: ApplyDistributorCreationsResult['errors'] = [];
  let created = 0;

  if (batch.length === 0) return {created, errors};

  const locationId = await getPrimaryLocationId(env);
  const collectionCache = new Map<string, string>();

  for (const {product, category} of batch) {
    try {
      const collectionIds = category === 'Otros' ? [] : [await getOrCreateCollection(env, category, collectionCache)];
      const vendor = normalizeVendorName(product.brand || 'Victor So Professional');

      const result = await createShopifyProduct(env, {
        title: product.title,
        descriptionHtml: descriptionToHtml(product.description || product.title),
        vendor,
        barcode: product.ean,
        sku: product.sku,
        price: product.price,
        stock: product.stock,
        images: product.imageUrl ? [product.imageUrl] : [],
        collectionIds,
        productType: category,
        taxonomyCategoryId: null,
      });

      if (product.stock > 0) {
        await applyStockChanges(env, locationId, [
          {inventoryItemId: result.inventoryItemId, quantity: product.stock},
        ]);
      }

      created++;
    } catch (error) {
      errors.push({
        name: product.title,
        message: error instanceof Error ? error.message : 'Error desconocido.',
      });
    }
  }

  return {created, errors};
}
