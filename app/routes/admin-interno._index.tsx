import {Link, data, useLoaderData} from 'react-router';
import type {Route} from './+types/admin-interno._index';
import {requireAdminUser} from '~/lib/adminSession.server';
import {AdminShell} from '~/components/admin/AdminShell';
import {listRecentSyncRuns, listSuppliers} from '~/lib/connectors/suppliers.server';
import {syncRunLabel} from '~/lib/syncRunLabel';

export const meta: Route.MetaFunction = () => {
  return [{title: 'Panel interno — Victor So Professional'}];
};

export async function loader({request, context}: Route.LoaderArgs) {
  const {user, headers} = await requireAdminUser(request, context.env);
  const [suppliers, recentRuns] = await Promise.all([
    listSuppliers(context.env),
    listRecentSyncRuns(context.env, 5),
  ]);
  return data({user, suppliers, recentRuns}, {headers});
}

export default function AdminDashboard() {
  const {user, suppliers, recentRuns} = useLoaderData<typeof loader>();

  const activeCount = suppliers.filter((s) => s.config.active).length;
  const lastRun = recentRuns[0]?.run;
  const errorsLast7 = recentRuns.filter((r) => r.run.errors.length > 0).length;

  return (
    <AdminShell user={user}>
      <h1>Resumen</h1>
      <p style={{color: '#6b6b73', fontSize: '.9rem'}}>Vista general del panel de proveedores.</p>

      <div className="admin-stats">
        <div className="admin-stat">
          <span className="admin-stat__value">{suppliers.length}</span>
          <span className="admin-stat__label">Proveedores configurados</span>
        </div>
        <div className="admin-stat">
          <span className="admin-stat__value">{activeCount}</span>
          <span className="admin-stat__label">Activos</span>
        </div>
        <div className="admin-stat">
          <span className="admin-stat__value">{lastRun ? new Date(lastRun.finishedAt).toLocaleDateString() : '—'}</span>
          <span className="admin-stat__label">Última sincronización</span>
        </div>
        <div className="admin-stat">
          <span className="admin-stat__value">{errorsLast7}</span>
          <span className="admin-stat__label">Con errores (últimas 5)</span>
        </div>
      </div>

      <h2>Proveedores</h2>
      <div className="admin-card">
        {suppliers.length === 0 ? (
          <p className="admin-hint">Todavía no hay proveedores configurados.</p>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Tipo</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map(({id, config}) => (
                <tr key={id}>
                  <td>{config.name}</td>
                  <td>{config.sourceType === 'url' ? 'Feed por URL' : 'Excel manual'}</td>
                  <td>
                    <span className={`admin-badge ${config.active ? 'admin-badge--apply' : 'admin-badge--dry'}`}>
                      {config.active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Link to="/admin-interno/proveedores" className="admin-btn admin-btn--outline" style={{marginTop: 16}}>
          Ir a proveedores →
        </Link>
      </div>

      <h2>Últimas sincronizaciones</h2>
      <div className="admin-card">
        {recentRuns.length === 0 ? (
          <p className="admin-hint">Todavía no se ha lanzado ninguna sincronización.</p>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Proveedor</th>
                <th>Tipo</th>
                <th>Fecha</th>
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
                  <td>
                    {run.matchedCount} coinciden, {run.changedCount} cambios
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
        )}
        <Link to="/admin-interno/historial" className="admin-btn admin-btn--outline" style={{marginTop: 16}}>
          Ver historial completo →
        </Link>
      </div>
    </AdminShell>
  );
}
