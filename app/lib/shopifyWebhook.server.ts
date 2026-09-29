/** Verifica la firma HMAC de un webhook de Shopify contra el body crudo
 * (sin parsear) de la petición, usando el "Client secret" de la app
 * (SHOPIFY_WEBHOOK_SECRET). Compartido por todos los webhooks registrados. */
export async function verifyShopifyWebhook(
  request: Request,
  rawBody: string,
  secret?: string,
): Promise<boolean> {
  if (!secret) return false;

  const hmacHeader = request.headers.get('X-Shopify-Hmac-Sha256');
  if (!hmacHeader) return false;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    {name: 'HMAC', hash: 'SHA-256'},
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  const computedHmac = btoa(String.fromCharCode(...new Uint8Array(signature)));

  return computedHmac === hmacHeader;
}
