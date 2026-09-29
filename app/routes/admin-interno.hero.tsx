import {useState} from 'react';
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
  toggleHiddenAutoKey,
  updateHeroSlide,
  type HeroSlide,
} from '~/lib/heroSlides.server';
import {uploadImageToShopify} from '~/lib/shopifyFiles.server';

export const meta: Route.MetaFunction = () => {
  return [{title: 'Hero de la home — Panel interno'}];
};

type AutoCandidate = {
  key: string;
  tag: string;
  title: string;
  image: string;
};

const ADMIN_HERO_AUTO_QUERY = `#graphql
  query AdminHeroAuto($country: CountryCode, $language: LanguageCode)
    @inContext(country: $country, language: $language) {
    products(first: 1, sortKey: BEST_SELLING) {
      nodes { id title vendor featuredImage { url altText } }
    }
    newest: products(first: 3, sortKey: CREATED_AT, reverse: true) {
      nodes { id title vendor featuredImage { url altText } }
    }
    featuredHome: collectionByHandle(handle: "novedades-destacadas-home") {
      products(first: 3) {
        nodes { id title vendor featuredImage { url altText } }
      }
    }
  }
` as const;

export async function loader({request, context}: Route.LoaderArgs) {
  const {user, headers} = await requireAdminUser(request, context.env);
  const [slides, settings, autoData] = await Promise.all([
    listHeroSlides(context.env),
    getHeroSettings(context.env),
    context.storefront.query(ADMIN_HERO_AUTO_QUERY),
  ]);

  const newest = autoData.featuredHome?.products?.nodes?.length
    ? autoData.featuredHome.products.nodes.slice(0, 3)
    : autoData.newest.nodes;
  const bestselling = autoData.products.nodes[0] ?? null;

  const autoLeftCandidates: AutoCandidate[] = newest.map((p) => ({
    key: `new-${p.id}`,
    tag: 'Producto novedad',
    title: `${p.vendor} — ${p.title}`,
    image: p.featuredImage?.url ?? '',
  }));
  const autoRightCandidates: AutoCandidate[] = [
    ...(bestselling
      ? [{key: `best-${bestselling.id}`, tag: 'Más vendido', title: `${bestselling.vendor} — ${bestselling.title}`, image: bestselling.featuredImage?.url ?? ''}]
      : []),
    {key: 'contact', tag: 'Contacto', title: 'Escríbenos por WhatsApp', image: '/assets/tienda-fachada.jpeg'},
    {key: 'visit', tag: 'Visítanos', title: 'Ven a probar el equipo a la tienda', image: '/assets/tienda-fachada.jpeg'},
  ];

  return data({user, slides, settings, autoLeftCandidates, autoRightCandidates}, {headers});
}

type ActionResult =
  | {intent: 'save-settings'; ok: true}
  | {intent: 'add-slide'; ok: true}
  | {intent: 'add-slide'; ok: false; error: string}
  | {intent: 'update-slide'; ok: true}
  | {intent: 'update-slide'; ok: false; error: string}
  | {intent: 'delete-slide'; ok: true}
  | {intent: 'toggle-auto'; ok: true};

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
    const current = await getHeroSettings(context.env);
    await setHeroSettings(context.env, {
      ...current,
      leftAutoFallback: formData.get('leftAutoFallback') === 'on',
      rightAutoFallback: formData.get('rightAutoFallback') === 'on',
    });
    return data<ActionResult>({intent: 'save-settings', ok: true}, {headers});
  }

  if (intent === 'toggle-auto') {
    const key = String(formData.get('key') || '');
    if (key) await toggleHiddenAutoKey(context.env, key);
    return data<ActionResult>({intent: 'toggle-auto', ok: true}, {headers});
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
  {value: 'storehero__badge--new', label: 'Novedad (verde)'},
  {value: 'storehero__badge--offer', label: 'Oferta (rojo)'},
  {value: 'storehero__badge--brand', label: 'Marca (oscuro)'},
];
const CTA_OPTIONS: Array<{value: HeroSlide['ctaClass']; label: string}> = [
  {value: 'btn--primary', label: 'Botón sólido'},
  {value: 'btn--outline', label: 'Botón contorno'},
];

function badgeSuffix(badgeClass: HeroSlide['badgeClass']) {
  return badgeClass.replace('storehero__badge--', '');
}

/**
 * La foto se estira con "object-fit: cover" y el recuadro del hero cambia
 * de proporción según el dispositivo (más cuadrado en móvil, más ancho en
 * escritorio) — así que un mismo encuadre no se ve igual en todos lados.
 * Esto muestra en vivo qué parte de la foto se recorta en cada tamaño,
 * antes de guardarla, para poder elegir/centrar bien la imagen.
 */
