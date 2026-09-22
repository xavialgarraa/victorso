import {Form, data, useLoaderData} from 'react-router';
import type {Route} from './+types/admin-interno.solicitudes';
import {requireAdminUser} from '~/lib/adminSession.server';
import {AdminShell} from '~/components/admin/AdminShell';
import {deleteServiceRequest, listServiceRequests} from '~/lib/serviceRequests.server';

const TYPE_LABEL: Record<string, string> = {
  reparacion: 'Reparación',
  instalacion: 'Instalación',
  otro: 'Otro',
};

export const meta: Route.MetaFunction = () => {
  return [{title: 'Solicitudes — Panel interno'}];
};

export async function loader({request, context}: Route.LoaderArgs) {
  const {user, headers} = await requireAdminUser(request, context.env);
  const requests = await listServiceRequests(context.env);
  return data({user, requests}, {headers});
}

export async function action({request, context}: Route.ActionArgs) {
  const {headers} = await requireAdminUser(request, context.env);
  const formData = await request.formData();
  const id = String(formData.get('id') || '');
  if (id) await deleteServiceRequest(context.env, id);
  return data({ok: true}, {headers});
}

export default function AdminSolicitudes() {
  const {user, requests} = useLoaderData<typeof loader>();

  return (
    <AdminShell user={user}>
      <h1>Solicitudes de presupuesto ({requests.length})</h1>
      <p style={{color: '#6b6b73', fontSize: '.9rem'}}>
        Servicio técnico e instalaciones pedidos desde la web (formulario de "Solicitar presupuesto").
        Si RESEND_API_KEY no está configurado, este listado es la única forma de verlas.
      </p>

      {requests.length === 0 ? (
        <div className="admin-card">
          <p className="admin-hint">No hay solicitudes todavía.</p>
        </div>
      ) : (
        <div style={{display: 'flex', flexDirection: 'column', gap: 12, marginTop: 20}}>
          {requests.map(({id, request}) => (
            <div className="admin-card" key={id}>
              <div style={{display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8}}>
                <strong>{request.name}</strong>
                <span style={{color: '#9a9aa2', fontSize: '.82rem'}}>
                  {new Date(request.createdAt).toLocaleString()}
                </span>
              </div>
              <div style={{fontSize: '.85rem', color: '#6b6b73', margin: '4px 0'}}>
                {TYPE_LABEL[request.type] || request.type} · {request.contact}
              </div>
              <p style={{margin: '8px 0'}}>{request.message}</p>
              <Form method="post">
                <input type="hidden" name="id" value={id} />
                <button type="submit" className="admin-btn admin-btn--danger">
                  Quitar
                </button>
              </Form>
            </div>
          ))}
        </div>
      )}
    </AdminShell>
  );
}
