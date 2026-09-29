import {Form, data, useActionData, useLoaderData, useNavigation} from 'react-router';
import type {Route} from './+types/admin-interno.stelorder';
import {requireAdminUser} from '~/lib/adminSession.server';
import {AdminShell} from '~/components/admin/AdminShell';
import {
  applyStelOrderCreations,
  buildStelOrderSyncSummary,
  type StelOrderSyncSummary,
} from '~/lib/connectors/stelorderSync.server';
import {applyStockChanges, getPrimaryLocationId} from '~/lib/shopifyProducts.server';

export const meta: Route.MetaFunction = () => {
  return [{title: 'StelOrder — Panel interno'}];
};

export async function loader({request, context}: Route.LoaderArgs) {
  const {user, headers} = await requireAdminUser(request, context.env);
  return data({user}, {headers});
}

type ActionResult =
  | {intent: 'sync'; ok: true; summary: StelOrderSyncSummary}
  | {intent: 'sync'; ok: false; error: string}
  | {intent: 'create-batch'; ok: true; created: number; errors: Array<{name: string; message: string}>; remaining: number}
  | {intent: 'create-batch'; ok: false; error: string}
  | {intent: 'update-stock'; ok: true; applied: number; errors: string[]}
  | {intent: 'update-stock'; ok: false; error: string};

export async function action({request, context}: Route.ActionArgs) {
  const {headers} = await requireAdminUser(request, context.env);
  const formData = await request.formData();
  const intent = String(formData.get('intent') || '');

  if (intent === 'sync') {
    try {
      const summary = await buildStelOrderSyncSummary(context.env);
      return data<ActionResult>({intent: 'sync', ok: true, summary}, {headers});
    } catch (error) {
      console.error('[admin-interno/stelorder] sync', error);
      return data<ActionResult>(
        {intent: 'sync', ok: false, error: error instanceof Error ? error.message : 'Error desconocido.'},
        {headers},
      );
    }
  }

  if (intent === 'create-batch') {
    try {
      const summary = await buildStelOrderSyncSummary(context.env);
      const result = await applyStelOrderCreations(context.env, summary.toCreate);
      return data<ActionResult>(
        {
          intent: 'create-batch',
          ok: true,
          created: result.created,
          errors: result.errors,
          remaining: Math.max(0, summary.toCreate.length - result.created),
        },
        {headers},
      );
    } catch (error) {
      console.error('[admin-interno/stelorder] create-batch', error);
      return data<ActionResult>(
        {intent: 'create-batch', ok: false, error: error instanceof Error ? error.message : 'Error desconocido.'},
        {headers},
      );
    }
  }

  if (intent === 'update-stock') {
    try {
      const summary = await buildStelOrderSyncSummary(context.env);
      const locationId = await getPrimaryLocationId(context.env);
      const changes = summary.toUpdateStock.map((r) => ({
        inventoryItemId: r.catalogVariant.inventoryItemId,
        quantity: r.stockTo,
      }));
      const result = await applyStockChanges(context.env, locationId, changes);
      return data<ActionResult>({intent: 'update-stock', ok: true, applied: result.applied, errors: result.errors}, {headers});
    } catch (error) {
      console.error('[admin-interno/stelorder] update-stock', error);
      return data<ActionResult>(
        {intent: 'update-stock', ok: false, error: error instanceof Error ? error.message : 'Error desconocido.'},
        {headers},
      );
    }
  }

  return data<ActionResult>({intent: 'sync', ok: false, error: 'Acción no reconocida.'}, {headers});
}

