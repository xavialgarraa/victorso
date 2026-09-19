const ADMIN_API_VERSION = '2025-01';

type AdminGraphQLResponse<T> = {
  data?: T;
  errors?: Array<{message: string}>;
};

// Cache en memoria del proceso (vive mientras el worker esté "caliente").
// El token client_credentials dura ~24h; lo renovamos un poco antes de
// que caduque para no arriesgarnos a que expire a mitad de una petición.
let cachedToken: {accessToken: string; expiresAt: number} | null = null;

async function getAdminAccessToken(env: Env): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.accessToken;
  }

  if (!env.SHOPIFY_ADMIN_CLIENT_ID || !env.SHOPIFY_ADMIN_CLIENT_SECRET) {
    throw new Error(
      'Faltan SHOPIFY_ADMIN_CLIENT_ID / SHOPIFY_ADMIN_CLIENT_SECRET. Son el ' +
        'Client ID y Client Secret de la app custom del Dev Dashboard (Shopify ' +
        'Admin > Apps y canales de venta > Desarrollar apps).',
    );
  }

  const response = await fetch(`https://${env.PUBLIC_STORE_DOMAIN}/admin/oauth/access_token`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      client_id: env.SHOPIFY_ADMIN_CLIENT_ID,
      client_secret: env.SHOPIFY_ADMIN_CLIENT_SECRET,
      grant_type: 'client_credentials',
    }),
  });

  if (!response.ok) {
    throw new Error(`No se pudo obtener el token de Admin API (${response.status}).`);
  }

  const tokenResponse = (await response.json()) as {
    access_token: string;
    expires_in: number;
  };

  cachedToken = {
    accessToken: tokenResponse.access_token,
    // Renovamos 5 minutos antes de que caduque de verdad.
    expiresAt: Date.now() + (tokenResponse.expires_in - 300) * 1000,
  };

  return cachedToken.accessToken;
}

/** Cliente minimo para la Admin API de Shopify (GraphQL). Obtiene y
 * renueva el token automáticamente a partir de SHOPIFY_ADMIN_CLIENT_ID /
 * SHOPIFY_ADMIN_CLIENT_SECRET. */
export async function adminQuery<T>(
  env: Env,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T> {
  const accessToken = await getAdminAccessToken(env);
  const endpoint = `https://${env.PUBLIC_STORE_DOMAIN}/admin/api/${ADMIN_API_VERSION}/graphql.json`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': accessToken,
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
