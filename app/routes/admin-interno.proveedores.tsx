import {Form, data, useActionData, useLoaderData, useNavigation} from 'react-router';
import type {Route} from './+types/admin-interno.proveedores';
import {requireAdminUser} from '~/lib/adminSession.server';
import {AdminShell} from '~/components/admin/AdminShell';
import {fetchWalkasseFeed} from '~/lib/connectors/walkasse.server';
import {
  buildSyncSummary,
  summaryToRunDetails,
  walkasseToSupplierRows,
  type SyncSummary,
} from '~/lib/connectors/sync.server';
import {syncRunLabel} from '~/lib/syncRunLabel';
import {
  deleteSupplier,
  getSupplier,
  listRecentSyncRuns,
  listSuppliers,
  logSyncRun,
  resolveFeedUrl,
  saveSupplier,
  type SupplierConfig,
} from '~/lib/connectors/suppliers.server';
import {
  applyPriceChanges,
  applyStockChanges,
  getPrimaryLocationId,
  getShopifyCatalogByBarcode,
} from '~/lib/shopifyProducts.server';

export const meta: Route.MetaFunction = () => {
  return [{title: 'Proveedores — Panel interno'}];
};

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export async function loader({request, context}: Route.LoaderArgs) {
  const {user, headers} = await requireAdminUser(request, context.env);
  const [suppliers, recentRuns] = await Promise.all([
    listSuppliers(context.env),
    listRecentSyncRuns(context.env, 8),
  ]);
  return data({user, suppliers, recentRuns}, {headers});
}

type ActionResult =
  | {intent: 'sync'; ok: true; supplierId: string; summary: SyncSummary}
  | {intent: 'sync'; ok: false; supplierId: string; error: string}
  | {intent: 'apply'; ok: true; supplierId: string; stockApplied: number; priceApplied: number; errors: string[]}
  | {intent: 'apply'; ok: false; supplierId: string; error: string}
  | {intent: 'save-supplier'; ok: true}
  | {intent: 'save-supplier'; ok: false; error: string}
  | {intent: 'delete-supplier'; ok: true}
  | {intent: 'delete-supplier'; ok: false; error: string};

// Solo hay parser hecho para el formato de Walkasse. Un proveedor nuevo
// con otro formato de feed necesitaría su propio parser (como
// walkasse.server.ts) antes de poder sincronizarlo de verdad.
async function runWalkasseSync(env: Env, supplierId: string) {
  const config = await getSupplier(env, supplierId);
  if (!config) throw new Error('No se encontró ese proveedor en Firestore.');
  const feedUrl = resolveFeedUrl(config);

  const [feed, catalog] = await Promise.all([
    fetchWalkasseFeed(feedUrl),
    getShopifyCatalogByBarcode(env),
  ]);
  const summary = buildSyncSummary(walkasseToSupplierRows(feed), catalog);
  return {config, summary};
}