export default function AdminStelOrder() {
  const {user} = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isBusy = navigation.state !== 'idle';
  const busyIntent = navigation.formData?.get('intent');

  const summary = actionData?.intent === 'sync' && actionData.ok ? actionData.summary : null;
  const syncError = actionData?.intent === 'sync' && !actionData.ok ? actionData.error : null;
  const createResult = actionData?.intent === 'create-batch' ? actionData : null;
  const updateResult = actionData?.intent === 'update-stock' ? actionData : null;

  return (
    <AdminShell user={user}>
      <h1>StelOrder</h1>
      <p style={{color: '#6b6b73', fontSize: '.9rem', maxWidth: 640}}>
        A diferencia de los demás proveedores, StelOrder puede traer productos que{' '}
        <strong>no existen todavía</strong> en la tienda — hay que crearlos, no solo actualizar stock. Solo se
        sincronizan los productos que Victor marca a mano en StelOrder: escribiendo{' '}
        <strong>"web"</strong> en el comentario privado del producto. Además necesitan código de barras (para
        poder cruzarlos sin duplicar). La categoría real (Sonido, DJ, Iluminación...) la decide la IA leyendo el
        nombre — las categorías propias de StelOrder son por marca, y se usan como marca (vendor) del producto,
        no como su categoría. La descripción también la revisa la IA en español (traduce/pule la de StelOrder si
        existe, sin inventar datos técnicos nuevos; si no hay ninguna, la genera desde cero).
      </p>

      <div className="admin-card">
        <Form method="post">
          <input type="hidden" name="intent" value="sync" />
          <button type="submit" className="admin-btn admin-btn--primary" disabled={isBusy}>
            {isBusy && busyIntent === 'sync' ? 'Comparando…' : 'Comparar con Shopify'}
          </button>
        </Form>

        {syncError && <p className="admin-msg--error">{syncError}</p>}

        {summary && (
          <div style={{marginTop: 20}}>
            <div className="admin-stats">
              <div className="admin-stat">
                <span className="admin-stat__value">{summary.totalEligible}</span>
                <span className="admin-stat__label">Marcados "web" en StelOrder</span>
              </div>
              <div className="admin-stat">
                <span className="admin-stat__value">{summary.toCreate.length}</span>
                <span className="admin-stat__label">Por crear en Shopify</span>
              </div>
              <div className="admin-stat">
                <span className="admin-stat__value">{summary.toUpdateStock.length}</span>
                <span className="admin-stat__label">Ya existen, stock distinto</span>
              </div>
              <div className="admin-stat">
                <span className="admin-stat__value">{summary.priceChanges.length}</span>
                <span className="admin-stat__label">Precio distinto (pendiente)</span>
              </div>
              <div className="admin-stat">
                <span className="admin-stat__value">{summary.unchanged}</span>
                <span className="admin-stat__label">Sin cambios</span>
              </div>
            </div>

            <h3 style={{marginTop: 20}}>Por categoría real (asignada por IA)</h3>
            <ul style={{fontSize: '.85rem', paddingLeft: 20}}>
              {Object.entries(summary.byCategory)
                .sort((a, b) => b[1] - a[1])
                .map(([cat, count]) => (
                  <li key={cat}>
                    {cat}: {count}
                  </li>
                ))}
            </ul>

            {summary.toUpdateStock.length > 0 && (
              <>
                <h3 style={{marginTop: 20}}>Actualizar stock ({summary.toUpdateStock.length})</h3>
                <div className="admin-scroll" style={{maxHeight: 240}}>
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Producto</th>
                        <th>Stock</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.toUpdateStock.slice(0, 200).map((r) => (
                        <tr key={r.product.barcode}>
                          <td>{r.catalogVariant.title}</td>
                          <td>
                            {r.stockFrom} → {r.stockTo}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Form method="post" style={{marginTop: 12}}>
                  <input type="hidden" name="intent" value="update-stock" />
                  <button type="submit" className="admin-btn admin-btn--outline" disabled={isBusy}>
                    {isBusy && busyIntent === 'update-stock' ? 'Actualizando…' : `Actualizar stock de ${summary.toUpdateStock.length} productos`}
                  </button>
                </Form>
              </>
            )}

            {summary.priceChanges.length > 0 && (
              <>
                <h3 style={{marginTop: 24}}>Cambios de precio detectados ({summary.priceChanges.length})</h3>
                <p className="admin-hint" style={{maxWidth: 600}}>
                  Solo informativo — <strong>nunca se aplican solos</strong>, hay que cambiarlos a mano en la
                  ficha del producto en Shopify si corresponde. <strong>Ojo:</strong> esto compara el{' '}
                  <code>sales-price</code> de StelOrder contra el precio actual en Shopify — si le has puesto una
                  oferta/promoción directamente en Shopify, también saldrá aquí como "cambio", aunque no sea un
                  cambio de coste real en StelOrder. No hay forma automática de distinguir los dos casos:
                  revisa cada uno antes de tocar nada.
                </p>
                <div className="admin-scroll" style={{maxHeight: 240}}>
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Producto</th>
                        <th>Precio</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.priceChanges.slice(0, 200).map((r) => (
                        <tr key={r.product.barcode} style={r.priceWarning ? {background: '#fdf6e3'} : undefined}>
                          <td>{r.catalogVariant.title}</td>
                          <td>
                            {r.priceFrom.toFixed(2)}€ → {r.priceTo.toFixed(2)}€
                            {r.priceWarning && (
                              <div style={{color: '#a15c00', fontSize: '.78rem', marginTop: 2}}>⚠ {r.priceWarning}</div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {summary.toCreate.length > 0 && (
              <>
                <h3 style={{marginTop: 24}}>Crear productos nuevos ({summary.toCreate.length})</h3>
                <p className="admin-hint" style={{maxWidth: 600}}>
                  El cron diario ya crea estos automáticamente (siempre en <strong>borrador</strong>, no
                  visibles en la tienda hasta que los actives a mano) — este botón es solo para no esperar al
                  cron, por ejemplo para probar algo ahora mismo. Cada clic crea un lote pequeño (para no
                  exceder el límite de tiempo de un request) — hay que darle varias veces hasta que no quede
                  nada por crear.
                </p>
                <div className="admin-scroll" style={{maxHeight: 240}}>
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Producto</th>
                        <th>Categoría</th>
                        <th>Precio</th>
                        <th>Stock</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.toCreate.slice(0, 200).map((r) => (
                        <tr key={r.product.barcode}>
                          <td>{r.product.name}</td>
                          <td>{r.category}</td>
                          <td>{r.product.salesPrice.toFixed(2)}€</td>
                          <td>{r.product.realStock}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Form method="post" style={{marginTop: 12}}>
                  <input type="hidden" name="intent" value="create-batch" />
                  <button type="submit" className="admin-btn admin-btn--primary" disabled={isBusy}>
                    {isBusy && busyIntent === 'create-batch' ? 'Creando…' : 'Crear siguiente lote'}
                  </button>
                </Form>
              </>
            )}
          </div>
        )}

        {createResult && (
          <div style={{marginTop: 16}}>
            {createResult.ok ? (
              <div className="admin-msg--ok">
                Creados: {createResult.created}. Quedan {createResult.remaining} por crear — vuelve a darle a
                "Comparar con Shopify" y luego "Crear siguiente lote" para seguir.
                {createResult.errors.length > 0 && (
                  <div style={{marginTop: 6}}>
                    {createResult.errors.length} errores: {createResult.errors.slice(0, 5).map((e) => `${e.name}: ${e.message}`).join(' · ')}
                  </div>
                )}
              </div>
            ) : (
              <p className="admin-msg--error">{createResult.error}</p>
            )}
          </div>
        )}

        {updateResult && (
          <div style={{marginTop: 16}}>
            {updateResult.ok ? (
              <div className="admin-msg--ok">
                Stock actualizado en {updateResult.applied} lotes.
                {updateResult.errors.length > 0 && (
                  <div style={{marginTop: 6}}>{updateResult.errors.length} errores: {updateResult.errors.slice(0, 5).join(' · ')}</div>
                )}
              </div>
            ) : (
              <p className="admin-msg--error">{updateResult.error}</p>
            )}
          </div>
        )}
      </div>
    </AdminShell>
  );
}
