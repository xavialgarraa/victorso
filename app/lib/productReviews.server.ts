import {adminQuery} from '~/lib/shopifyAdmin.server';

const METAFIELD_NAMESPACE = 'reviews';
const METAFIELD_KEY = 'reviews';
const PENDING_KEY = 'pending';

export type ReviewStatus = 'pending' | 'approved';

export type Review = {
  id: string;
  name: string;
  rating: number;
  comment: string;
  createdAt: string;
  status: ReviewStatus;
};

/** Entrada ligera en la cola global de moderación (metafield del Shop),
 * para no tener que escanear todos los productos al listar pendientes. */
export type PendingEntry = {
  reviewId: string;
  productId: string;
  productHandle: string;
  productTitle: string;
  name: string;
  rating: number;
  comment: string;
  createdAt: string;
};

let cachedShopId: string | null = null;

async function getShopId(env: Env): Promise<string> {
  if (cachedShopId) return cachedShopId;
  const data = await adminQuery<{shop: {id: string}}>(env, `query ShopId { shop { id } }`);
  cachedShopId = data.shop.id;
  return cachedShopId;
}

/** Todas las reseñas guardadas de un producto (por su gid), incluidas las pendientes. */
async function getAllReviews(env: Env, productId: string): Promise<Review[]> {
  const data = await adminQuery<{
    product: {metafield: {value: string} | null} | null;
  }>(
    env,
    // Nota: sin el comentario "#graphql" a propósito — esta consulta va
    // contra el esquema de la Admin API, no el de Storefront, y el
    // codegen de Hydrogen solo sabe validar/tipar el de Storefront.
    `query ProductReviews($id: ID!, $namespace: String!, $key: String!) {
      product(id: $id) {
        metafield(namespace: $namespace, key: $key) {
          value
        }
      }
    }`,
    {id: productId, namespace: METAFIELD_NAMESPACE, key: METAFIELD_KEY},
  );

  const raw = data.product?.metafield?.value;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Review[]) : [];
  } catch {
    return [];
  }
}

/** Reseñas aprobadas de un producto, para mostrar en la ficha pública. */
export async function getReviews(env: Env, productId: string): Promise<Review[]> {
  const all = await getAllReviews(env, productId);
  return all.filter((r) => r.status === 'approved');
}

async function setReviews(env: Env, productId: string, reviews: Review[]): Promise<void> {
  await adminQuery(
    env,
    `mutation SetProductReviews($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        userErrors { field message }
      }
    }`,
    {
      metafields: [
        {
          ownerId: productId,
          namespace: METAFIELD_NAMESPACE,
          key: METAFIELD_KEY,
          type: 'json',
          value: JSON.stringify(reviews),
        },
      ],
    },
  );
}

async function getPendingQueue(env: Env): Promise<PendingEntry[]> {
  const data = await adminQuery<{shop: {metafield: {value: string} | null}}>(
    env,
    // "shop" es un singleton: no admite argumento id, a diferencia de "product".
    `query PendingReviews($namespace: String!, $key: String!) {
      shop {
        metafield(namespace: $namespace, key: $key) {
          value
        }
      }
    }`,
    {namespace: METAFIELD_NAMESPACE, key: PENDING_KEY},
  );
  const raw = data.shop.metafield?.value;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PendingEntry[]) : [];
  } catch {
    return [];
  }
}

async function setPendingQueue(env: Env, queue: PendingEntry[]): Promise<void> {
  const shopId = await getShopId(env);
  await adminQuery(
    env,
    `mutation SetPendingReviews($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        userErrors { field message }
      }
    }`,
    {
      metafields: [
        {
          ownerId: shopId,
          namespace: METAFIELD_NAMESPACE,
          key: PENDING_KEY,
          type: 'json',
          value: JSON.stringify(queue),
        },
      ],
    },
  );
}

/** Lista de reseñas pendientes de moderación, de todos los productos. */
export async function getPendingReviews(env: Env): Promise<PendingEntry[]> {
  return getPendingQueue(env);
}

/** Añade una reseña nueva como pendiente de aprobación. */
export async function addReview(
  env: Env,
  product: {id: string; handle: string; title: string},
  review: {name: string; rating: number; comment: string},
): Promise<void> {
  const existing = await getAllReviews(env, product.id);
  const newReview: Review = {
    id: crypto.randomUUID(),
    name: review.name,
    rating: review.rating,
    comment: review.comment,
    createdAt: new Date().toISOString(),
    status: 'pending',
  };
  await setReviews(env, product.id, [newReview, ...existing]);

  const queue = await getPendingQueue(env);
  queue.unshift({
    reviewId: newReview.id,
    productId: product.id,
    productHandle: product.handle,
    productTitle: product.title,
    name: newReview.name,
    rating: newReview.rating,
    comment: newReview.comment,
    createdAt: newReview.createdAt,
  });
  await setPendingQueue(env, queue);
}

async function removeFromPendingQueue(env: Env, reviewId: string): Promise<void> {
  const queue = await getPendingQueue(env);
  await setPendingQueue(env, queue.filter((entry) => entry.reviewId !== reviewId));
}

/** Aprueba una reseña pendiente: pasa a visible en la ficha del producto. */
export async function approveReview(env: Env, productId: string, reviewId: string): Promise<void> {
  const all = await getAllReviews(env, productId);
  const updated = all.map((r) => (r.id === reviewId ? {...r, status: 'approved' as const} : r));
  await setReviews(env, productId, updated);
  await removeFromPendingQueue(env, reviewId);
}

/** Rechaza (elimina) una reseña pendiente. */
export async function rejectReview(env: Env, productId: string, reviewId: string): Promise<void> {
  const all = await getAllReviews(env, productId);
  await setReviews(env, productId, all.filter((r) => r.id !== reviewId));
  await removeFromPendingQueue(env, reviewId);
}