function HeroImageCropPreview({initialUrl}: {initialUrl?: string}) {
  const [src, setSrc] = useState<string | null>(initialUrl ?? null);

  return (
    <>
      <input
        type="file"
        name="image"
        accept="image/*"
        required={!initialUrl}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) {
            setSrc(initialUrl ?? null);
            return;
          }
          const reader = new FileReader();
          reader.onload = () => setSrc(String(reader.result));
          reader.readAsDataURL(file);
        }}
      />
      {src && (
        <div className="hero-admin__crop-preview">
          <p className="admin-hint" style={{margin: '8px 0 6px'}}>
            Así se recortará según la pantalla — procura que lo importante quede centrado:
          </p>
          <div className="hero-admin__crop-row">
            <div className="hero-admin__crop-box hero-admin__crop-box--mobile">
              <img src={src} alt="" />
              <span className="hero-admin__crop-label">Móvil</span>
            </div>
            <div className="hero-admin__crop-box hero-admin__crop-box--tablet">
              <img src={src} alt="" />
              <span className="hero-admin__crop-label">Tablet</span>
            </div>
            <div className="hero-admin__crop-box hero-admin__crop-box--desktop">
              <img src={src} alt="" />
              <span className="hero-admin__crop-label">Escritorio</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function AdminHero() {
  const {user, slides, settings, autoLeftCandidates, autoRightCandidates} = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isBusy = navigation.state !== 'idle';

  const leftSlides = slides.filter((s) => s.slide.position === 'left');
  const rightSlides = slides.filter((s) => s.slide.position === 'right');
  const hiddenAutoKeys = settings.hiddenAutoKeys ?? [];

  return (
    <AdminShell user={user} wide>
      <h1>Hero de la home</h1>
      <p style={{color: 'var(--text-muted)', fontSize: '.9rem', maxWidth: 640}}>
        Las dos carátulas grandes de la portada. Cada lado tiene su propio carrusel — puedes añadir varias fotos
        por lado, el orden lo decide el número de "Orden" (menor va primero). El enlace puede ser interno (ej.{' '}
        <code>/blogs/noticias/mi-articulo</code> para llevar a una entrada del blog) o externo marcando "Enlace
        externo".
      </p>

      <div className="admin-card">
        <h2 style={{marginTop: 0}}>Relleno automático</h2>
        <p className="admin-hint">
          Si un lado se queda sin slides manuales (o si quieres dejarlo siempre activo como añadido), se completa
          solo con el producto novedad / más vendido. Con los interruptores de abajo lo activas o desactivas por
          lado entero; con el botón "Ocultar" de cada tarjeta puedes quitar solo una tarjeta concreta del relleno,
          sin tocar las demás.
        </p>
        <Form method="post">
          <input type="hidden" name="intent" value="save-settings" />
          <div className="hero-admin__toggle-row">
            <div className="hero-admin__toggle-text">
              <strong>Panel izquierdo</strong>
              <span>Producto novedad si faltan fotos</span>
            </div>
            <input type="checkbox" className="hero-admin__switch" name="leftAutoFallback" defaultChecked={settings.leftAutoFallback} />
          </div>
          <div className="hero-admin__toggle-row">
            <div className="hero-admin__toggle-text">
              <strong>Panel derecho</strong>
              <span>Más vendido + tarjetas de contacto</span>
            </div>
            <input type="checkbox" className="hero-admin__switch" name="rightAutoFallback" defaultChecked={settings.rightAutoFallback} />
          </div>
          <button type="submit" className="admin-btn admin-btn--outline" style={{marginTop: 14}} disabled={isBusy}>
            Guardar
          </button>
        </Form>
        {actionData?.intent === 'save-settings' && actionData.ok && (
          <p className="admin-msg--ok">Guardado.</p>
        )}
      </div>

      {(['left', 'right'] as const).map((position) => {
        const manual = position === 'left' ? leftSlides : rightSlides;
        const autoCandidates = position === 'left' ? autoLeftCandidates : autoRightCandidates;
        const autoFallbackOn = position === 'left' ? settings.leftAutoFallback : settings.rightAutoFallback;

        return (
          <div key={position} className="admin-card">
            <div className="hero-admin__side-head" style={{marginTop: 0}}>
              <span className="dot" />
              <h2>Panel {position === 'left' ? 'izquierdo' : 'derecho'}</h2>
              <span className="hero-admin__count">
                {manual.length} tuya{manual.length === 1 ? '' : 's'} + {autoCandidates.length} auto
              </span>
            </div>

            {manual.length === 0 && (
              <div className="hero-admin__empty">Sin slides manuales todavía — añade la primera abajo.</div>
            )}

            <div className="hero-admin__list">
              {manual.map(({id, slide}) => (
                <div key={id} className="hero-admin__card">
                  <div className="hero-admin__thumb">
                    <img src={slide.imageUrl} alt="" />
                    <span className="hero-admin__order">{slide.order}</span>
                  </div>
                  <div>
                    {slide.badge && (
                      <span className={`hero-admin__badge hero-admin__badge--${badgeSuffix(slide.badgeClass)}`}>{slide.badge}</span>
                    )}
                    <div className="hero-admin__title">{slide.title || <em>(sin título)</em>}</div>
                    <span className="hero-admin__link">{slide.href}</span>
                  </div>
                  <div className="hero-admin__card-actions">
                    <details style={{position: 'relative'}}>
                      <summary className="hero-admin__icon-btn" style={{listStyle: 'none', display: 'flex'}}>
                        ✎
                      </summary>
                      <div
                        className="hero-admin__add-form"
                        style={{position: 'absolute', right: 0, top: 36, zIndex: 5, width: 320, boxShadow: 'var(--shadow-lg)'}}
                      >
                        <Form method="post" encType="multipart/form-data" className="admin-form">
                          <input type="hidden" name="intent" value="update-slide" />
                          <input type="hidden" name="id" value={id} />
                          <input type="hidden" name="position" value={slide.position} />
                          <label>Nueva imagen (opcional)</label>
                          <HeroImageCropPreview initialUrl={slide.imageUrl} />
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

            <div className="hero-admin__side-head">
              Relleno automático
              <span
                className="admin-badge"
                style={{
                  background: autoFallbackOn ? '#e3f5e8' : '#eef0f4',
                  color: autoFallbackOn ? '#16743a' : '#4a4a52',
                }}
              >
                {autoFallbackOn ? 'Activo' : 'Desactivado'}
              </span>
            </div>
            <div className="hero-admin__list">
              {autoCandidates.map((c) => {
                const hidden = hiddenAutoKeys.includes(c.key);
                return (
                  <div key={c.key} className={`hero-admin__card hero-admin__card--auto${hidden ? ' hero-admin__card--hidden' : ''}`}>
                    <div className="hero-admin__thumb">{c.image && <img src={c.image} alt="" />}</div>
                    <div>
                      <span className="hero-admin__tag">{c.tag}{hidden ? ' · oculta' : ''}</span>
                      <div className="hero-admin__title">{c.title}</div>
                      <span className="hero-admin__link">se actualiza solo con el catálogo</span>
                    </div>
                    <div className="hero-admin__card-actions">
                      <Form method="post">
                        <input type="hidden" name="intent" value="toggle-auto" />
                        <input type="hidden" name="key" value={c.key} />
                        <button type="submit" className="admin-btn admin-btn--outline" disabled={isBusy}>
                          {hidden ? 'Mostrar' : 'Ocultar'}
                        </button>
                      </Form>
                    </div>
                  </div>
                );
              })}
            </div>

            <details className="hero-admin__add-tile" style={{display: 'block', border: 'none', padding: 0, marginTop: 16}}>
              <summary className="hero-admin__add-tile">
                + Añadir slide en el panel {position === 'left' ? 'izquierdo' : 'derecho'}
              </summary>
              <div className="hero-admin__add-form">
                <Form method="post" encType="multipart/form-data" className="admin-form">
                  <input type="hidden" name="intent" value="add-slide" />
                  <input type="hidden" name="position" value={position} />
                  <label>Imagen</label>
                  <HeroImageCropPreview />
                  <div className="hero-admin__field-grid">
                    <div className="hero-admin__field-grid--full">
                      <label>Enlace (ej. /blogs/noticias/mi-articulo, /collections/dj, https://...)</label>
                      <input type="text" name="href" required />
                    </div>
                    <div>
                      <label>Etiqueta (badge)</label>
                      <input type="text" name="badge" placeholder="Ej. Nuevo" />
                    </div>
                    <div>
                      <label>Tipo de etiqueta</label>
                      <select name="badgeClass" defaultValue="storehero__badge--new">
                        {BADGE_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="hero-admin__field-grid--full">
                      <label>Texto pequeño (eyebrow)</label>
                      <input type="text" name="eyebrow" placeholder="Ej. Recién llegado" />
                    </div>
                    <div className="hero-admin__field-grid--full">
                      <label>Título</label>
                      <input type="text" name="title" placeholder="Título grande del slide" />
                    </div>
                    <div>
                      <label>Texto del botón</label>
                      <input type="text" name="cta" placeholder="Ej. Descubrir" />
                    </div>
                    <div>
                      <label>Estilo del botón</label>
                      <select name="ctaClass" defaultValue="btn--primary">
                        {CTA_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label>Orden</label>
                      <input type="number" name="order" defaultValue={0} />
                    </div>
                    <div style={{display: 'flex', alignItems: 'center', gap: 6, marginTop: 24}}>
                      <input type="checkbox" name="external" style={{width: 'auto'}} />
                      <label style={{margin: 0}}>Enlace externo (pestaña nueva)</label>
                    </div>
                  </div>
                  <button type="submit" className="admin-btn admin-btn--primary" style={{marginTop: 8}} disabled={isBusy}>
                    {isBusy ? 'Subiendo…' : 'Añadir slide'}
                  </button>
                </Form>
                {actionData?.intent === 'add-slide' && !actionData.ok && (
                  <p className="admin-msg--error">{actionData.error}</p>
                )}
              </div>
            </details>
          </div>
        );
      })}
    </AdminShell>
  );
}
