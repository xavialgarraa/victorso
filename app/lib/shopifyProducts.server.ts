import {adminQuery} from '~/lib/shopifyAdmin.server';

export type CatalogVariant = {
  productId: string;
  variantId: string;
  inventoryItemId: string;
  sku: string;
  title: string;
  price: number;
  inventoryQuantity: number;
  barcode: string;
};

type ProductsPage = {
  products: {
    pageInfo: {hasNextPage: boolean; endCursor: string | null};
    nodes: Array<{
      id: string;
      title: string;
      variants: {
        nodes: Array<{
          id: string;
          sku: string | null;
          barcode: string | null;
          price: string;
          inventoryQuantity: number | null;
          inventoryItem: {id: string};
        }>;
      };
    }>;
  };
};

// Sin el comentario "#graphql" a propósito — va contra la Admin API, no la
// Storefront API (ver nota igual en restockSubscribers.server.ts).
const CATALOG_QUERY = `
  query CatalogBarcodes($cursor: String) {
    products(first: 100, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        title
        variants(first: 50) {
          nodes {
            id
            sku
            barcode
            price
            inventoryQuantity
            inventoryItem { id }
          }
        }
      }
    }
  }
`;

/**
 * Trae TODO el catálogo (todas las marcas, no solo una) indexado por EAN.
 * El cruce con cualquier proveedor se hace siempre así — el proveedor y la
 * marca (Vendor) del producto son cosas distintas, un producto de una
 * marca puede venir de cualquier proveedor.
 */
export async function getShopifyCatalogByBarcode(env: Env): Promise<Map<string, CatalogVariant>> {
  const map = new Map<string, CatalogVariant>();
  let cursor: string | null = null;

  do {
    const data: ProductsPage = await adminQuery<ProductsPage>(env, CATALOG_QUERY, {cursor});

    for (const product of data.products.nodes) {
      for (const variant of product.variants.nodes) {
        const barcode = variant.barcode?.trim();
        if (!barcode) continue;
        map.set(barcode, {
          productId: product.id,
          variantId: variant.id,
          inventoryItemId: variant.inventoryItem.id,
          sku: variant.sku ?? '',
          title: product.title,
          price: Number(variant.price),
          inventoryQuantity: variant.inventoryQuantity ?? 0,
          barcode,
        });
      }
    }

    cursor = data.products.pageInfo.hasNextPage ? data.products.pageInfo.endCursor : null;
  } while (cursor);

  return map;
}

/** Ubicación (sucursal) donde se ajusta el stock. Asume una sola sucursal
 * activa — si en el futuro hay varias, habría que dejar elegir cuál. */
export async function getPrimaryLocationId(env: Env): Promise<string> {
  const data = await adminQuery<{locations: {nodes: Array<{id: string; name: string}>}}>(
    env,
    `query PrimaryLocation { locations(first: 1) { nodes { id name } } }`,
  );
  const location = data.locations.nodes[0];
  if (!location) {
    throw new Error('No se encontró ninguna ubicación/sucursal en Shopify.');
  }
  return location.id;
}

export type StockChangeInput = {inventoryItemId: string; quantity: number};
export type PriceChangeInput = {productId: string; variantId: string; price: number};

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

/** Ajusta el stock "disponible" de varios variantes de una sola vez
 * (hasta 100 por llamada, Shopify no deja más). */
export async function applyStockChanges(
  env: Env,
  locationId: string,
  changes: StockChangeInput[],
): Promise<{applied: number; errors: string[]}> {
  if (changes.length === 0) return {applied: 0, errors: []};
  const errors: string[] = [];
  let applied = 0;

  for (const batch of chunk(changes, 100)) {
    const data = await adminQuery<{
      inventorySetQuantities: {
        userErrors: Array<{field: string[]; message: string}>;
      };
    }>(
      env,
      `mutation SetQuantities($input: InventorySetQuantitiesInput!) {
        inventorySetQuantities(input: $input) {
          userErrors { field message }
        }
      }`,
      {
        input: {
          name: 'available',
          reason: 'correction',
          ignoreCompareQuantity: true,
          quantities: batch.map((c) => ({
            inventoryItemId: c.inventoryItemId,
            locationId,
            quantity: c.quantity,
          })),
        },
      },
    );

    const userErrors = data.inventorySetQuantities.userErrors;
    if (userErrors.length > 0) {
      errors.push(...userErrors.map((e) => e.message));
    } else {
      applied += batch.length;
    }
  }

  return {applied, errors};
}

/** Actualiza el precio de venta variante a variante (la mutation de Shopify
 * va por producto, no admite mezclar productos distintos en una llamada). */
export async function applyPriceChanges(
  env: Env,
  changes: PriceChangeInput[],
): Promise<{applied: number; errors: string[]}> {
  const errors: string[] = [];
  let applied = 0;

  for (const change of changes) {
    // Segunda barrera además del filtro en buildSyncSummary: nunca se
    // escribe un precio a 0€ o negativo en la tienda real, pase lo que
    // pase antes en la cadena.
    if (!Number.isFinite(change.price) || change.price < 0.01) {
      errors.push(`${change.variantId}: precio inválido (${change.price}), no se aplica.`);
      continue;
    }
    try {
      const data = await adminQuery<{
        productVariantsBulkUpdate: {
          userErrors: Array<{field: string[]; message: string}>;
        };
      }>(
        env,
        `mutation UpdatePrice($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
          productVariantsBulkUpdate(productId: $productId, variants: $variants) {
            userErrors { field message }
          }
        }`,
        {
          productId: change.productId,
          variants: [{id: change.variantId, price: change.price.toFixed(2)}],
        },
      );

      const userErrors = data.productVariantsBulkUpdate.userErrors;
      if (userErrors.length > 0) {
        errors.push(`${change.variantId}: ${userErrors.map((e) => e.message).join(', ')}`);
      } else {
        applied++;
      }
    } catch (error) {
      errors.push(`${change.variantId}: ${error instanceof Error ? error.message : 'error desconocido'}`);
    }
  }

  return {applied, errors};
}