export async function action({request, context}: Route.ActionArgs) {
  const {user, headers} = await requireAdminUser(request, context.env);
  const formData = await request.formData();
  const intent = String(formData.get('intent') || '');
  const supplierId = String(formData.get('supplierId') || 'walkasse');

  if (intent === 'sync') {
    const startedAt = new Date().toISOString();
    try {
      const {config, summary} = await runWalkasseSync(context.env, supplierId);
      await logSyncRun(context.env, {
        supplierId,
        supplierName: config.name,
        type: 'dry-run',
        triggeredBy: user.email,
        startedAt,
        finishedAt: new Date().toISOString(),
        totalFeedRows: summary.totalFeedRows,
        matchedCount: summary.matchedCount,
        changedCount: summary.changedCount,
        unmatchedCount: summary.unmatchedCount,
        errors: [],
        details: summaryToRunDetails(summary),
      });
      return data<ActionResult>({intent: 'sync', ok: true, supplierId, summary}, {headers});
    } catch (error) {
      console.error('[admin-interno/proveedores] sync', error);
      return data<ActionResult>(
        {intent: 'sync', ok: false, supplierId, error: error instanceof Error ? error.message : 'Error desconocido.'},
        {headers},
      );
    }
  }

  if (intent === 'apply') {
    const startedAt = new Date().toISOString();
    try {
      const {config, summary} = await runWalkasseSync(context.env, supplierId);
      const locationId = await getPrimaryLocationId(context.env);

      const stockChanges = summary.rows
        .filter((r) => r.status === 'matched' && r.changes.stock)
        .map((r) => {
          const row = r as Extract<typeof r, {status: 'matched'}>;
          return {inventoryItemId: row.inventoryItemId, quantity: row.changes.stock!.to};
        });

      const priceChanges = summary.rows
        .filter((r) => r.status === 'matched' && r.changes.price)
        .map((r) => {
          const row = r as Extract<typeof r, {status: 'matched'}>;
          return {productId: row.productId, variantId: row.variantId, price: row.changes.price!.to};
        });

      const [stockResult, priceResult] = await Promise.all([
        applyStockChanges(context.env, locationId, stockChanges),
        applyPriceChanges(context.env, priceChanges),
      ]);

      const errors = [...stockResult.errors, ...priceResult.errors];
      await logSyncRun(context.env, {
        supplierId,
        supplierName: config.name,
        type: 'apply',
        triggeredBy: user.email,
        startedAt,
        finishedAt: new Date().toISOString(),
        totalFeedRows: summary.totalFeedRows,
        matchedCount: summary.matchedCount,
        changedCount: summary.changedCount,
        unmatchedCount: summary.unmatchedCount,
        stockApplied: stockResult.applied,
        priceApplied: priceResult.applied,
        errors,
        details: summaryToRunDetails(summary),
      });

      return data<ActionResult>(
        {intent: 'apply', ok: true, supplierId, stockApplied: stockResult.applied, priceApplied: priceResult.applied, errors},
        {headers},
      );
    } catch (error) {
      console.error('[admin-interno/proveedores] apply', error);
      return data<ActionResult>(
        {intent: 'apply', ok: false, supplierId, error: error instanceof Error ? error.message : 'Error desconocido.'},
        {headers},
      );
    }
  }

  if (intent === 'save-supplier') {
    try {
      const isNew = String(formData.get('isNew') || '') === '1';
      const name = String(formData.get('name') || '').trim();
      if (isNew && !name) return data<ActionResult>({intent: 'save-supplier', ok: false, error: 'Ponle un nombre.'}, {headers});

      const id = isNew ? slugify(name) : supplierId;
      const config: SupplierConfig = {
        name: name || id,
        sourceType: String(formData.get('sourceType') || 'url') === 'excel_upload' ? 'excel_upload' : 'url',
        feedUrl: String(formData.get('feedUrl') || ''),
        feedUser: String(formData.get('feedUser') || ''),
        feedPassword: String(formData.get('feedPassword') || ''),
        active: formData.get('active') === 'on',
      };
      await saveSupplier(context.env, id, config);
      return data<ActionResult>({intent: 'save-supplier', ok: true}, {headers});
    } catch (error) {
      console.error('[admin-interno/proveedores] save-supplier', error);
      return data<ActionResult>(
        {intent: 'save-supplier', ok: false, error: error instanceof Error ? error.message : 'Error desconocido.'},
        {headers},
      );
    }
  }

  if (intent === 'delete-supplier') {
    try {
      await deleteSupplier(context.env, supplierId);
      return data<ActionResult>({intent: 'delete-supplier', ok: true}, {headers});
    } catch (error) {
      return data<ActionResult>(
        {intent: 'delete-supplier', ok: false, error: error instanceof Error ? error.message : 'Error desconocido.'},
        {headers},
      );
    }
  }

  return data<ActionResult>({intent: 'sync', ok: false, supplierId, error: 'Acción no reconocida.'}, {headers});
}

