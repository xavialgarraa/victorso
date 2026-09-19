import type {Route} from './+types/webhooks.products-update';
import {getRestockSubscribers, setRestockSubscribers} from '~/lib/restockSubscribers.server';
import {sendRestockEmail} from '~/lib/email.server';

/**
 * Webhook de Shopify (topic `products/update`) — se registra apuntando a
 * https://<dominio-de-la-tienda>/webhooks/products-update una vez esté
 * desplegada. Cada vez que un producto cambia (precio, stock, lo que sea),
 * si alguna de sus variantes tiene ahora stock, avisamos a los suscriptores
 * en espera de ese producto y vaciamos la lista. Como la lista solo tiene
 * contenido cuando hay gente esperando, es seguro que este webhook se
 * dispare por cambios que no son de stock: no hace nada si no hay nadie
 * en espera.
 */
export async function action({request, context}: Route.ActionArgs) {
  const rawBody = await request.text();

  const isValid = await verifyShopifyWebhook(
    request,
    rawBody,
    context.env.SHOPIFY_WEBHOOK_SECRET,
  );
  if (!isValid) {
    return new Response('Invalid signature', {status: 401});
  }

  const payload = JSON.parse(rawBody) as {
    id: number;
    title: string;
    handle: string;
    variants?: Array<{inventory_quantity?: number}>;
  };

  const hasStock = (payload.variants ?? []).some((v) => (v.inventory_quantity ?? 0) > 0);
  if (!hasStock) {
    return new Response('ok', {status: 200});
  }

  const productId = `gid://shopify/Product/${payload.id}`;
  const subscribers = await getRestockSubscribers(context.env, productId);
  if (subscribers.length === 0) {
    return new Response('ok', {status: 200});
  }

  const productUrl = `https://${context.env.PUBLIC_STORE_DOMAIN}/products/${payload.handle}`;
  await Promise.all(
    subscribers.map((email) =>
      sendRestockEmail(context.env, {to: email, productTitle: payload.title, productUrl}),
    ),
  );
  await setRestockSubscribers(context.env, productId, []);

  return new Response('ok', {status: 200});
}

async function verifyShopifyWebhook(
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
