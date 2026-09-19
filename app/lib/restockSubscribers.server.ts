import {adminQuery} from '~/lib/shopifyAdmin.server';

const METAFIELD_NAMESPACE = 'restock';
const METAFIELD_KEY = 'subscribers';

/** Lista de emails en espera de aviso de restock para un producto (por su gid). */
export async function getRestockSubscribers(env: Env, productId: string): Promise<string[]> {
  const data = await adminQuery<{
    product: {metafield: {value: string} | null} | null;
  }>(
    env,
    // Nota: sin el comentario "#graphql" a propósito — esta consulta va
    // contra el esquema de la Admin API, no el de Storefront, y el
    // codegen de Hydrogen solo sabe validar/tipar el de Storefront.
    `query RestockSubscribers($id: ID!, $namespace: String!, $key: String!) {
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
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

export async function setRestockSubscribers(
  env: Env,
  productId: string,
  emails: string[],
): Promise<void> {
  await adminQuery(
    env,
    `mutation SetRestockSubscribers($metafields: [MetafieldsSetInput!]!) {
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
          value: JSON.stringify(emails),
        },
      ],
    },
  );
}

/** Añade un email a la lista de espera de un producto (sin duplicar). */
export async function addRestockSubscriber(
  env: Env,
  productId: string,
  email: string,
): Promise<void> {
  const existing = await getRestockSubscribers(env, productId);
  const normalized = email.trim().toLowerCase();
  if (existing.includes(normalized)) return;
  await setRestockSubscribers(env, productId, [...existing, normalized]);
}
