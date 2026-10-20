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
    ['verify'],
  );

  let signatureBytes: Uint8Array;
  try {
    const binary = atob(hmacHeader);
    signatureBytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) signatureBytes[i] = binary.charCodeAt(i);
  } catch {
    return false;
  }

  // crypto.subtle.verify hace la comparación en tiempo constante, a
  // diferencia de comparar dos strings con === (vulnerable a timing attack).
  return crypto.subtle.verify(
    'HMAC',
    key,
    signatureBytes as BufferSource,
    new TextEncoder().encode(rawBody),
  );
}
