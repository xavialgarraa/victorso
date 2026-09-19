const ADMIN_API_VERSION = '2025-01';

type AdminGraphQLResponse<T> = {
  data?: T;
  errors?: Array<{message: string}>;
};

/** Cliente minimo para la Admin API de Shopify (GraphQL). Requiere
 * `SHOPIFY_ADMIN_API_TOKEN` en las variables de entorno. */
export async function adminQuery<T>(
  env: Env,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  if (!env.SHOPIFY_ADMIN_API_TOKEN) {
    throw new Error(
      'SHOPIFY_ADMIN_API_TOKEN no está configurado. Crea una app custom en ' +
        'Shopify Admin (Apps y canales de venta > Desarrollar apps) con ' +
        'permiso de lectura/escritura de Productos y añade el token al .env.',
    );
  }

  const endpoint = `https://${env.PUBLIC_STORE_DOMAIN}/admin/api/${ADMIN_API_VERSION}/graphql.json`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': env.SHOPIFY_ADMIN_API_TOKEN,
    },
    body: JSON.stringify({query, variables}),
  });

  const json = (await response.json()) as AdminGraphQLResponse<T>;

  if (json.errors?.length) {
    throw new Error(`Admin API error: ${json.errors.map((e) => e.message).join(', ')}`);
  }
  if (!json.data) {
    throw new Error('Admin API: respuesta sin datos.');
  }

  return json.data;
}
