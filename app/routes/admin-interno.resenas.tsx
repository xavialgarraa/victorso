import {Form, data, useLoaderData} from 'react-router';
import type {Route} from './+types/admin-interno.resenas';
import {requireAdminUser} from '~/lib/adminSession.server';
import {AdminShell} from '~/components/admin/AdminShell';
import {approveReview, getPendingReviews, rejectReview} from '~/lib/productReviews.server';

export const meta: Route.MetaFunction = () => {
  return [{title: 'Reseñas — Panel interno'}];
};

export async function loader({request, context}: Route.LoaderArgs) {
  const {user, headers} = await requireAdminUser(request, context.env);
  const pending = await getPendingReviews(context.env);
  return data({user, pending}, {headers});
}

export async function action({request, context}: Route.ActionArgs) {
  const {headers} = await requireAdminUser(request, context.env);
  const formData = await request.formData();
  const intent = String(formData.get('intent') || '');
  const productId = String(formData.get('productId') || '');
  const reviewId = String(formData.get('reviewId') || '');

  if (intent === 'approve') {
    await approveReview(context.env, productId, reviewId);
  } else if (intent === 'reject') {
    await rejectReview(context.env, productId, reviewId);
  }

  return data({ok: true}, {headers});
}

export default function AdminResenas() {
  const {user, pending} = useLoaderData<typeof loader>();

  return (
    <AdminShell user={user}>
      <h1>Reseñas pendientes de moderación ({pending.length})</h1>
      <p style={{color: '#6b6b73', fontSize: '.9rem'}}>
        Las reseñas nuevas se publican en la ficha del producto solo cuando las apruebas aquí.
      </p>

      {pending.length === 0 ? (
        <div className="admin-card">
          <p className="admin-hint">No hay reseñas pendientes ahora mismo.</p>
        </div>
      ) : (
        <div style={{display: 'flex', flexDirection: 'column', gap: 12, marginTop: 20}}>
          {pending.map((entry) => (
            <div className="admin-card" key={entry.reviewId}>
              <div style={{display: 'flex', justifyContent: 'space-between'}}>
                <strong>{entry.name}</strong>
                <span style={{color: '#9a9aa2', fontSize: '.82rem'}}>
                  {new Date(entry.createdAt).toLocaleString()}
                </span>
              </div>
              <div style={{fontSize: '.85rem', color: '#6b6b73', margin: '4px 0'}}>
                Producto:{' '}
                <a href={`/products/${entry.productHandle}`} target="_blank" rel="noreferrer">
                  {entry.productTitle}
                </a>
              </div>
              <div style={{color: 'var(--red)'}}>
                {'★'.repeat(entry.rating)}
                {'☆'.repeat(5 - entry.rating)}
              </div>
              <p style={{margin: '8px 0'}}>{entry.comment}</p>
              <div style={{display: 'flex', gap: 8}}>
                <Form method="post">
                  <input type="hidden" name="productId" value={entry.productId} />
                  <input type="hidden" name="reviewId" value={entry.reviewId} />
                  <input type="hidden" name="intent" value="approve" />
                  <button type="submit" className="admin-btn admin-btn--primary">
                    Aprobar
                  </button>
                </Form>
                <Form method="post">
                  <input type="hidden" name="productId" value={entry.productId} />
                  <input type="hidden" name="reviewId" value={entry.reviewId} />
                  <input type="hidden" name="intent" value="reject" />
                  <button type="submit" className="admin-btn admin-btn--danger">
                    Rechazar
                  </button>
                </Form>
              </div>
            </div>
          ))}
        </div>
      )}
    </AdminShell>
  );
}
