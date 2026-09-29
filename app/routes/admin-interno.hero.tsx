import {Form, data, useActionData, useLoaderData, useNavigation} from 'react-router';
import type {Route} from './+types/admin-interno.hero';
import {requireAdminUser} from '~/lib/adminSession.server';
import {AdminShell} from '~/components/admin/AdminShell';
import {
  createHeroSlide,
  deleteHeroSlide,
  getHeroSettings,
  listHeroSlides,
  setHeroSettings,
  updateHeroSlide,
  type HeroSlide,
} from '~/lib/heroSlides.server';
import {uploadImageToShopify} from '~/lib/shopifyFiles.server';

export const meta: Route.MetaFunction = () => {
  return [{title: 'Hero de la home — Panel interno'}];
};

export async function loader({request, context}: Route.LoaderArgs) {
  const {user, headers} = await requireAdminUser(request, context.env);
  const [slides, settings] = await Promise.all([listHeroSlides(context.env), getHeroSettings(context.env)]);
  return data({user, slides, settings}, {headers});
}

type ActionResult =
  | {intent: 'save-settings'; ok: true}
  | {intent: 'add-slide'; ok: true}
  | {intent: 'add-slide'; ok: false; error: string}
  | {intent: 'update-slide'; ok: true}
  | {intent: 'update-slide'; ok: false; error: string}
  | {intent: 'delete-slide'; ok: true};

function slideFromForm(formData: FormData, imageUrl: string): HeroSlide {
  return {
    position: formData.get('position') === 'right' ? 'right' : 'left',
    order: Number(formData.get('order')) || 0,
    imageUrl,
    href: String(formData.get('href') || '').trim(),
    external: formData.get('external') === 'on',
    badge: String(formData.get('badge') || '').trim(),
    badgeClass:
      (formData.get('badgeClass') as HeroSlide['badgeClass']) || 'storehero__badge--new',
    eyebrow: String(formData.get('eyebrow') || '').trim(),
    title: String(formData.get('title') || '').trim(),
    cta: String(formData.get('cta') || '').trim(),
    ctaClass: (formData.get('ctaClass') as HeroSlide['ctaClass']) || 'btn--primary',
  };
}

export async function action({request, context}: Route.ActionArgs) {
  const {headers} = await requireAdminUser(request, context.env);
  const formData = await request.formData();
  const intent = String(formData.get('intent') || '');

  if (intent === 'save-settings') {
    await setHeroSettings(context.env, {
      leftAutoFallback: formData.get('leftAutoFallback') === 'on',
      rightAutoFallback: formData.get('rightAutoFallback') === 'on',
    });
    return data<ActionResult>({intent: 'save-settings', ok: true}, {headers});
  }

  if (intent === 'add-slide') {
    try {
      const file = formData.get('image');
      if (!(file instanceof File) || file.size === 0) {
        return data<ActionResult>({intent: 'add-slide', ok: false, error: 'Elige una imagen.'}, {headers});
      }
      const imageUrl = await uploadImageToShopify(context.env, file);
      await createHeroSlide(context.env, slideFromForm(formData, imageUrl));
      return data<ActionResult>({intent: 'add-slide', ok: true}, {headers});
    } catch (error) {
      console.error('[admin-interno/hero] add-slide', error);
      return data<ActionResult>(
        {intent: 'add-slide', ok: false, error: error instanceof Error ? error.message : 'Error desconocido.'},
        {headers},
      );
    }
  }

  if (intent === 'update-slide') {
    try {
      const id = String(formData.get('id') || '');
      if (!id) throw new Error('Falta el id del slide.');

      const existing = (await listHeroSlides(context.env)).find((s) => s.id === id);
      if (!existing) throw new Error('Ese slide ya no existe.');

      const file = formData.get('image');
      const imageUrl =
        file instanceof File && file.size > 0 ? await uploadImageToShopify(context.env, file) : existing.slide.imageUrl;

      await updateHeroSlide(context.env, id, slideFromForm(formData, imageUrl));
      return data<ActionResult>({intent: 'update-slide', ok: true}, {headers});
    } catch (error) {
      console.error('[admin-interno/hero] update-slide', error);
      return data<ActionResult>(
        {intent: 'update-slide', ok: false, error: error instanceof Error ? error.message : 'Error desconocido.'},
        {headers},
      );
    }
  }

  if (intent === 'delete-slide') {
    const id = String(formData.get('id') || '');
    if (id) await deleteHeroSlide(context.env, id);
    return data<ActionResult>({intent: 'delete-slide', ok: true}, {headers});
  }

  return data<ActionResult>({intent: 'delete-slide', ok: true}, {headers});
}

