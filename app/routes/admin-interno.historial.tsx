import {Fragment, useState} from 'react';
import {data, useLoaderData} from 'react-router';
import type {Route} from './+types/admin-interno.historial';
import {requireAdminUser} from '~/lib/adminSession.server';
import {AdminShell} from '~/components/admin/AdminShell';
import {listRecentSyncRuns, type SyncRunLog} from '~/lib/connectors/suppliers.server';
import {syncRunLabel} from '~/lib/syncRunLabel';

export const meta: Route.MetaFunction = () => {
  return [{title: 'Historial — Panel interno'}];
};

export async function loader({request, context}: Route.LoaderArgs) {
  const {user, headers} = await requireAdminUser(request, context.env);
  const runs = await listRecentSyncRuns(context.env, 200);
  return data({user, runs}, {headers});
}

function RunDetails({run}: {run: SyncRunLog}) {
  const details = run.details;
  if (!details) {
    return (
      <p className="admin-hint">
        Esta sincronización es de antes de guardar el detalle fila a fila — solo quedan los totales de arriba.
      </p>
    );
  }

  // Los registros guardados antes de este campo no lo tienen.
  const priceWarnings = details.priceWarnings ?? [];

  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: 16}}>
      {priceWarnings.length > 0 && (
        <div style={{padding: 12, background: '#fdf6e3', borderRadius: 8}}>
          <strong style={{fontSize: '.9rem'}}>⚠ Avisos de precio del proveedor ({priceWarnings.length})</strong>
          <ul style={{margin: '8px 0 0', paddingLeft: 20, fontSize: '.85rem'}}>
            {priceWarnings.map((w) => (
              <li key={w.ean}>
                {w.title} ({w.ean}): {w.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {details.changed.length > 0 && (
        <div>
          <h3 style={{margin: '0 0 8px', fontSize: '.9rem'}}>Cambios ({details.changed.length})</h3>
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
                {details.changed.map((row) => (
                  <tr key={row.ean}>
                    <td>{row.title}</td>
                    <td>{row.sku || '—'}</td>
                    <td>{row.supplierRef}</td>
                    <td>{row.ean}</td>
                    <td>
                      {row.stockFrom !== null && row.stockTo !== null
                        ? `${row.stockFrom} → ${row.stockTo} (${row.stockTo - row.stockFrom > 0 ? '+' : ''}${row.stockTo - row.stockFrom})`
                        : '—'}
                    </td>
                    <td>
                      {row.priceFrom !== null && row.priceTo !== null
                        ? `${row.priceFrom.toFixed(2)}€ → ${row.priceTo.toFixed(2)}€`
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {details.unchanged.length > 0 && (
        <details>
          <summary style={{cursor: 'pointer', fontWeight: 600, fontSize: '.9rem'}}>
            Coinciden pero sin cambios ({details.unchanged.length})
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
                {details.unchanged.map((row) => (
                  <tr key={row.ean}>
                    <td>{row.title}</td>
                    <td>{row.sku || '—'}</td>
                    <td>{row.ean}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}

      {details.unmatched.length > 0 && (
        <details>
          <summary style={{cursor: 'pointer', fontWeight: 600, fontSize: '.9rem'}}>
            Sin coincidencia en el catálogo ({details.unmatched.length})
          </summary>
          <div className="admin-scroll" style={{maxHeight: 240, padding: 8, fontSize: '.85rem', marginTop: 8}}>
            {details.unmatched.map((row) => (
              <div key={row.ean}>
                {row.ean} — {row.referencia}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

export default function AdminHistorial() {
  const {user, runs} = useLoaderData<typeof loader>();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <AdminShell user={user} wide>
      <h1>Historial</h1>
      <p style={{color: '#6b6b73', fontSize: '.9rem'}}>
        Todas las sincronizaciones lanzadas (comparar y aplicar), más recientes primero. Pulsa una fila para
        ver el desglose completo, igual que se ve antes de confirmar.
      </p>

      <div className="admin-card" style={{marginTop: 20}}>
        {runs.length === 0 ? (
          <p className="admin-hint">Todavía no hay nada registrado.</p>
        ) : (
          <div className="admin-scroll admin-scroll--tall">
            <table className="admin-table">
              <thead>
                <tr>
                  <th style={{width: 24}}></th>
                  <th>Fecha</th>
                  <th>Proveedor</th>
                  <th>Tipo</th>
                  <th>Quién</th>
                  <th>Resultado</th>
                  <th>Aplicado</th>
                </tr>
              </thead>
              <tbody>
                {runs.map(({id, run}) => {
                  const isOpen = expandedId === id;
                  return (
                    <Fragment key={id}>
                      <tr
                        onClick={() => setExpandedId(isOpen ? null : id)}
                        style={{cursor: 'pointer', background: isOpen ? '#fafafb' : undefined}}
                      >
                        <td style={{color: '#9a9aa2'}}>{isOpen ? '▾' : '▸'}</td>
                        <td style={{whiteSpace: 'nowrap'}}>{new Date(run.finishedAt).toLocaleString()}</td>
                        <td>{run.supplierName}</td>
                        <td>
                          <span className={`admin-badge ${syncRunLabel(run.type).badgeClass}`}>
                            {syncRunLabel(run.type).text}
                          </span>
                        </td>
                        <td>{run.triggeredBy}</td>
                        <td>
                          {run.totalFeedRows} en el feed, {run.matchedCount} coinciden, {run.changedCount} cambios,{' '}
                          {run.unmatchedCount} sin match
                          {run.pendingPriceChanges ? (
                            <span className="admin-badge admin-badge--dry" style={{marginLeft: 6}}>
                              {run.pendingPriceChanges} precio pendiente
                            </span>
                          ) : null}
                          {run.errors.length > 0 && (
                            <span className="admin-badge admin-badge--error" style={{marginLeft: 6}}>
                              {run.errors.length} errores
                            </span>
                          )}
                        </td>
                        <td style={{whiteSpace: 'nowrap'}}>
                          {run.type !== 'dry-run'
                            ? `${run.stockApplied ?? 0} stock / ${run.priceApplied ?? 0} precio`
                            : '—'}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr>
                          <td colSpan={7} style={{background: '#fafafb', padding: 16}}>
                            <RunDetails run={run} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
