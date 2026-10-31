import {useEffect, useState} from 'react';
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

export type HeroPickerProduct = {
  handle: string;
  title: string;
  vendor: string;
  image: string;
  price: number;
  compareAtPrice: number | null;
  currency: string;
};

// Lista plana de productos para el selector del panel — se trae entera de
// una vez (primeros 250) en vez de buscar por API en cada tecla, así el
// autocompletar y la vista previa funcionan al instante en el cliente sin
// ida y vuelta al servidor.
const ADMIN_HERO_PRODUCTS_QUERY = `#graphql
  query AdminHeroProducts($country: CountryCode, $language: LanguageCode)
    @inContext(country: $country, language: $language) {
    products(first: 250, sortKey: TITLE) {
      nodes {
        handle
        title
        vendor
        featuredImage { url altText }
        priceRange { minVariantPrice { amount currencyCode } }
        compareAtPriceRange { minVariantPrice { amount } }
      }
    }
  }
` as const;

export async function loader({request, context}: Route.LoaderArgs) {
  const {user, headers} = await requireAdminUser(request, context.env);
  const [slides, settings, autoData, productsData] = await Promise.all([
    listHeroSlides(context.env),
    getHeroSettings(context.env),
    context.storefront.query(ADMIN_HERO_AUTO_QUERY),
    context.storefront.query(ADMIN_HERO_PRODUCTS_QUERY),
  ]);

  const products: HeroPickerProduct[] = productsData.products.nodes.map((p) => {
    const price = Number(p.priceRange.minVariantPrice.amount);
    const compareAt = p.compareAtPriceRange?.minVariantPrice?.amount
      ? Number(p.compareAtPriceRange.minVariantPrice.amount)
      : null;
    return {
      handle: p.handle,
      title: p.title,
      vendor: p.vendor,
      image: p.featuredImage?.url ?? '',
      price,
      compareAtPrice: compareAt && compareAt > price ? compareAt : null,
      currency: p.priceRange.minVariantPrice.currencyCode,
    };
  });

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

  return data({user, slides, settings, autoLeftCandidates, autoRightCandidates, products}, {headers});
}

type ActionResult =
  | {intent: 'save-settings'; ok: true}
  | {intent: 'add-slide'; ok: true}
  | {intent: 'add-slide'; ok: false; error: string}
  | {intent: 'update-slide'; ok: true}
  | {intent: 'update-slide'; ok: false; error: string}
  | {intent: 'delete-slide'; ok: true}
  | {intent: 'toggle-auto'; ok: true}
  | {intent: 'move-slide'; ok: true};

function slideFromForm(formData: FormData, imageUrl: string, productHandle: string): HeroSlide {
  return {
    position: formData.get('position') === 'right' ? 'right' : 'left',
    order: Number(formData.get('order')) || 0,
    imageUrl,
    // El enlace se puede editar a mano aunque haya un producto vinculado
    // (p. ej. para mandar a una colección usando solo su foto/precio como
    // atajo) — se precarga con la ficha del producto al elegirlo, pero el
    // admin lo puede cambiar, así que aquí siempre se respeta lo que
    // venga en el formulario tal cual.
    href: String(formData.get('href') || '').trim(),
    external: formData.get('external') === 'on',
    badge: String(formData.get('badge') || '').trim(),
    badgeClass:
      (formData.get('badgeClass') as HeroSlide['badgeClass']) || 'storehero__badge--new',
    eyebrow: String(formData.get('eyebrow') || '').trim(),
    title: String(formData.get('title') || '').trim(),
    cta: String(formData.get('cta') || '').trim(),
    ctaClass: (formData.get('ctaClass') as HeroSlide['ctaClass']) || 'btn--primary',
    hideOverlay: formData.get('hideOverlay') === 'on',
    cardSize: formData.get('cardSize') === 'caratula' ? 'caratula' : 'banner',
    productHandle,
  };
}

/** Si se sube una imagen a mano, esa gana siempre. Si no, y el slide está
 * vinculado a un producto, se usa la foto real de ese producto — se vuelve
 * a pedir aquí (no se confía en lo que mande el formulario) para no fiarse
 * de una URL de imagen que alguien podría manipular en el cliente. */
