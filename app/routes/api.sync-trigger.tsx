import type {Route} from './+types/api.sync-trigger';
import {fetchWalkasseFeed} from '~/lib/connectors/walkasse.server';
import {buildSyncSummary, summaryToRunDetails, walkasseToSupplierRows} from '~/lib/connectors/sync.server';
import {listSuppliers, logSyncRun, resolveFeedUrl} from '~/lib/connectors/suppliers.server';
import {applyStockChanges, getPrimaryLocationId, getShopifyCatalogByBarcode} from '~/lib/shopifyProducts.server';
import {safeCompare} from '~/lib/safeCompare.server';

/**
 * Endpoint pensado para que lo llame un cron EXTERNO (Oxygen no soporta
 * cron jobs — ver el Cloudflare Worker de ejemplo que arma esto solo).
 * Solo actualiza STOCK, nunca precio — los cambios de precio se quedan
 * siempre pendientes de que alguien los confirme a mano en el panel
 * (/admin-interno/proveedores), aunque este endpoint los detecte.
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
      const summary = buildSyncSummary(walkasseToSupplierRows(feed), catalog);
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
