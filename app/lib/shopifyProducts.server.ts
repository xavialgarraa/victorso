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

/** Busca una colección (custom collection) por título exacto o la crea si
 * no existe. Usar un solo Map como caché entre llamadas de un mismo lote
 * evita repetir la búsqueda por cada producto de la misma categoría. */
export async function getOrCreateCollection(
  env: Env,
  title: string,
  cache: Map<string, string>,
): Promise<string> {
  const cached = cache.get(title);
  if (cached) return cached;

  const found = await adminQuery<{collections: {nodes: Array<{id: string; title: string}>}}>(
    env,
    `query FindCollection($query: String!) {
      collections(first: 5, query: $query) { nodes { id title } }
    }`,
    {query: `title:'${title.replace(/'/g, "\\'")}'`},
  );
  const exact = found.collections.nodes.find((c) => c.title.toLowerCase() === title.toLowerCase());
  if (exact) {
    cache.set(title, exact.id);
    return exact.id;
  }

  const created = await adminQuery<{
    collectionCreate: {collection: {id: string} | null; userErrors: Array<{field: string[]; message: string}>};
  }>(
    env,
    `mutation CreateCollection($input: CollectionInput!) {
      collectionCreate(input: $input) {
        collection { id }
        userErrors { field message }
      }
    }`,
    {input: {title}},
  );
  const userErrors = created.collectionCreate.userErrors;
  if (userErrors.length > 0 || !created.collectionCreate.collection) {
    throw new Error(`No se pudo crear la colección "${title}": ${userErrors.map((e) => e.message).join(', ')}`);
  }
  const id = created.collectionCreate.collection.id;
  cache.set(title, id);
  return id;
}

export type NewProductInput = {
  title: string;
  descriptionHtml: string;
  vendor: string;
  barcode: string;
  sku: string;
  price: number;
  stock: number;
  images: string[];
  collectionId: string;
  productType: string;
  /** GID de la categoría oficial de la taxonomía de Shopify, o null si
   * ninguna encaja lo bastante bien como para forzarla. */
  taxonomyCategoryId: string | null;
};

let cachedOnlineStorePublicationId: string | null = null;

/** "Online Store" — el canal de ventas que sirve victorso.es (Hydrogen usa
 * el mismo storefront que este canal, no uno aparte). Sin publicar el
 * producto aquí explícitamente se queda invisible aunque esté Activo — es
 * justo el bug que hizo que los primeros 15 de prueba no aparecieran. */
async function getOnlineStorePublicationId(env: Env): Promise<string> {
  if (cachedOnlineStorePublicationId) return cachedOnlineStorePublicationId;
  const data = await adminQuery<{publications: {nodes: Array<{id: string; name: string}>}}>(
    env,
    `query { publications(first: 20) { nodes { id name } } }`,
  );
  const onlineStore = data.publications.nodes.find((p) => p.name === 'Online Store');
  if (!onlineStore) throw new Error('No se encontró el canal "Online Store" en publications.');
  cachedOnlineStorePublicationId = onlineStore.id;
  return onlineStore.id;
}

/**
 * Crea un producto nuevo en Shopify a partir de un producto de StelOrder
 * que no existía todavía en el catálogo (a diferencia de applyStockChanges
 * / applyPriceChanges, que solo tocan productos ya existentes). Se crea en
 * borrador (DRAFT) a propósito — la primera carga masiva desde un ERP
 * nuevo puede traer nombres/imágenes/precios raros, y es mejor que alguien
 * los revise en el panel de Shopify antes de que se vean en la tienda real.
 */
