import {Form, data, useActionData, useLoaderData, useNavigation} from 'react-router';
import type {Route} from './+types/admin-interno.instalaciones';
import {requireAdminUser} from '~/lib/adminSession.server';
import {AdminShell} from '~/components/admin/AdminShell';
import {
  createInstallation,
  deleteInstallation,
  listInstallations,
  updateInstallation,
  type Installation,
} from '~/lib/installations.server';
import {uploadImageToShopify} from '~/lib/shopifyFiles.server';

export const meta: Route.MetaFunction = () => {
  return [{title: 'Instalaciones — Panel interno'}];
};

export async function loader({request, context}: Route.LoaderArgs) {
  const {user, headers} = await requireAdminUser(request, context.env);
  const installations = await listInstallations(context.env);
  return data({user, installations}, {headers});
}

type ActionResult =
  | {intent: 'add-installation'; ok: true}
  | {intent: 'add-installation'; ok: false; error: string}
  | {intent: 'update-installation'; ok: true}
  | {intent: 'update-installation'; ok: false; error: string}
  | {intent: 'delete-installation'; ok: true};

function installationFromForm(formData: FormData, imageUrl: string): Installation {
  return {
    order: Number(formData.get('order')) || 0,
    title: String(formData.get('title') || '').trim(),
    location: String(formData.get('location') || '').trim(),
    imageUrl,
    description: String(formData.get('description') || '').trim(),
  };
}

export async function action({request, context}: Route.ActionArgs) {
  const {headers} = await requireAdminUser(request, context.env);
  const formData = await request.formData();
  const intent = String(formData.get('intent') || '');

  if (intent === 'add-installation') {
    try {
      const file = formData.get('image');
      if (!(file instanceof File) || file.size === 0) {
        return data<ActionResult>({intent: 'add-installation', ok: false, error: 'Elige una imagen.'}, {headers});
      }
      const imageUrl = await uploadImageToShopify(context.env, file);
      await createInstallation(context.env, installationFromForm(formData, imageUrl));
      return data<ActionResult>({intent: 'add-installation', ok: true}, {headers});
    } catch (error) {
      console.error('[admin-interno/instalaciones] add-installation', error);
      return data<ActionResult>(
        {intent: 'add-installation', ok: false, error: error instanceof Error ? error.message : 'Error desconocido.'},
        {headers},
      );
    }
  }

  if (intent === 'update-installation') {
    try {
      const id = String(formData.get('id') || '');
      if (!id) throw new Error('Falta el id de la instalación.');

      const existing = (await listInstallations(context.env)).find((i) => i.id === id);
      if (!existing) throw new Error('Esa instalación ya no existe.');

      const file = formData.get('image');
      const imageUrl =
        file instanceof File && file.size > 0 ? await uploadImageToShopify(context.env, file) : existing.installation.imageUrl;

      await updateInstallation(context.env, id, installationFromForm(formData, imageUrl));
      return data<ActionResult>({intent: 'update-installation', ok: true}, {headers});
    } catch (error) {
      console.error('[admin-interno/instalaciones] update-installation', error);
      return data<ActionResult>(
        {intent: 'update-installation', ok: false, error: error instanceof Error ? error.message : 'Error desconocido.'},
        {headers},
      );
    }
  }

  if (intent === 'delete-installation') {
    const id = String(formData.get('id') || '');
    if (id) await deleteInstallation(context.env, id);
    return data<ActionResult>({intent: 'delete-installation', ok: true}, {headers});
  }

  return data<ActionResult>({intent: 'delete-installation', ok: true}, {headers});
}

