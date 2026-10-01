import type {Route} from './+types/api.sync-trigger';
import {fetchWalkasseFeed} from '~/lib/connectors/walkasse.server';
import {buildSyncSummary, summaryToRunDetails, walkasseToSupplierRows} from '~/lib/connectors/sync.server';
import {listSuppliers, logSyncRun, resolveFeedUrl} from '~/lib/connectors/suppliers.server';
import {applyStockChanges, getPrimaryLocationId, getShopifyCatalogByBarcode} from '~/lib/shopifyProducts.server';
import {applyStelOrderCreations, buildStelOrderSyncSummary} from '~/lib/connectors/stelorderSync.server';
import {safeCompare} from '~/lib/safeCompare.server';

/**
 * StelOrder no tiene "supplier" en Firestore (no es un feed por URL como
 * Walkasse) — se activa automáticamente si hay STELORDER_API_KEY. Actualiza
 * stock de lo que ya existe, y CREA en Shopify (siempre en borrador) lo que
 * Victor haya marcado "web" en StelOrder desde la última vez — así no hace
 * falta entrar al panel cada vez que marca algo nuevo. Solo se limita a
 * STELORDER_CREATE_BATCH_SIZE por ejecución (igual que el botón manual del
 * panel), para no pasarse del límite de tiempo de un request; si marca más
 * de las que caben en una pasada, el resto se crean en la siguiente.
 */
async function runStelOrderAutoSync(env: Env) {
  const summary = await buildStelOrderSyncSummary(env);
  const locationId = await getPrimaryLocationId(env);
  const changes = summary.toUpdateStock.map((r) => ({
    inventoryItemId: r.catalogVariant.inventoryItemId,
    quantity: r.stockTo,
  }));
  const stockResult = await applyStockChanges(env, locationId, changes);
  const creationResult = await applyStelOrderCreations(env, summary.toCreate);
  return {summary, stockResult, creationResult};
}

/**
 * Endpoint pensado para que lo llame un cron EXTERNO (Oxygen no soporta
 * cron jobs — ver el Cloudflare Worker de ejemplo que arma esto solo).
 * Nunca aplica cambios de PRECIO — se quedan siempre pendientes de que
 * alguien los confirme a mano en el panel (/admin-interno/proveedores,
 * /admin-interno/stelorder), aunque este endpoint los detecte. El stock sí
 * se aplica solo, y para StelOrder también se crean automáticamente (en
 * borrador) los productos nuevos marcados "web".
 *
 * Protegido por un secreto compartido (no por sesión de Firebase, porque
 * quien llama aquí es una máquina, no una persona con navegador).
 */
export async function action({request, context}: Route.ActionArgs) {
  const authHeader = request.headers.get('Authorization') || '';
  const expected = `Bearer ${context.env.SYNC_TRIGGER_SECRET || ''}`;
  if (!context.env.SYNC_TRIGGER_SECRET || !safeCompare(authHeader, expected)) {
    throw new Response('No autorizado', {status: 401});
  }

  const suppliers = await listSuppliers(context.env);
  const results: Array<Record<string, unknown>> = [];

  if (context.env.STELORDER_API_KEY) {
    const startedAt = new Date().toISOString();
    try {
      const {summary, stockResult, creationResult} = await runStelOrderAutoSync(context.env);
      await logSyncRun(context.env, {
        supplierId: 'stelorder',
        supplierName: 'StelOrder',
        type: 'auto-apply',
        triggeredBy: 'cron',
        startedAt,
        finishedAt: new Date().toISOString(),
        totalFeedRows: summary.totalEligible,
        matchedCount: summary.toUpdateStock.length + summary.priceChanges.length + summary.unchanged,
        changedCount: summary.toUpdateStock.length + creationResult.created,
        unmatchedCount: Math.max(0, summary.toCreate.length - creationResult.created),
        stockApplied: stockResult.applied,
        priceApplied: 0,
        pendingPriceChanges: summary.priceChanges.length,
        errors: [...stockResult.errors, ...creationResult.errors.map((e) => `${e.name}: ${e.message}`)],
      });
      results.push({
        id: 'stelorder',
        ok: true,
        stockApplied: stockResult.applied,
        created: creationResult.created,
        pendingNewProducts: Math.max(0, summary.toCreate.length - creationResult.created),
        pendingPriceChanges: summary.priceChanges.length,
        errors: [...stockResult.errors, ...creationResult.errors.map((e) => `${e.name}: ${e.message}`)],
      });
    } catch (error) {
      console.error('[api/sync-trigger] stelorder', error);
      results.push({id: 'stelorder', ok: false, error: error instanceof Error ? error.message : 'Error desconocido.'});
    }
  }

  for (const {id, config} of suppliers) {
    if (!config.active) {
      results.push({id, skipped: true, reason: 'Proveedor inactivo.'});
      continue;
    }
    // Solo hay conector real para Walkasse hoy — ver connectors/walkasse.server.ts.
    if (id !== 'walkasse') {
      results.push({id, skipped: true, reason: 'Sin conector automático implementado para este proveedor.'});
      continue;
    }

    const startedAt = new Date().toISOString();
    try {
      const feedUrl = resolveFeedUrl(config);
      const [feed, catalog] = await Promise.all([
        fetchWalkasseFeed(feedUrl),
        getShopifyCatalogByBarcode(context.env),
      ]);
      const summary = buildSyncSummary(walkasseToSupplierRows(feed), catalog, ['walkasse']);
      const locationId = await getPrimaryLocationId(context.env);

      const stockChanges = summary.rows
        .filter((r) => r.status === 'matched' && r.changes.stock)
        .map((r) => {
          const row = r as Extract<typeof r, {status: 'matched'}>;
          return {inventoryItemId: row.inventoryItemId, quantity: row.changes.stock!.to};
        });
      const pendingPriceChanges = summary.rows.filter(
        (r) => r.status === 'matched' && r.changes.price,
      ).length;

      const stockResult = await applyStockChanges(context.env, locationId, stockChanges);

      await logSyncRun(context.env, {
        supplierId: id,
        supplierName: config.name,
        type: 'auto-apply',
        triggeredBy: 'cron',
        startedAt,
        finishedAt: new Date().toISOString(),
        totalFeedRows: summary.totalFeedRows,
        matchedCount: summary.matchedCount,
        changedCount: summary.changedCount,
        unmatchedCount: summary.unmatchedCount,
        stockApplied: stockResult.applied,
        priceApplied: 0,
        pendingPriceChanges,
        errors: stockResult.errors,
        details: summaryToRunDetails(summary),
      });

      results.push({
        id,
        ok: true,
        stockApplied: stockResult.applied,
        pendingPriceChanges,
        errors: stockResult.errors,
      });
    } catch (error) {
      console.error('[api/sync-trigger]', id, error);
      results.push({id, ok: false, error: error instanceof Error ? error.message : 'Error desconocido.'});
    }
  }

  return Response.json({results});
}
