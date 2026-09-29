import type {Route} from './+types/webhooks.inventory-levels-update';
import {verifyShopifyWebhook} from '~/lib/shopifyWebhook.server';
import {adminQuery} from '~/lib/shopifyAdmin.server';
import {findStelOrderProductByReference, setStelOrderStock} from '~/lib/connectors/stelorder.server';

/**
 * Webhook de Shopify (topic `inventory_levels/update`) — registrado
 * apuntando a https://victorso.es/webhooks/inventory-levels-update.
 *
 * Se eligió este topic en vez de `orders/paid` porque Shopify bloquea
 * CUALQUIER acceso a datos de pedidos (ni siquiera lectura por API) para
 * esta app hasta completar su proceso de aprobación de "datos protegidos
 * del cliente" — un trámite de cumplimiento, no algo activable al momento.
 * `inventory_levels/update` no toca datos de clientes/pedidos, así que no
 * tiene esa restricción, y de paso sirve igual: se dispara con cualquier
 * cambio de disponibilidad (venta en la web, venta en TPV, o un ajuste
 * manual en Shopify), no solo ventas online.
 *
 * En vez de calcular un descuento, se refleja el valor "available" que
 * manda Shopify tal cual en `real-stock` de StelOrder — es un espejo
 * directo, no una resta, así que es seguro aunque este webhook se dispare
 * también por los propios cambios que hace nuestro cron StelOrder→Shopify
 * (escribir el mismo número que ya había no rompe nada).
 */

type InventoryLevelPayload = {
  inventory_item_id: number;
  location_id: number;
  available: number;
};

export async function action({request, context}: Route.ActionArgs) {
  const rawBody = await request.text();

  const isValid = await verifyShopifyWebhook(request, rawBody, context.env.SHOPIFY_WEBHOOK_SECRET);
  if (!isValid) {
    return new Response('Invalid signature', {status: 401});
  }

  if (!context.env.STELORDER_API_KEY) {
    return new Response('ok (StelOrder no configurado)', {status: 200});
  }

  const payload = JSON.parse(rawBody) as InventoryLevelPayload;

  try {
    const data = await adminQuery<{inventoryItem: {sku: string | null} | null}>(
      context.env,
      `query($id: ID!) { inventoryItem(id: $id) { sku } }`,
      {id: `gid://shopify/InventoryItem/${payload.inventory_item_id}`},
    );
    const sku = data.inventoryItem?.sku;
    if (!sku) return new Response('ok (sin sku)', {status: 200});

    const product = await findStelOrderProductByReference(context.env.STELORDER_API_KEY, sku);
    if (!product) {
      // No es un SKU de StelOrder (Walkasse o nativo de la tienda) — no
      // le corresponde a este conector tocarlo.
      return new Response('ok (no es de StelOrder)', {status: 200});
    }

    await setStelOrderStock(context.env.STELORDER_API_KEY, product.id, payload.available);
  } catch (error) {
    console.error('[webhooks/inventory-levels-update]', payload.inventory_item_id, error);
    // 200 igualmente: Shopify reintenta agresivamente los webhooks que
    // devuelven error, y un fallo puntual de StelOrder no debería generar
    // una tormenta de reintentos.
  }

  return new Response('ok', {status: 200});
}
