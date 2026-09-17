/**
 * Genera un token PERMANENTE de Storefront API a partir del Client ID /
 * Client Secret de una app custom del Dev Dashboard de Shopify.
 *
 * Paso 1: pide un token de Admin API temporal (caduca en ~24h) via el
 *         flujo OAuth "client credentials grant".
 * Paso 2: usa ese token temporal para crear (o listar, si ya existe) un
 *         token de Storefront API permanente via la mutacion
 *         storefrontAccessTokenCreate. Ese token permanente es el que
 *         va en PUBLIC_STOREFRONT_API_TOKEN — no caduca, solo hace
 *         falta correr este script una vez.
 *
 * Uso (no guarda nada en disco, solo variables de entorno para esta
 * ejecucion):
 *
 *   SHOPIFY_STORE_DOMAIN=victor-so-professional.myshopify.com \
 *   SHOPIFY_CLIENT_ID=xxxx \
 *   SHOPIFY_CLIENT_SECRET=xxxx \
 *   node scripts/create-storefront-token.mjs
 */

const ADMIN_API_VERSION = '2025-01';

const domain = process.env.SHOPIFY_STORE_DOMAIN;
const clientId = process.env.SHOPIFY_CLIENT_ID;
const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;

if (!domain || !clientId || !clientSecret) {
  console.error(
    'Faltan variables de entorno: SHOPIFY_STORE_DOMAIN, SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET',
  );
  process.exit(1);
}

async function main() {
  // Paso 1: token de Admin API temporal via client_credentials
  const tokenRes = await fetch(`https://${domain}/admin/oauth/access_token`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
    }),
  });

  if (!tokenRes.ok) {
    console.error(
      `Error obteniendo el token de Admin API (${tokenRes.status}):`,
      await tokenRes.text(),
    );
    process.exit(1);
  }

  const {access_token: adminToken, expires_in} = await tokenRes.json();
  console.log(
    `Token de Admin API obtenido correctamente (caduca en ${Math.round(expires_in / 3600)}h).`,
  );

  // Paso 2: listar tokens existentes primero, para no crear duplicados
  // cada vez que se corra el script por error.
  const listQuery = `
    query {
      shop {
        storefrontAccessTokens(first: 10) {
          nodes { id title accessToken }
        }
      }
    }`;

  const listRes = await fetch(
    `https://${domain}/admin/api/${ADMIN_API_VERSION}/graphql.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': adminToken,
      },
      body: JSON.stringify({query: listQuery}),
    },
  );
  const listJson = await listRes.json();
  const existing = listJson.data?.shop?.storefrontAccessTokens?.nodes ?? [];
  const reuse = existing.find((t) => t.title === 'Hydrogen storefront (victorso.es)');

  if (reuse) {
    console.log('\nYa existia un token con este nombre, lo reutilizo (no se crea uno nuevo):');
    console.log(reuse.accessToken);
    console.log('\nCopialo en tu .env como:');
    console.log(`PUBLIC_STOREFRONT_API_TOKEN="${reuse.accessToken}"`);
    return;
  }

  // Paso 3: crear el token permanente de Storefront API
  const createMutation = `
    mutation CreateToken($input: StorefrontAccessTokenInput!) {
      storefrontAccessTokenCreate(input: $input) {
        storefrontAccessToken { accessToken title }
        userErrors { field message }
      }
    }`;

  const createRes = await fetch(
    `https://${domain}/admin/api/${ADMIN_API_VERSION}/graphql.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': adminToken,
      },
      body: JSON.stringify({
        query: createMutation,
        variables: {input: {title: 'Hydrogen storefront (victorso.es)'}},
      }),
    },
  );

  const createJson = await createRes.json();
  const result = createJson.data?.storefrontAccessTokenCreate;

  if (!result || result.userErrors?.length) {
    console.error(
      'Error creando el token de Storefront API:',
      JSON.stringify(createJson, null, 2),
    );
    process.exit(1);
  }

  console.log('\nToken de Storefront API (permanente) creado correctamente:');
  console.log(result.storefrontAccessToken.accessToken);
  console.log('\nCopialo en tu .env como:');
  console.log(`PUBLIC_STOREFRONT_API_TOKEN="${result.storefrontAccessToken.accessToken}"`);
}

main().catch((err) => {
  console.error('Error inesperado:', err);
  process.exit(1);
});