const BADGE_OPTIONS: Array<{value: HeroSlide['badgeClass']; label: string}> = [
  {value: 'storehero__badge--new', label: 'Novedad (rojo)'},
  {value: 'storehero__badge--offer', label: 'Oferta'},
  {value: 'storehero__badge--brand', label: 'Marca (oscuro)'},
];
const CTA_OPTIONS: Array<{value: HeroSlide['ctaClass']; label: string}> = [
  {value: 'btn--primary', label: 'Botón sólido'},
  {value: 'btn--outline', label: 'Botón contorno'},
];

export default function AdminHero() {
  const {user, slides, settings} = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isBusy = navigation.state !== 'idle';

  const leftSlides = slides.filter((s) => s.slide.position === 'left');
  const rightSlides = slides.filter((s) => s.slide.position === 'right');

  return (
    <AdminShell user={user} wide>
      <h1>Hero de la home</h1>
      <p style={{color: '#6b6b73', fontSize: '.9rem', maxWidth: 640}}>
        Las dos carátulas grandes de la portada. Cada lado tiene su propio carrusel — puedes añadir varias fotos
        por lado, el orden lo decide el número de "Orden" (menor va primero). El enlace puede ser interno (ej.{' '}
        <code>/blogs/noticias/mi-articulo</code> para llevar a una entrada del blog) o externo marcando "Enlace
        externo".
      </p>

      <div className="admin-card">
        <h2 style={{marginTop: 0}}>Relleno automático</h2>
        <p className="admin-hint">
          Si un lado se queda sin slides manuales (o si quieres dejarlo siempre activo como añadido), se completa
          solo con el producto novedad / más vendido, como funcionaba antes.
        </p>
        <Form method="post">
          <input type="hidden" name="intent" value="save-settings" />
          <label style={{display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8}}>
            <input type="checkbox" name="leftAutoFallback" defaultChecked={settings.leftAutoFallback} style={{width: 'auto'}} />
            Panel izquierdo: permitir relleno automático
          </label>
          <label style={{display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12}}>
            <input type="checkbox" name="rightAutoFallback" defaultChecked={settings.rightAutoFallback} style={{width: 'auto'}} />
            Panel derecho: permitir relleno automático
          </label>
          <button type="submit" className="admin-btn admin-btn--outline" disabled={isBusy}>
            Guardar
          </button>
        </Form>
        {actionData?.intent === 'save-settings' && actionData.ok && (
          <p className="admin-msg--ok">Guardado.</p>
        )}
      </div>

      {(['left', 'right'] as const).map((position) => (
        <div key={position} className="admin-card">
          <h2 style={{marginTop: 0}}>Panel {position === 'left' ? 'izquierdo' : 'derecho'}</h2>

          <div className="admin-scroll">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Foto</th>
                  <th>Título</th>
                  <th>Enlace</th>
                  <th>Orden</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {(position === 'left' ? leftSlides : rightSlides).map(({id, slide}) => (
                  <tr key={id}>
                    <td>
                      <img src={slide.imageUrl} alt="" style={{width: 64, height: 40, objectFit: 'cover', borderRadius: 4}} />
                    </td>
                    <td>{slide.title || <em>(sin título)</em>}</td>
                    <td style={{maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis'}}>{slide.href}</td>
                    <td>{slide.order}</td>
                    <td>
                      <details>
                        <summary style={{cursor: 'pointer', fontSize: '.85rem'}}>Editar</summary>
                        <Form method="post" encType="multipart/form-data" className="admin-form" style={{marginTop: 8, maxWidth: 420}}>
                          <input type="hidden" name="intent" value="update-slide" />
                          <input type="hidden" name="id" value={id} />
                          <input type="hidden" name="position" value={slide.position} />
                          <label>Nueva imagen (opcional, deja vacío para mantener la actual)</label>
                          <input type="file" name="image" accept="image/*" />
                          <label>Enlace</label>
                          <input type="text" name="href" defaultValue={slide.href} />
                          <label style={{display: 'flex', alignItems: 'center', gap: 6}}>
                            <input type="checkbox" name="external" defaultChecked={slide.external} style={{width: 'auto'}} />
                            Enlace externo
                          </label>
                          <label>Etiqueta (badge)</label>
                          <input type="text" name="badge" defaultValue={slide.badge} />
                          <label>Tipo de etiqueta</label>
                          <select name="badgeClass" defaultValue={slide.badgeClass}>
                            {BADGE_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                          <label>Texto pequeño (eyebrow)</label>
                          <input type="text" name="eyebrow" defaultValue={slide.eyebrow} />
                          <label>Título</label>
                          <input type="text" name="title" defaultValue={slide.title} />
                          <label>Texto del botón</label>
                          <input type="text" name="cta" defaultValue={slide.cta} />
                          <label>Estilo del botón</label>
                          <select name="ctaClass" defaultValue={slide.ctaClass}>
                            {CTA_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                          <label>Orden</label>
                          <input type="number" name="order" defaultValue={slide.order} />
                          <button type="submit" className="admin-btn admin-btn--outline" style={{marginTop: 8}} disabled={isBusy}>
                            Guardar cambios
                          </button>
                        </Form>
                        <Form
                          method="post"
                          style={{marginTop: 8}}
                          onSubmit={(e) => {
                            if (!confirm('¿Borrar este slide?')) e.preventDefault();
                          }}
                        >
                          <input type="hidden" name="intent" value="delete-slide" />
                          <input type="hidden" name="id" value={id} />
                          <button type="submit" className="admin-btn admin-btn--danger">
                            Borrar
                          </button>
                        </Form>
                      </details>
                    </td>
                  </tr>
                ))}
                {(position === 'left' ? leftSlides : rightSlides).length === 0 && (
                  <tr>
                    <td colSpan={5} style={{color: '#6b6b73', fontSize: '.85rem'}}>
                      Sin slides manuales — se rellena solo si el relleno automático está activo arriba.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <details style={{marginTop: 16}}>
            <summary style={{cursor: 'pointer', fontWeight: 600}}>+ Añadir slide en el panel {position === 'left' ? 'izquierdo' : 'derecho'}</summary>
            <Form method="post" encType="multipart/form-data" className="admin-form" style={{marginTop: 10, maxWidth: 480}}>
              <input type="hidden" name="intent" value="add-slide" />
              <input type="hidden" name="position" value={position} />
              <label>Imagen</label>
              <input type="file" name="image" accept="image/*" required />
              <label>Enlace (ej. /blogs/noticias/mi-articulo, /collections/dj, https://...)</label>
              <input type="text" name="href" required />
              <label style={{display: 'flex', alignItems: 'center', gap: 6}}>
                <input type="checkbox" name="external" style={{width: 'auto'}} />
                Enlace externo (se abre en pestaña nueva)
              </label>
              <label>Etiqueta (badge)</label>
              <input type="text" name="badge" placeholder="Ej. Nuevo" />
              <label>Tipo de etiqueta</label>
              <select name="badgeClass" defaultValue="storehero__badge--new">
                {BADGE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <label>Texto pequeño (eyebrow)</label>
              <input type="text" name="eyebrow" placeholder="Ej. Recién llegado" />
              <label>Título</label>
              <input type="text" name="title" placeholder="Título grande del slide" />
              <label>Texto del botón</label>
              <input type="text" name="cta" placeholder="Ej. Descubrir" />
              <label>Estilo del botón</label>
              <select name="ctaClass" defaultValue="btn--primary">
                {CTA_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <label>Orden</label>
              <input type="number" name="order" defaultValue={0} />
              <button type="submit" className="admin-btn admin-btn--primary" style={{marginTop: 8}} disabled={isBusy}>
                {isBusy ? 'Subiendo…' : 'Añadir slide'}
              </button>
            </Form>
            {actionData?.intent === 'add-slide' && !actionData.ok && (
              <p className="admin-msg--error">{actionData.error}</p>
            )}
          </details>
        </div>
      ))}
    </AdminShell>
  );
}