async function resolveImageUrl(
  context: Route.ActionArgs['context'],
  formData: FormData,
  productHandle: string,
  fallbackImageUrl: string,
): Promise<string> {
  const file = formData.get('image');
  if (file instanceof File && file.size > 0) {
    return uploadImageToShopify(context.env, file);
  }
  if (productHandle) {
    const result = await context.storefront.query(
      `#graphql
        query AdminHeroSlideProductImage($handle: String!) {
          product(handle: $handle) { featuredImage { url } }
        }
      `,
      {variables: {handle: productHandle}},
    );
    if (result.product?.featuredImage?.url) return result.product.featuredImage.url;
  }
  return fallbackImageUrl;
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

  if (intent === 'move-slide') {
    const id = String(formData.get('id') || '');
    const existing = (await listHeroSlides(context.env)).find((s) => s.id === id);
    if (existing) {
      await updateHeroSlide(context.env, id, {
        ...existing.slide,
        position: existing.slide.position === 'left' ? 'right' : 'left',
      });
    }
    return data<ActionResult>({intent: 'move-slide', ok: true}, {headers});
  }

  if (intent === 'add-slide') {
    try {
      const productHandle = String(formData.get('productHandle') || '').trim();
      const file = formData.get('image');
      if (!productHandle && (!(file instanceof File) || file.size === 0)) {
        return data<ActionResult>(
          {intent: 'add-slide', ok: false, error: 'Elige una imagen o vincula un producto con foto.'},
          {headers},
        );
      }
      const imageUrl = await resolveImageUrl(context, formData, productHandle, '');
      if (!imageUrl) {
        return data<ActionResult>(
          {intent: 'add-slide', ok: false, error: 'Ese producto no tiene foto — sube una imagen a mano.'},
          {headers},
        );
      }
      await createHeroSlide(context.env, slideFromForm(formData, imageUrl, productHandle));
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

      const productHandle = String(formData.get('productHandle') || '').trim();
      const imageUrl = await resolveImageUrl(context, formData, productHandle, existing.slide.imageUrl);

      await updateHeroSlide(context.env, id, slideFromForm(formData, imageUrl, productHandle));
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

function formatPrice(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat('es-ES', {style: 'currency', currency}).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

/**
 * Todos los campos editables de un slide (vincular a producto, imagen,
 * textos/botón) más la vista previa en vivo — se usa igual para "Añadir"
 * que para "Editar", pasando los valores iniciales en cada caso.
 *
 * Vincular a un producto hace tres cosas solas: fija el enlace a su ficha
 * (no hace falta escribirlo), usa su foto real si no se sube una a mano, y
 * -lo más visible- pinta el precio en la vista previa; si el producto está
 * en oferta (precio comparado más alto) y no se ha escrito una etiqueta a
 * mano, sugiere "Oferta" sola.
 */
function SlideFields({
  products,
  initial,
}: {
  products: HeroPickerProduct[];
  initial?: {
    imageUrl?: string;
    href?: string;
    external?: boolean;
    badge?: string;
    badgeClass?: HeroSlide['badgeClass'];
    eyebrow?: string;
    title?: string;
    cta?: string;
    ctaClass?: HeroSlide['ctaClass'];
    order?: number;
    productHandle?: string;
    hideOverlay?: boolean;
    cardSize?: HeroSlide['cardSize'];
  };
}) {
  const [productHandle, setProductHandle] = useState(initial?.productHandle ?? '');
  const [manualImageSrc, setManualImageSrc] = useState<string | null>(null);
  const [hideOverlay, setHideOverlay] = useState(initial?.hideOverlay ?? false);
  const [cardSize, setCardSize] = useState<NonNullable<HeroSlide['cardSize']>>(initial?.cardSize ?? 'banner');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [badge, setBadge] = useState(initial?.badge ?? '');
  const [badgeClass, setBadgeClass] = useState<HeroSlide['badgeClass']>(
    initial?.badgeClass ?? 'storehero__badge--new',
  );
  const [eyebrow, setEyebrow] = useState(initial?.eyebrow ?? '');
  const [cta, setCta] = useState(initial?.cta ?? '');
  const [ctaClass, setCtaClass] = useState<HeroSlide['ctaClass']>(initial?.ctaClass ?? 'btn--primary');
  const [href, setHref] = useState(initial?.href ?? '');
  const [external, setExternal] = useState(initial?.external ?? false);
  const product = products.find((p) => p.handle === productHandle.trim()) ?? null;

  // Solo autorrellena al ELEGIR un producto (no en cada letra tecleada ni
  // en renders posteriores) — y solo pisa campos que el admin aún no ha
  // tocado a mano, para no borrarle algo que ya haya escrito. El enlace
  // se sigue pudiendo editar a mano después aunque haya un producto
  // vinculado (por ejemplo, para mandar a una colección en vez de a la
  // ficha del producto, usando solo su foto/precio/título como atajo).
  // Va en un useEffect (no directo en el render) — hacerlo ahí con una
  // ref como guarda fallaba en desarrollo por el doble-render de Strict
  // Mode: la ref se marcaba como "ya aplicado" en el render que React
  // descarta, y el real se quedaba sin rellenar.
  useEffect(() => {
    if (!product) return;
    setTitle((prev) => prev || product.title);
    setEyebrow((prev) => prev || product.vendor);
    setHref((prev) => prev || `/products/${product.handle}`);
    setCta((prev) => prev || 'Ver producto');
    setBadge((prev) => {
      if (prev || !product.compareAtPrice) return prev;
      setBadgeClass('storehero__badge--offer');
      return 'Oferta';
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [product?.handle]);

  const previewImage = manualImageSrc ?? product?.image ?? initial?.imageUrl ?? '';

  return (
    <div className="hero-admin__editor">
      <div className="hero-admin__editor-fields">
        <label>Vincular a un producto (opcional)</label>
        <input
          type="text"
          name="productHandle"
          list="hero-products-list"
          value={productHandle}
          placeholder="Escribe el nombre del producto…"
          onChange={(e) => setProductHandle(e.target.value)}
        />
        {productHandle && !product && (
          <p className="admin-hint" style={{color: 'var(--red, #c0392b)'}}>
            No es un producto de la lista — elige uno de las sugerencias o borra el campo.
          </p>
        )}
        {product && (
          <p className="admin-hint">
            Enlazado a <strong>{product.title}</strong> — foto (si no subes una) y precio salen de ahí solos.
            El enlace de abajo se rellena solo con su ficha, pero lo puedes cambiar si quieres mandar a otro
            sitio.
          </p>
        )}

        <label>{product ? 'Imagen (opcional — sin esto se usa la del producto)' : 'Imagen'}</label>
        <input
          type="file"
          name="image"
          accept="image/*"
          required={!product && !initial?.imageUrl}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) {
              setManualImageSrc(null);
              return;
            }
            const reader = new FileReader();
            reader.onload = () => setManualImageSrc(String(reader.result));
            reader.readAsDataURL(file);
          }}
        />

        <label>Enlace</label>
        <input type="text" name="href" value={href} onChange={(e) => setHref(e.target.value)} />
        <label style={{display: 'flex', alignItems: 'center', gap: 6}}>
          <input
            type="checkbox"
            name="external"
            checked={external}
            onChange={(e) => setExternal(e.target.checked)}
            style={{width: 'auto'}}
          />
          Enlace externo
        </label>

        <label style={{display: 'flex', alignItems: 'center', gap: 6, marginTop: 10}}>
          <input
            type="checkbox"
            name="hideOverlay"
            checked={hideOverlay}
            onChange={(e) => setHideOverlay(e.target.checked)}
            style={{width: 'auto'}}
          />
          Solo imagen (sin texto ni botón encima)
        </label>
        <p className="admin-hint" style={{margin: '2px 0 0'}}>
          Sigue siendo clicable — va al enlace o producto de arriba igual que cualquier slide.
        </p>

        <label style={{marginTop: 10}}>Proporción</label>
        <select name="cardSize" value={cardSize} onChange={(e) => setCardSize(e.target.value as typeof cardSize)}>
          <option value="banner">Banner (panorámico)</option>
          <option value="caratula">Carátula (menos panorámico, para fotos de producto)</option>
        </select>

        {!hideOverlay && (
          <div className="hero-admin__field-grid">
            <div>
              <label>Etiqueta (badge)</label>
              <input type="text" name="badge" value={badge} onChange={(e) => setBadge(e.target.value)} />
            </div>
            <div>
              <label>Tipo de etiqueta</label>
              <select name="badgeClass" value={badgeClass} onChange={(e) => setBadgeClass(e.target.value as HeroSlide['badgeClass'])}>
                {BADGE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="hero-admin__field-grid--full">
              <label>Texto pequeño (eyebrow)</label>
              <input type="text" name="eyebrow" value={eyebrow} onChange={(e) => setEyebrow(e.target.value)} />
            </div>
            <div className="hero-admin__field-grid--full">
              <label>Título</label>
              <input type="text" name="title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              <label>Texto del botón</label>
              <input type="text" name="cta" value={cta} onChange={(e) => setCta(e.target.value)} />
            </div>
            <div>
              <label>Estilo del botón</label>
              <select name="ctaClass" value={ctaClass} onChange={(e) => setCtaClass(e.target.value as HeroSlide['ctaClass'])}>
                {CTA_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>
        )}
        <div className="hero-admin__field-grid">
          <div>
            <label>Orden</label>
            <input type="number" name="order" defaultValue={initial?.order ?? 0} />
          </div>
        </div>

      </div>

      <div className="hero-admin__editor-preview">
        <span className="admin-hint" style={{display: 'block', marginBottom: 8}}>
          Vista previa
        </span>
        <div
          className={`storehero__slide hero-admin__live-preview${hideOverlay ? ' storehero__slide--plain' : ''}${cardSize === 'caratula' ? ' storehero__slide--caratula' : ''}`}
        >
          {previewImage && <img className="storehero__slide-img" src={previewImage} alt="" />}
          {!hideOverlay && (
            <>
              {badge && <span className={`storehero__badge ${badgeClass}`}>{badge}</span>}
              <div className="storehero__info">
                {eyebrow && <div className="storehero__eyebrow">{eyebrow}</div>}
                <h2 className="storehero__title">{title || 'Título del slide'}</h2>
                {product && (
                  <div className="storehero__price">
                    <span className="now">{formatPrice(product.price, product.currency)}</span>
                    {product.compareAtPrice && (
                      <span className="was">{formatPrice(product.compareAtPrice, product.currency)}</span>
                    )}
                  </div>
                )}
                <span className={`btn ${ctaClass}`}>{cta || 'Botón'}</span>
              </div>
            </>
          )}
        </div>
        {href && <p className="admin-hint">Enlace: {href}</p>}
      </div>
    </div>
  );
}

export default function AdminHero() {
  const {user, slides, settings, autoLeftCandidates, autoRightCandidates, products} = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isBusy = navigation.state !== 'idle';

  const leftSlides = slides.filter((s) => s.slide.position === 'left');
  const rightSlides = slides.filter((s) => s.slide.position === 'right');
  // Mismo orden en que StoreHero las junta de verdad en la web (ver
  // app/components/StoreHero.tsx: allSlides = [...leftSlides, ...rightSlides]).
  const allManualSlides = [...leftSlides, ...rightSlides];
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

      <datalist id="hero-products-list">
        {products.map((p) => (
          <option key={p.handle} value={p.handle} label={`${p.title} — ${p.vendor}`} />
        ))}
      </datalist>

      {/* Antes había dos paneles visuales lado a lado en la home; ahora el
          carrusel es uno solo (StoreHero junta izquierda+derecha en una
          única tira, ver app/components/StoreHero.tsx), así que aquí
          también va todo en una sola lista — en el mismo orden en que
          salen de verdad en la web (izquierda primero, luego derecha,
          cada mitad por su "Orden"). "Izquierda/derecha" sigue existiendo
          por dentro solo para decidir qué mitad de esa tira ocupa cada
          slide. */}
      <div className="admin-card">
        <div className="hero-admin__side-head" style={{marginTop: 0}}>
          <span className="dot" />
          <h2>Slides del banner</h2>
          <span className="hero-admin__count">
            {allManualSlides.length} tuya{allManualSlides.length === 1 ? '' : 's'}
          </span>
        </div>

        {allManualSlides.length === 0 && (
          <div className="hero-admin__empty">Sin slides manuales todavía — añade la primera abajo.</div>
        )}

        <div className="hero-admin__list">
          {allManualSlides.map(({id, slide}) => (
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
                    style={{position: 'absolute', right: 0, top: 36, zIndex: 5, width: 640, maxWidth: '90vw', boxShadow: 'var(--shadow-lg)'}}
                  >
                    <Form method="post" encType="multipart/form-data" className="admin-form" key={id}>
                      <input type="hidden" name="intent" value="update-slide" />
                      <input type="hidden" name="id" value={id} />
                      <input type="hidden" name="position" value={slide.position} />
                      <SlideFields
                        products={products}
                        initial={{
                          imageUrl: slide.imageUrl,
                          href: slide.href,
                          external: slide.external,
                          badge: slide.badge,
                          badgeClass: slide.badgeClass,
                          eyebrow: slide.eyebrow,
                          title: slide.title,
                          cta: slide.cta,
                          ctaClass: slide.ctaClass,
                          order: slide.order,
                          productHandle: slide.productHandle,
                        }}
                      />
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

        <details className="hero-admin__add-tile" style={{display: 'block', border: 'none', padding: 0, marginTop: 16}}>
          <summary className="hero-admin__add-tile">+ Añadir slide</summary>
          <div className="hero-admin__add-form">
            <Form method="post" encType="multipart/form-data" className="admin-form">
              <input type="hidden" name="intent" value="add-slide" />
              <input type="hidden" name="position" value="left" />
              <SlideFields products={products} />
              <button type="submit" className="admin-btn admin-btn--primary" style={{marginTop: 8}} disabled={isBusy}>
                {isBusy ? 'Subiendo…' : 'Añadir slide'}
              </button>
            </Form>
            {actionData?.intent === 'add-slide' && !actionData.ok && (
              <p className="admin-msg--error">{actionData.error}</p>
            )}
          </div>
        </details>

        <h2 style={{marginTop: 28}}>Relleno automático</h2>
        <p className="admin-hint">
          Si se queda sin slides manuales (o si quieres dejarlo siempre activo como añadido), se completa solo
          con el producto novedad / más vendido. Con los interruptores de abajo lo activas o desactivas; con el
          botón "Ocultar" de cada tarjeta puedes quitar solo una tarjeta concreta del relleno, sin tocar las
          demás.
        </p>
        <Form method="post">
          <input type="hidden" name="intent" value="save-settings" />
          <div className="hero-admin__toggle-row">
            <div className="hero-admin__toggle-text">
              <strong>Producto novedad</strong>
              <span>Se usa si faltan fotos</span>
            </div>
            <input type="checkbox" className="hero-admin__switch" name="leftAutoFallback" defaultChecked={settings.leftAutoFallback} />
          </div>
          <div className="hero-admin__toggle-row">
            <div className="hero-admin__toggle-text">
              <strong>Más vendido + contacto</strong>
              <span>Tarjetas de "escríbenos" / "ven a la tienda"</span>
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

        {(['left', 'right'] as const).map((position) => {
          const autoCandidates = position === 'left' ? autoLeftCandidates : autoRightCandidates;
          const autoFallbackOn = position === 'left' ? settings.leftAutoFallback : settings.rightAutoFallback;

          return (
            <div key={position}>
              <div className="hero-admin__side-head">
                {position === 'left' ? 'Producto novedad' : 'Más vendido + contacto'}
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
            </div>
          );
        })}
      </div>
    </AdminShell>
  );
}
