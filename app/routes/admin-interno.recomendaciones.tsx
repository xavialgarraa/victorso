import {Form, data, useActionData, useLoaderData, useNavigation} from 'react-router';
import type {Route} from './+types/admin-interno.recomendaciones';
import {requireAdminUser} from '~/lib/adminSession.server';
import {AdminShell} from '~/components/admin/AdminShell';
import {
  deleteCartRecommendationOverride,
  listCartRecommendationOverrides,
  setCartRecommendationOverride,
} from '~/lib/cartRecommendations.server';

export const meta: Route.MetaFunction = () => {
  return [{title: 'Recomendaciones del carrito — Panel interno'}];
};

export async function loader({request, context}: Route.LoaderArgs) {
  const {user, headers} = await requireAdminUser(request, context.env);
  const overrides = await listCartRecommendationOverrides(context.env);
  return data({user, overrides}, {headers});
}

type ActionResult =
  | {intent: 'save'; ok: true}
  | {intent: 'save'; ok: false; error: string}
  | {intent: 'delete'; ok: true};

export async function action({request, context}: Route.ActionArgs) {
  const {headers} = await requireAdminUser(request, context.env);
  const formData = await request.formData();
  const intent = String(formData.get('intent') || '');

  if (intent === 'save') {
    const handle = String(formData.get('handle') || '').trim();
    const recommendedRaw = String(formData.get('recommended') || '');
    const recommendedHandles = recommendedRaw
      .split(',')
      .map((h) => h.trim())
      .filter(Boolean);

    if (!handle || recommendedHandles.length === 0) {
      return data<ActionResult>(
        {intent: 'save', ok: false, error: 'Indica el producto origen y al menos un producto recomendado.'},
        {headers},
      );
    }

    try {
      await setCartRecommendationOverride(context.env, handle, recommendedHandles);
      return data<ActionResult>({intent: 'save', ok: true}, {headers});
    } catch (error) {
      return data<ActionResult>(
        {intent: 'save', ok: false, error: error instanceof Error ? error.message : 'Error desconocido.'},
        {headers},
      );
    }
  }

  if (intent === 'delete') {
    const handle = String(formData.get('handle') || '');
    if (handle) await deleteCartRecommendationOverride(context.env, handle);
    return data<ActionResult>({intent: 'delete', ok: true}, {headers});
  }

  return data<ActionResult>({intent: 'delete', ok: true}, {headers});
}

export default function AdminRecomendaciones() {
  const {user, overrides} = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isBusy = navigation.state !== 'idle';

  return (
    <AdminShell user={user} wide>
      <h1>Recomendaciones del carrito</h1>
      <p style={{color: 'var(--text-muted)', fontSize: '.9rem', maxWidth: 640}}>
        Cuando alguien tiene un producto en el carrito, en pantallas grandes se le sugieren otros
        productos a la derecha. Por defecto Shopify los elige automáticamente (productos que se compran
        juntos o del mismo tipo). Aquí puedes forzar manualmente qué recomendar para un producto
        concreto — útil para complementos claros (ej. un controlador → sus cables específicos).
      </p>

      <div className="admin-card">
        <h2 style={{marginTop: 0}}>Overrides activos ({overrides.length})</h2>
        {overrides.length === 0 && (
          <div className="hero-admin__empty">
            Ninguno todavía — todos los productos usan las recomendaciones automáticas de Shopify.
          </div>
        )}
        <div className="hero-admin__list">
          {overrides.map((o) => (
            <div key={o.handle} className="hero-admin__card" style={{gridTemplateColumns: '1fr auto'}}>
              <div>
                <div className="hero-admin__title">{o.handle}</div>
                <span className="hero-admin__link">→ {o.recommendedHandles.join(', ')}</span>
              </div>
              <Form
                method="post"
                onSubmit={(e) => {
                  if (!confirm(`¿Quitar el override de "${o.handle}"?`)) e.preventDefault();
                }}
              >
                <input type="hidden" name="intent" value="delete" />
                <input type="hidden" name="handle" value={o.handle} />
                <button type="submit" className="admin-btn admin-btn--danger">
                  Borrar
                </button>
              </Form>
            </div>
          ))}
        </div>

        <details className="hero-admin__add-tile" style={{display: 'block', border: 'none', padding: 0, marginTop: 16}}>
          <summary className="hero-admin__add-tile">+ Añadir override</summary>
          <div className="hero-admin__add-form">
            <Form method="post" className="admin-form">
              <input type="hidden" name="intent" value="save" />
              <label>Handle del producto origen</label>
              <input type="text" name="handle" placeholder="ej. controadora-dj-alpha-theta-ddj-flx2" required />
              <p className="admin-hint" style={{margin: '2px 0 8px'}}>
                El handle es la última parte de la URL del producto (después de /products/).
              </p>
              <label>Handles recomendados (separados por comas)</label>
              <input type="text" name="recommended" placeholder="ej. cable-xlr-5m, auriculares-dj-hdj-cue1" required />
              <button type="submit" className="admin-btn admin-btn--primary" style={{marginTop: 8}} disabled={isBusy}>
                Guardar
              </button>
            </Form>
            {actionData?.intent === 'save' && !actionData.ok && (
              <p className="admin-msg--error">{actionData.error}</p>
            )}
          </div>
        </details>
      </div>
    </AdminShell>
  );
}