export default function AdminInstalaciones() {
  const {user, installations} = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isBusy = navigation.state !== 'idle';

  return (
    <AdminShell user={user} wide>
      <h1>Instalaciones</h1>
      <p style={{color: 'var(--text-muted)', fontSize: '.9rem', maxWidth: 640}}>
        Las instalaciones que salen en <code>/instalaciones</code>. La foto se recorta a 16:10 (apaisada) —
        una foto ancha del trabajo terminado queda mejor que una vertical. El "Orden" decide en qué posición
        sale cada una (menor va primero).
      </p>

      <div className="admin-card">
        <h2 style={{marginTop: 0}}>Todas ({installations.length})</h2>

        {installations.length === 0 && (
          <div className="hero-admin__empty">Sin instalaciones todavía — añade la primera abajo.</div>
        )}

        <div className="hero-admin__list">
          {installations.map(({id, installation}) => (
            <div key={id} className="hero-admin__card">
              <div className="hero-admin__thumb">
                <img src={installation.imageUrl} alt="" />
                <span className="hero-admin__order">{installation.order}</span>
              </div>
              <div>
                <div className="hero-admin__title">{installation.title || <em>(sin título)</em>}</div>
                <span className="hero-admin__link">{installation.location}</span>
              </div>
              <div className="hero-admin__card-actions">
                <details style={{position: 'relative'}}>
                  <summary className="hero-admin__icon-btn" style={{listStyle: 'none', display: 'flex'}}>
                    ✎
                  </summary>
                  <div
                    className="hero-admin__add-form"
                    style={{position: 'absolute', right: 0, top: 36, zIndex: 5, width: 340, boxShadow: 'var(--shadow-lg)'}}
                  >
                    <Form method="post" encType="multipart/form-data" className="admin-form">
                      <input type="hidden" name="intent" value="update-installation" />
                      <input type="hidden" name="id" value={id} />
                      <label>Nueva imagen (opcional, deja vacío para mantener la actual)</label>
                      <input type="file" name="image" accept="image/*" />
                      <label>Título</label>
                      <input type="text" name="title" defaultValue={installation.title} />
                      <label>Lugar</label>
                      <input type="text" name="location" defaultValue={installation.location} />
                      <label>Descripción</label>
                      <textarea name="description" rows={4} defaultValue={installation.description} />
                      <label>Orden</label>
                      <input type="number" name="order" defaultValue={installation.order} />
                      <button type="submit" className="admin-btn admin-btn--outline" style={{marginTop: 8}} disabled={isBusy}>
                        Guardar cambios
                      </button>
                    </Form>
                    <Form
                      method="post"
                      style={{marginTop: 8}}
                      onSubmit={(e) => {
                        if (!confirm('¿Borrar esta instalación?')) e.preventDefault();
                      }}
                    >
                      <input type="hidden" name="intent" value="delete-installation" />
                      <input type="hidden" name="id" value={id} />
                      <button type="submit" className="admin-btn admin-btn--danger" style={{width: '100%'}}>
                        Borrar
                      </button>
                    </Form>
                  </div>
                </details>
              </div>
            </div>
          ))}
        </div>

        <details className="hero-admin__add-tile" style={{display: 'block', border: 'none', padding: 0, marginTop: 16}}>
          <summary className="hero-admin__add-tile">+ Añadir instalación</summary>
          <div className="hero-admin__add-form">
            <Form method="post" encType="multipart/form-data" className="admin-form">
              <input type="hidden" name="intent" value="add-installation" />
              <label>Imagen (apaisada, 16:10 — ej. 1600×1000px)</label>
              <input type="file" name="image" accept="image/*" required />
              <div className="hero-admin__field-grid">
                <div className="hero-admin__field-grid--full">
                  <label>Título</label>
                  <input type="text" name="title" placeholder="Ej. Sonorización de la plaza mayor" required />
                </div>
                <div className="hero-admin__field-grid--full">
                  <label>Lugar</label>
                  <input type="text" name="location" placeholder="Ej. Lloret de Mar (Girona)" required />
                </div>
                <div className="hero-admin__field-grid--full">
                  <label>Descripción</label>
                  <textarea name="description" rows={4} placeholder="Qué se hizo, qué equipo se usó, para quién..." />
                </div>
                <div>
                  <label>Orden</label>
                  <input type="number" name="order" defaultValue={0} />
                </div>
              </div>
              <button type="submit" className="admin-btn admin-btn--primary" style={{marginTop: 8}} disabled={isBusy}>
                {isBusy ? 'Subiendo…' : 'Añadir instalación'}
              </button>
            </Form>
            {actionData?.intent === 'add-installation' && !actionData.ok && (
              <p className="admin-msg--error">{actionData.error}</p>
            )}
          </div>
        </details>
      </div>
    </AdminShell>
  );
}