export default function AdminProveedores() {
  const {user, suppliers, recentRuns} = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isBusy = navigation.state !== 'idle';
  const busyIntent = navigation.formData?.get('intent');
  const busySupplierId = navigation.formData?.get('supplierId');

  const summary = actionData?.intent === 'sync' && actionData.ok ? actionData.summary : null;
  const summarySupplierId = actionData?.intent === 'sync' && actionData.ok ? actionData.supplierId : null;
  const syncError = actionData?.intent === 'sync' && !actionData.ok ? actionData : null;
  const applyResult = actionData?.intent === 'apply' ? actionData : null;
  const changedRows = summary?.rows.filter((r) => r.status === 'matched' && (r.changes.stock || r.changes.price)) ?? [];
  const unchangedRows = summary?.rows.filter((r) => r.status === 'matched' && !r.changes.stock && !r.changes.price) ?? [];
  const unmatchedRows = summary?.rows.filter((r) => r.status === 'unmatched') ?? [];
  const priceWarningRows =
    summary?.rows.filter((r) => r.status === 'matched' && r.priceWarning) ?? [];

  return (
    <AdminShell user={user}>
      <h1>Proveedores</h1>
      <p style={{color: '#6b6b73', fontSize: '.9rem'}}>
        El cruce con el catálogo se hace siempre por EAN, contra todas las marcas — nunca filtrando antes por
        proveedor o marca.
      </p>

      {suppliers.map(({id, config}) => (
        <div key={id} className="admin-card">
          <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
            <div>
              <strong>{config.name}</strong>{' '}
              <span className={`admin-badge ${config.active ? 'admin-badge--apply' : 'admin-badge--dry'}`}>
                {config.active ? 'Activo' : 'Inactivo'}
              </span>
            </div>
            <Form
              method="post"
              onSubmit={(e) => {
                if (!confirm(`¿Borrar el proveedor "${config.name}"? Esto no borra su histórico.`)) {
                  e.preventDefault();
                }
              }}
            >
              <input type="hidden" name="intent" value="delete-supplier" />
              <input type="hidden" name="supplierId" value={id} />
              <button type="submit" className="admin-btn admin-btn--danger">
                Borrar
              </button>
            </Form>
          </div>

          <details style={{marginTop: 10}}>
            <summary style={{cursor: 'pointer', fontSize: '.85rem', color: '#6b6b73'}}>
              Editar credenciales / URL del feed
            </summary>
            <Form method="post" className="admin-form" style={{marginTop: 8, maxWidth: 480}}>
              <input type="hidden" name="intent" value="save-supplier" />
              <input type="hidden" name="supplierId" value={id} />
              <label>Nombre</label>
              <input type="text" name="name" defaultValue={config.name} />
              <label>Tipo de fuente</label>
              <select name="sourceType" defaultValue={config.sourceType}>
                <option value="url">Feed por URL</option>
                <option value="excel_upload">Subida manual de Excel (próximamente)</option>
              </select>
              <label>URL del feed (usa {'{usuario}'} y {'{clave}'} si van por query string)</label>
              <input type="text" name="feedUrl" defaultValue={config.feedUrl} />
              <label>Usuario</label>
              <input type="text" name="feedUser" defaultValue={config.feedUser} />
              <label>Contraseña</label>
              <input type="password" name="feedPassword" defaultValue={config.feedPassword} />
              <label style={{display: 'flex', alignItems: 'center', gap: 6, marginTop: 10}}>
                <input type="checkbox" name="active" defaultChecked={config.active} style={{width: 'auto'}} />
                Activo
              </label>
              <button type="submit" className="admin-btn admin-btn--outline" style={{marginTop: 12}}>
                Guardar
              </button>
            </Form>
          </details>

          {config.sourceType === 'excel_upload' ? (
            <p className="admin-hint" style={{marginTop: 12}}>
              La subida manual de Excel todavía no está implementada para este proveedor.
            </p>
          ) : (
            <Form method="post" style={{marginTop: 12}}>
              <input type="hidden" name="intent" value="sync" />
              <input type="hidden" name="supplierId" value={id} />
              <button type="submit" className="admin-btn admin-btn--primary" disabled={isBusy}>
                {isBusy && busyIntent === 'sync' && busySupplierId === id ? 'Comparando…' : 'Sincronizar ahora'}
              </button>
            </Form>
          )}

          {syncError && syncError.supplierId === id && <p className="admin-msg--error">{syncError.error}</p>}

          {summary && summarySupplierId === id && (
            <div style={{marginTop: 20}}>
              <h2 style={{margin: '0 0 10px'}}>Resumen</h2>
              <div className="admin-stats">
                <div className="admin-stat">
                  <span className="admin-stat__value">{summary.totalFeedRows}</span>
                  <span className="admin-stat__label">Filas en el feed</span>
                </div>
                <div className="admin-stat">
                  <span className="admin-stat__value">{summary.matchedCount}</span>
                  <span className="admin-stat__label">Coinciden por EAN</span>
                </div>
                <div className="admin-stat">
                  <span className="admin-stat__value">{summary.changedCount}</span>
                  <span className="admin-stat__label">Con cambios</span>
                </div>
                <div className="admin-stat">
                  <span className="admin-stat__value">{summary.unmatchedCount}</span>
                  <span className="admin-stat__label">Sin coincidencia</span>
                </div>
              </div>
              <p className="admin-hint" style={{maxWidth: 640}}>
                "Filas en el feed" es todo lo que vende {config.name} (incluye marcas que no tenemos en la
                tienda). "Coinciden por EAN" es lo que sí está en nuestro catálogo, cruzando por código de
                barras contra todos los productos, sin mirar la marca. De esas, "Con cambios" son las que
                tienen el stock o el precio distinto — eso es justo lo que se escribiría en Shopify si confirmas.
                El stock se sustituye por el del feed tal cual (no se suma ni se resta); el precio también se
                reemplaza directamente, sin aplicar ningún margen. "Sin coincidencia" son productos del feed
                cuyo EAN no existe en tu catálogo — normal si {config.name} vende más referencias de las que
                tienes dadas de alta.
              </p>

              {changedRows.length > 0 && (
                <>
                  <h2>Cambios que se aplicarían ({changedRows.length})</h2>
                  <div className="admin-scroll">
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Producto</th>
                          <th>SKU</th>
                          <th>Ref. proveedor</th>
                          <th>EAN</th>
                          <th>Stock</th>
                          <th>Precio</th>
                        </tr>
                      </thead>
                      <tbody>
                        {changedRows.map((r) => {
                          const row = r as Extract<typeof r, {status: 'matched'}>;
                          const stockDelta = row.changes.stock ? row.changes.stock.to - row.changes.stock.from : 0;
                          return (
                            <tr key={row.ean} style={row.priceWarning ? {background: '#fdf6e3'} : undefined}>
                              <td>{row.title}</td>
                              <td>{row.sku || '—'}</td>
                              <td>{row.supplierRef}</td>
                              <td>{row.ean}</td>
                              <td>
                                {row.changes.stock
                                  ? `${row.changes.stock.from} → ${row.changes.stock.to} (${stockDelta > 0 ? '+' : ''}${stockDelta})`
                                  : '—'}
                              </td>
                              <td>
                                {row.changes.price
                                  ? `${row.changes.price.from.toFixed(2)}€ → ${row.changes.price.to.toFixed(2)}€`
                                  : '—'}
                                {row.priceWarning && (
                                  <div style={{color: '#a15c00', fontSize: '.78rem', marginTop: 2}}>
                                    ⚠ {row.priceWarning}
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <Form method="post" style={{marginTop: 16}}>
                    <input type="hidden" name="intent" value="apply" />
                    <input type="hidden" name="supplierId" value={id} />
                    <button type="submit" className="admin-btn admin-btn--primary" disabled={isBusy}>
                      {isBusy && busyIntent === 'apply' ? 'Aplicando…' : `Confirmar y aplicar ${changedRows.length} cambios`}
                    </button>
                  </Form>
                </>
              )}

              {priceWarningRows.length > 0 && (
                <div style={{marginTop: 24, padding: 12, background: '#fdf6e3', borderRadius: 8}}>
                  <strong style={{fontSize: '.9rem'}}>
                    ⚠ Avisos de precio del proveedor ({priceWarningRows.length})
                  </strong>
                  <ul style={{margin: '8px 0 0', paddingLeft: 20, fontSize: '.85rem'}}>
                    {priceWarningRows.map((r) => {
                      const row = r as Extract<typeof r, {status: 'matched'}>;
                      return (
                        <li key={row.ean}>
                          {row.title} ({row.ean}): {row.priceWarning}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {unchangedRows.length > 0 && (
                <details style={{marginTop: 24}}>
                  <summary style={{cursor: 'pointer', fontWeight: 600}}>
                    Coinciden pero sin cambios ({unchangedRows.length})
                  </summary>
                  <div className="admin-scroll" style={{marginTop: 8}}>
                    <table className="admin-table">
                      <thead>
                        <tr>
                          <th>Producto</th>
                          <th>SKU</th>
                          <th>EAN</th>
                        </tr>
                      </thead>
                      <tbody>
                        {unchangedRows.map((r) => {
                          const row = r as Extract<typeof r, {status: 'matched'}>;
                          return (
                            <tr key={row.ean}>
                              <td>{row.title}</td>
                              <td>{row.sku || '—'}</td>
                              <td>{row.ean}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </details>
              )}

              {unmatchedRows.length > 0 && (
                <details style={{marginTop: 16}} open>
                  <summary style={{cursor: 'pointer', fontWeight: 600}}>
                    Sin coincidencia en el catálogo ({unmatchedRows.length})
                  </summary>
                  <div className="admin-scroll" style={{maxHeight: 260, padding: 8, fontSize: '.85rem', marginTop: 8}}>
                    {unmatchedRows.map((r) => {
                      const row = r as Extract<typeof r, {status: 'unmatched'}>;
                      return (
                        <div key={row.ean}>
                          {row.ean} — {row.referencia}
                        </div>
                      );
                    })}
                  </div>
                </details>
              )}
            </div>
          )}

          {applyResult && applyResult.supplierId === id && (
            <div style={{marginTop: 16}}>
              {applyResult.ok ? (
                <div className="admin-msg--ok">
                  Aplicado: {applyResult.stockApplied} lotes de stock, {applyResult.priceApplied} precios actualizados.
                  {applyResult.errors.length > 0 && (
                    <div style={{marginTop: 6}}>{applyResult.errors.length} errores: {applyResult.errors.slice(0, 5).join(' · ')}</div>
                  )}
                </div>
              ) : (
                <p className="admin-msg--error">{applyResult.error}</p>
              )}
            </div>
          )}
        </div>
      ))}

      <div className="admin-card">
        <details>
          <summary style={{cursor: 'pointer', fontWeight: 600}}>+ Nuevo proveedor</summary>
          <Form method="post" className="admin-form" style={{marginTop: 10, maxWidth: 480}}>
            <input type="hidden" name="intent" value="save-supplier" />
            <input type="hidden" name="isNew" value="1" />
            <label>Nombre</label>
            <input type="text" name="name" required placeholder="Ej. DJBAG.PRO" />
            <label>Tipo de fuente</label>
            <select name="sourceType" defaultValue="url">
              <option value="url">Feed por URL</option>
              <option value="excel_upload">Subida manual de Excel (próximamente)</option>
            </select>
            <label>URL del feed (usa {'{usuario}'} y {'{clave}'} si hace falta)</label>
            <input type="text" name="feedUrl" placeholder="https://..." />
            <label>Usuario</label>
            <input type="text" name="feedUser" />
            <label>Contraseña</label>
            <input type="password" name="feedPassword" />
            <label style={{display: 'flex', alignItems: 'center', gap: 6, marginTop: 10}}>
              <input type="checkbox" name="active" defaultChecked style={{width: 'auto'}} />
              Activo
            </label>
            <p className="admin-hint">
              Nota: para sincronizar de verdad un proveedor nuevo con un formato de feed distinto al de Walkasse,
              hay que escribirle su propio parser (como <code>walkasse.server.ts</code>) — esto solo guarda la
              configuración.
            </p>
            <button type="submit" className="admin-btn admin-btn--outline" style={{marginTop: 8}}>
              Crear proveedor
            </button>
          </Form>
        </details>
        {actionData?.intent === 'save-supplier' && (
          <p className={actionData.ok ? 'admin-msg--ok' : 'admin-msg--error'}>
            {actionData.ok ? 'Guardado.' : actionData.error}
          </p>
        )}
        {actionData?.intent === 'delete-supplier' && !actionData.ok && (
          <p className="admin-msg--error">{actionData.error}</p>
        )}
      </div>

      {recentRuns.length > 0 && (
        <>
          <h2>Últimas sincronizaciones</h2>
          <div className="admin-card">
            <div className="admin-scroll">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Proveedor</th>
                    <th>Tipo</th>
                    <th>Fecha</th>
                    <th>Quién</th>
                    <th>Resultado</th>
                  </tr>
                </thead>
                <tbody>
                  {recentRuns.map(({id, run}) => (
                    <tr key={id}>
                      <td>{run.supplierName}</td>
                      <td>
                        <span className={`admin-badge ${syncRunLabel(run.type).badgeClass}`}>
                          {syncRunLabel(run.type).text}
                        </span>
                      </td>
                      <td>{new Date(run.finishedAt).toLocaleString()}</td>
                      <td>{run.triggeredBy}</td>
                      <td>
                        {run.matchedCount} coinciden, {run.changedCount} cambios, {run.unmatchedCount} sin match
                        {run.errors.length > 0 && (
                          <span className="admin-badge admin-badge--error" style={{marginLeft: 6}}>
                            {run.errors.length} errores
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </AdminShell>
  );
}