export async function createShopifyProduct(
  env: Env,
  input: NewProductInput,
): Promise<{productId: string; variantId: string; inventoryItemId: string}> {
  const created = await adminQuery<{
    productCreate: {
      product: {
        id: string;
        variants: {nodes: Array<{id: string; inventoryItem: {id: string}}>};
      } | null;
      userErrors: Array<{field: string[]; message: string}>;
    };
  }>(
    env,
    `mutation CreateProduct($input: ProductInput!) {
      productCreate(input: $input) {
        product {
          id
          variants(first: 1) { nodes { id inventoryItem { id } } }
        }
        userErrors { field message }
      }
    }`,
    {
      input: {
        title: input.title,
        descriptionHtml: input.descriptionHtml,
        vendor: input.vendor,
        productType: input.productType,
        ...(input.taxonomyCategoryId ? {category: input.taxonomyCategoryId} : {}),
        status: 'DRAFT',
        collectionsToJoin: [input.collectionId],
      },
    },
  );

  const userErrors = created.productCreate.userErrors;
  if (userErrors.length > 0 || !created.productCreate.product) {
    throw new Error(`productCreate: ${userErrors.map((e) => e.message).join(', ') || 'sin producto devuelto'}`);
  }

  const product = created.productCreate.product;
  const defaultVariant = product.variants.nodes[0];
  if (!defaultVariant) {
    throw new Error('productCreate no devolvió la variante por defecto.');
  }

  const updated = await adminQuery<{
    productVariantsBulkUpdate: {
      productVariants: Array<{id: string; inventoryItem: {id: string}}>;
      userErrors: Array<{field: string[]; message: string}>;
    };
  }>(
    env,
    `mutation UpdateDefaultVariant($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
        productVariants { id inventoryItem { id } }
        userErrors { field message }
      }
    }`,
    {
      productId: product.id,
      variants: [
        {
          id: defaultVariant.id,
          price: input.price.toFixed(2),
          barcode: input.barcode,
          inventoryItem: {sku: input.sku, tracked: true},
        },
      ],
    },
  );
  const variantErrors = updated.productVariantsBulkUpdate.userErrors;
  if (variantErrors.length > 0) {
    throw new Error(`productVariantsBulkUpdate: ${variantErrors.map((e) => e.message).join(', ')}`);
  }
  const variant = updated.productVariantsBulkUpdate.productVariants[0] ?? defaultVariant;

  if (input.images.length > 0) {
    try {
      await adminQuery(
        env,
        `mutation CreateMedia($productId: ID!, $media: [CreateMediaInput!]!) {
          productCreateMedia(productId: $productId, media: $media) {
            mediaUserErrors { field message }
          }
        }`,
        {
          productId: product.id,
          media: input.images.slice(0, 5).map((url) => ({
            originalSource: url,
            mediaContentType: 'IMAGE',
          })),
        },
      );
    } catch (error) {
      // No bloquea la creación del producto — se puede subir la imagen a
      // mano luego, no merece la pena tirar todo el lote por esto.
      console.error('[createShopifyProduct] media', product.id, error);
    }
  }

  // Publicar en el canal ahora (aunque el producto esté en borrador) para
  // que, en cuanto alguien lo pase a Activo desde el panel, aparezca en la
  // tienda al momento sin tener que acordarse de este paso aparte.
  try {
    const publicationId = await getOnlineStorePublicationId(env);
    const publishResult = await adminQuery<{
      publishablePublish: {userErrors: Array<{field: string[]; message: string}>};
    }>(
      env,
      `mutation Publish($id: ID!, $input: [PublicationInput!]!) {
        publishablePublish(id: $id, input: $input) {
          userErrors { field message }
        }
      }`,
      {id: product.id, input: [{publicationId}]},
    );
    const publishErrors = publishResult.publishablePublish.userErrors;
    if (publishErrors.length > 0) {
      console.error('[createShopifyProduct] publish', product.id, publishErrors);
    }
  } catch (error) {
    // Tampoco bloquea la creación — sin esto el producto simplemente no
    // aparece hasta que alguien lo publique a mano desde Shopify.
    console.error('[createShopifyProduct] publish', product.id, error);
  }

  return {productId: product.id, variantId: variant.id, inventoryItemId: variant.inventoryItem.id};
}
