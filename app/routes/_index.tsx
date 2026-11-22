import type {CSSProperties} from 'react';
import {useLoaderData, Link} from 'react-router';
import type {Route} from './+types/_index';
import {Money} from '@shopify/hydrogen';
import {PRODUCT_CARD_FRAGMENT, MENU_FRAGMENT} from '~/lib/fragments';
import {findCategoriesMenuItem, categoryGroups, subcategoriesOf} from '~/lib/categoryMenu';
import {ProductCard} from '~/components/ProductCard';
import {StoreHero, type HeroSlide} from '~/components/StoreHero';
import {QuoteForm} from '~/components/QuoteForm';
import {GOOGLE_REVIEWS_URL, RatingBadge, Testimonials} from '~/components/Testimonials';
import {BrandsTicker} from '~/components/BrandsTicker';
import {FeaturedProducts} from '~/components/FeaturedProducts';
import {Icon, type IconName} from '~/lib/icons';
import {useI18n} from '~/lib/i18n';
import {getHeroSettings, listHeroSlides} from '~/lib/heroSlides.server';
import {listFaqItems} from '~/lib/faq.server';
import {listCategoryCovers} from '~/lib/categoryCovers.server';
import {getLocaleFromRequest} from '~/lib/locales';
import {Faq} from '~/components/Faq';
import {jsonLdHtml} from '~/lib/jsonLd';
import {findBrandLogoByVendor} from '~/lib/brands';

export const meta: Route.MetaFunction = () => {
  const title = 'Victor So Professional — Equipos DJ, Sonido y Audiovisuales';
  const description =
    'Tienda física y online en Lloret de Mar desde 1987: equipos DJ, sonido profesional, iluminación y material audiovisual. Tienda autorizada Pioneer DJ y AlphaTheta. Envío gratis desde 149€.';
  return [
    {title},
    {name: 'description', content: description},
    {tagName: 'link', rel: 'canonical', href: 'https://www.victorso.es/'},
    {property: 'og:type', content: 'website'},
    {property: 'og:title', content: title},
    {property: 'og:description', content: description},
    {property: 'og:url', content: 'https://www.victorso.es/'},
    {property: 'og:image', content: 'https://www.victorso.com/victorso/uploads/imagenes/logos/Logo_WEB_Blanco2.png'},
  ];
};

export async function loader({context, request}: Route.LoaderArgs) {
  const {storefront} = context;
  const locale = getLocaleFromRequest(request);
  const [{products, newest: newestByDate}, {collections}, manualSlides, heroSettings, faqItems, categoryCovers, {menu}] =
    await Promise.all([
      storefront.query(HOME_PRODUCTS_QUERY),
      storefront.query(HOME_COLLECTIONS_QUERY),
      listHeroSlides(context.env),
      getHeroSettings(context.env),
      listFaqItems(context.env, locale),
      listCategoryCovers(context.env),
      // El árbol "Categorías" del menú de Shopify — misma fuente de
      // verdad que el mega-menú y las páginas de categoría, ver
      // ~/lib/categoryMenu y CATEGORIAS.md.
      storefront.query(CATEGORIES_MENU_QUERY),
    ]);

  // Slides del hero vinculados a un producto (ver /admin-interno/hero): el
  // precio (y si está en oferta) se trae en vivo en cada carga de la home,
  // nunca se guarda fijo — así nunca se queda desactualizado si cambia el
  // precio en Shopify.
  const linkedHandles = [...new Set(manualSlides.map((s) => s.slide.productHandle).filter(Boolean))];
  const linkedProducts = linkedHandles.length
    ? (
        await storefront.query(HOME_HERO_LINKED_PRODUCTS_QUERY, {
          variables: {query: linkedHandles.map((h) => `handle:'${h}'`).join(' OR ')},
        })
      ).products.nodes
    : [];

  // "Novedades": Víctor pidió (2026-11-22) que esto sean siempre, de
  // verdad, los últimos productos añadidos a Shopify (por fecha de
  // creación real, no por nombre/handle) — antes una colección de
  // curación manual ("Novedades destacadas (Home)") podía pisar esto,
  // y se quedó con un solo producto puesto hace tiempo sin que nadie se
  // diera cuenta de que ya no mostraba lo último de verdad.
  const newest = newestByDate.nodes;
  const offers = products.nodes
    .filter(
      (p) =>
        p.compareAtPriceRange?.minVariantPrice &&
        parseFloat(p.compareAtPriceRange.minVariantPrice.amount) >
          parseFloat(p.priceRange.minVariantPrice.amount),
    )
    .slice(0, 4);
  // "frontpage" es la colección automática de Shopify con todos los
  // productos; no es una categoría real. "novedades-destacadas-home" es de
  // uso interno (elige qué sale en el hero) y tampoco debe listarse como
  // categoría. Solo mostramos categorías que ya tienen productos asignados
  // en el catálogo actual.
  // La carátula de cada categoría: si hay una elegida a mano desde
  // /admin-interno/categorias se usa esa; si no, la foto del primer
  // producto real de esa categoría (nunca la imagen nativa de la colección
  // en Shopify Admin — todo se gestiona desde nuestro panel), siempre la
  // misma mientras no cambie el catálogo o se fije una carátula manual.
  // Solo las categorías principales del menú "Categorías" de Shopify —
  // antes salían mezcladas con todas las subcategorías con producto,
  // que aquí abultaban de más (p.ej. "Controladoras — Zona DJ" junto a
  // "Zona DJ" mismo). No se filtra por "tiene producto propio": la
  // mayoría de categorías son colecciones "bare" con 0 productos
  // directos a propósito (sus productos están en las subcategorías) —
  // exigir products.length>0 aquí las dejaría casi todas fuera.
  const categoriesItem = findCategoriesMenuItem(menu);
  const groupHandles = new Set(categoryGroups(categoriesItem).map((g) => g.handle));
  const collectionByHandle = new Map(collections.nodes.map((c) => [c.handle, c]));
  // La propia colección "bare" de la categoría casi nunca tiene producto
  // directo (vive en sus subcategorías, ver nota de abajo) — si no tiene
  // foto propia, se busca la primera foto entre sus subcategorías antes
  // de rendirse al icono genérico.
  function firstPhotoFor(c: (typeof collections.nodes)[number]) {
    const ownPhoto = c.products.nodes.find((p) => p.featuredImage)?.featuredImage;
    if (ownPhoto) return ownPhoto;
    for (const sub of subcategoriesOf(categoriesItem, c.handle)) {
      const subCollection = collectionByHandle.get(sub.handle);
      const photo = subCollection?.products.nodes.find((p) => p.featuredImage)?.featuredImage;
      if (photo) return photo;
    }
    return null;
  }
  // Productos reales de una categoría (misma lógica que firstPhotoFor,
  // pero la lista entera, no solo el primero) — para el relleno de "más
  // vendidos" mientras no haya ventas de verdad, ver nota en
  // heroSlides.server.ts (useRealBestsellers).
  function productsFor(c: (typeof collections.nodes)[number]) {
    if (c.products.nodes.length) return c.products.nodes;
    for (const sub of subcategoriesOf(categoriesItem, c.handle)) {
      const subCollection = collectionByHandle.get(sub.handle);
      if (subCollection?.products.nodes.length) return subCollection.products.nodes;
    }
    return [];
  }
  // Uno de cada categoría primero (variedad) y, si con eso no se llega a
  // targetCount (p.ej. 6 categorías para una fila de 4 completa, ver
  // .prodgrid), una segunda vuelta con el siguiente producto de cada
  // categoría que le quede — así no deja huecos al final de la fila sin
  // amontonar todo el relleno en una sola categoría.
  function representativeProducts(handles: string[], targetCount: number) {
    const perCategory = handles.map((handle) => {
      const c = collectionByHandle.get(handle);
      return c ? productsFor(c) : [];
    });
    const seen = new Set<string>();
    const result: (typeof products.nodes)[number][] = [];
    for (let round = 0; result.length < targetCount; round++) {
      let addedAny = false;
      for (const list of perCategory) {
        if (result.length >= targetCount) break;
        const candidate = list[round];
        if (candidate && !seen.has(candidate.id)) {
          seen.add(candidate.id);
          result.push(candidate);
          addedAny = true;
        }
      }
      if (!addedAny) break;
    }
    return result;
  }
  // Sin ventas reales todavía, el ranking "más vendidos" de Shopify
  // (sortKey BEST_SELLING) no significa nada — con todo empatado a 0
  // ventas, Shopify deshace el empate con algún criterio interno que en
  // la práctica salía siempre "lo último que se ha subido" (p.ej. todo
  // cables). Mientras heroSettings.useRealBestsellers esté apagado
  // (/admin-interno/hero), se enseña un producto de cada categoría en
  // su lugar, para que salga variado — en cuanto Víctor lo active desde
  // ahí, vuelve a usar el ranking real de Shopify sin tocar código.
  const bestsellersFallback = representativeProducts(Array.from(groupHandles), 8);
  const bestselling = heroSettings.useRealBestsellers
    ? (products.nodes[0] ?? null)
    : (bestsellersFallback[0] ?? products.nodes[0] ?? null);
  const bestsellers = heroSettings.useRealBestsellers ? products.nodes.slice(0, 8) : bestsellersFallback;
  const collectionsWithProducts = collections.nodes
    .filter((c) => groupHandles.has(c.handle))
    // Tope de 10 (2 filas de 5) para que las tarjetas salgan grandes — si
    // hay más categorías de las que caben aquí, "Ver todas las categorías"
    // lleva a /collections, que sí las muestra todas sin límite.
    .slice(0, 10)
    .map((c) => {
      const override = categoryCovers[c.handle];
      return {
        id: c.id,
        handle: c.handle,
        title: c.title,
        photo: override ? {url: override, altText: c.title} : firstPhotoFor(c),
        hasCustomCover: Boolean(override),
      };
    });
  // Víctor pidió (2026-11-22) que todas las categorías salgan en una
  // sola fila, nunca repartidas en dos.
  const catColumns = Math.max(collectionsWithProducts.length, 1);

  return {
    newest,
    bestselling,
    offers,
    bestsellers,
    collections: collectionsWithProducts,
    catColumns,
    manualSlides,
    heroSettings,
    linkedProducts,
    faq: faqItems.map((f) => f.item),
  };
}

function categoryIcon(title: string): IconName {
  const t = title.toLowerCase();
  if (t.includes('dj')) return 'sliders';
  if (t.includes('sonido') || t.includes('altavo') || t.includes('acúst') || t.includes('acust')) return 'speaker';
  if (t.includes('auricular')) return 'headphones';
  if (t.includes('cable')) return 'plug';
  if (t.includes('estudio') || t.includes('micro')) return 'mic';
  if (t.includes('flight') || t.includes('case') || t.includes('bolsa') || t.includes('malet')) return 'suitcase';
  if (t.includes('outlet')) return 'tag';
  return 'tag';
}

export default function Homepage() {
  const {newest, bestselling, offers, bestsellers, collections, catColumns, manualSlides, heroSettings, linkedProducts, faq} =
    useLoaderData<typeof loader>();
  const {t} = useI18n();

  const linkedByHandle = new Map(linkedProducts.map((p) => [p.handle, p]));

  function manualSlideToHero({id, slide}: (typeof manualSlides)[number]): HeroSlide {
    const linked = slide.productHandle ? linkedByHandle.get(slide.productHandle) : undefined;
    const price = linked?.priceRange.minVariantPrice;
    const compareAtAmount = linked?.compareAtPriceRange?.minVariantPrice?.amount;
    const onSale = price && compareAtAmount && parseFloat(compareAtAmount) > parseFloat(price.amount);
    const variant = linked?.selectedOrFirstAvailableVariant;

    return {
      key: `manual-${id}`,
      description: linked?.description,
      brandLogo: linked?.vendor ? findBrandLogoByVendor(linked.vendor) : null,
      addToCart: variant?.availableForSale ? {merchandiseId: variant.id} : undefined,
      href: slide.href,
      external: slide.external,
      image: slide.imageUrl,
      // Si el producto vinculado está en oferta ahora mismo, la etiqueta
      // "Oferta" manda sobre la que se guardó al crear el slide — puede
      // que no estuviera en oferta entonces, o haya dejado de estarlo.
      badge: onSale ? t('storeHeroOfferBadge') : slide.badge,
      badgeClass: onSale ? 'storehero__badge--offer' : slide.badgeClass,
      eyebrow: slide.eyebrow,
      title: slide.title,
      priceNode: price ? (
        <div className="storehero__price">
          <span className="now">
            <Money data={price} />
          </span>
          {onSale && compareAtAmount && (
            <span className="was">
              <Money data={{amount: compareAtAmount, currencyCode: price.currencyCode}} />
            </span>
          )}
        </div>
      ) : undefined,
      cta: slide.cta,
      ctaClass: slide.ctaClass,
      hideOverlay: slide.hideOverlay,
      cardSize: slide.cardSize,
    };
  }

  const manualLeft: HeroSlide[] = manualSlides
    .filter(({slide}) => slide.position === 'left')
    .map(manualSlideToHero);
  const manualRight: HeroSlide[] = manualSlides
    .filter(({slide}) => slide.position === 'right')
    .map(manualSlideToHero);

  const hiddenAutoKeys = heroSettings.hiddenAutoKeys ?? [];

  const autoLeft: HeroSlide[] = newest
    .map((p) => ({
      key: `new-${p.id}`,
      href: `/products/${p.handle}`,
      image: p.featuredImage?.url ?? '',
      badge: t('storeHeroNewBadge'),
      badgeClass: 'storehero__badge--new' as const,
      eyebrow: p.vendor,
      title: p.title,
      description: p.description,
      brandLogo: findBrandLogoByVendor(p.vendor),
      cta: t('storeHeroNewCta'),
      ctaClass: 'btn--outline' as const,
      addToCart: p.selectedOrFirstAvailableVariant?.availableForSale
        ? {merchandiseId: p.selectedOrFirstAvailableVariant.id}
        : undefined,
      cardSize: 'caratula' as const,
    }))
    .filter((s) => !hiddenAutoKeys.includes(s.key));
  const leftSlides: HeroSlide[] = [...manualLeft, ...(heroSettings.leftAutoFallback ? autoLeft : [])];

  const autoRight: HeroSlide[] = [];
  if (bestselling) {
    autoRight.push({
      key: `best-${bestselling.id}`,
      href: `/products/${bestselling.handle}`,
      image: bestselling.featuredImage?.url ?? '',
      badge: t('storeHeroBestsellerBadge'),
      badgeClass: 'storehero__badge--offer',
      eyebrow: bestselling.vendor,
      title: bestselling.title,
      description: bestselling.description,
      brandLogo: findBrandLogoByVendor(bestselling.vendor),
      priceNode: (
        <div className="storehero__price">
          <span className="now">
            <Money data={bestselling.priceRange.minVariantPrice} />
          </span>
        </div>
      ),
      cta: t('storeHeroBestsellerCta'),
      ctaClass: 'btn--primary',
      addToCart: bestselling.selectedOrFirstAvailableVariant?.availableForSale
        ? {merchandiseId: bestselling.selectedOrFirstAvailableVariant.id}
        : undefined,
      cardSize: 'caratula',
    });
  }
  autoRight.push(
    {
      key: 'contact',
      href: 'https://wa.me/34619406443',
      external: true,
      image: '/assets/tienda-fachada.jpeg',
      badge: t('storeHeroContactBadge'),
      badgeClass: 'storehero__badge--brand',
      eyebrow: '972 364 114',
      title: t('storeHeroContactTitle'),
      cta: t('storeHeroContactCta'),
      ctaClass: 'btn--outline',
      cardSize: 'caratula',
    },
    {
      key: 'visit',
      href: '/quienes-somos',
      image: '/assets/tienda-fachada.jpeg',
      badge: t('storeHeroVisitBadge'),
      badgeClass: 'storehero__badge--brand',
      eyebrow: t('storeHeroVisitEyebrow'),
      title: t('storeHeroVisitTitle'),
      cta: t('storeHeroVisitCta'),
      ctaClass: 'btn--outline',
      cardSize: 'caratula',
    },
  );
  const rightSlides: HeroSlide[] = [
    ...manualRight,
    ...(heroSettings.rightAutoFallback ? autoRight.filter((s) => !hiddenAutoKeys.includes(s.key)) : []),
  ];

  return (
    <div className="home">
      <StoreHero leftSlides={leftSlides} rightSlides={rightSlides} />

      {/* La franja de confianza ya va integrada en el propio hero
          (storehero__trustbar) — no hace falta repetirla aquí debajo. */}

      {/* 1. Accesos directos: ver todo el catálogo o ir directamente a
          categorías (antes vivían dentro del propio hero). */}
      <div className="hero-ctaRow">
        <Link className="storehero__ctaBtn" to="/collections/all">
          <span className="storehero__ctaBtn-text">{t('storeHeroCtaBtn')}</span>
          <span className="storehero__ctaBtn-arrow"><Icon name="arrowRight" /></span>
        </Link>
        <a href="#categorySection" className="storehero__ctaBtn storehero__ctaBtn--outline">
          <span className="storehero__ctaBtn-text">{t('storeHeroCatBtn')}</span>
          <span className="storehero__ctaBtn-arrow"><Icon name="arrowRight" /></span>
        </a>
      </div>

      {/* 2. Encuentra tu equipo: fila compacta de categorías, justo
          después del banner (sustituye a la cuadrícula grande de "Compra
          por categoría"). */}
      <section className="section reveal" id="categorySection">
        <div className="container">
          <div className="section__head">
            <h2>{t('findEquipmentTitle')}</h2>
            <Link to="/collections">
              {t('viewAllCategories')} <Icon name="arrowRight" />
            </Link>
          </div>
          <div className="catrow" style={{'--cat-cols': catColumns} as CSSProperties}>
            {collections.map((c) => {
              const photo = c.photo;
              const hasCustomCover = c.hasCustomCover;
              return (
                <Link
                  key={c.id}
                  className={`catrow__card${hasCustomCover ? '' : ' catrow__card--plain'}`}
                  to={`/collections/${c.handle}`}
                >
                  <Icon name={categoryIcon(c.title)} className="catrow__icon" />
                  {photo && <img src={photo.url} alt={photo.altText ?? c.title} loading="lazy" />}
                  <span className="catrow__label">{c.title}</span>
                  <Icon name="arrowRight" className="catrow__arrow" />
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* 3. Carrusel de marcas — entre categorías y productos destacados,
          a petición de Víctor (2026-11-22). */}
      <section className="section reveal">
        <div className="container">
          <div className="section__head">
            <h2>{t('brandsLabel')}</h2>
          </div>
        </div>
        <BrandsTicker />
      </section>

      {/* 4. Productos destacados, con pestañas (sustituye a "Más valorados" + "Ofertas") */}
      <FeaturedProducts bestsellers={bestsellers} newest={newest} offers={offers} />

      {/* Banda de envío gratis, de separador entre Marcas y Ofertas */}
      <div className="shipband">
        <Icon name="truck" />
        <span>{t('shipBar')} 149€</span>
      </div>

      {/* 5. Descubre más de Victor So */}
      <section className="section discover reveal">
        <div className="container">
          <div className="section__head">
            <h2>{t('discoverTitle')}</h2>
          </div>
          <div className="discover__grid">
            <Link
              className="discover__card"
              to="/instalaciones"
              style={{backgroundImage: "url('/assets/instalacion-paseo-maritimo.jpeg')"}}
            >
              <span className="discover__icon"><Icon name="speaker" /></span>
              <div className="discover__info">
                <h3>{t('discoverInstallTitle')}</h3>
                <p>{t('discoverInstallText')}</p>
                <span className="discover__link">{t('discoverLink')} <Icon name="arrowRight" /></span>
              </div>
            </Link>
            <a
              className="discover__card discover__card--whatsapp"
              href="https://wa.me/34619406443"
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="discover__icon"><Icon name="whatsapp" /></span>
              <div className="discover__info">
                <h3>{t('discoverContactTitle')}</h3>
                <p>{t('discoverContactText')}</p>
                <span className="discover__link">{t('discoverLink')} <Icon name="arrowRight" /></span>
              </div>
            </a>
            <Link
              className="discover__card"
              to="/quienes-somos"
              style={{backgroundImage: "url('/assets/tienda-fachada.jpeg')"}}
            >
              <span className="discover__icon"><Icon name="shield" /></span>
              <div className="discover__info">
                <h3>{t('discoverAboutTitle')}</h3>
                <p>{t('discoverAboutText')}</p>
                <span className="discover__link">{t('discoverLink')} <Icon name="arrowRight" /></span>
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* 6. Reseñas, con botón para dejar una opinión en Google */}
      <section className="section reveal">
        <div className="container">
          <div className="section__head">
            <h2>Lo que dicen de nosotros</h2>
            <RatingBadge compact />
          </div>
          <Testimonials />
          <a
            className="btn btn--outline testimonials__cta"
            href={GOOGLE_REVIEWS_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Icon name="star" /> {t('writeReviewCta')}
          </a>
        </div>
      </section>

      {/* 7. Solicita presupuesto + Preguntas frecuentes */}
      <section className="section section--muted reveal">
        <div className="container quoteform-section">
          <div className="quoteform-section__info">
            <h2>{t('quoteFormTitle')}</h2>
            <p>{t('techIntro')}</p>
          </div>
          <QuoteForm compact />
        </div>
      </section>

      <Faq items={faq} />

      {/* Sugiere a Google el cuadro de búsqueda bajo el resultado de marca
          ("sitelinks search box") — los demás sitelinks (enlaces a páginas
          internas) los decide Google solo según la autoridad del dominio y
          la estructura del sitio, no hay forma de pedirlos directamente. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdHtml({
            '@context': 'https://schema.org',
            '@type': 'WebSite',
            url: 'https://www.victorso.es/',
            name: 'Victor So Professional',
            potentialAction: {
              '@type': 'SearchAction',
              target: 'https://www.victorso.es/search?q={search_term_string}',
              'query-input': 'required name=search_term_string',
            },
          }),
        }}
      />
    </div>
  );
}

const HOME_HERO_LINKED_PRODUCTS_QUERY = `#graphql
  query HomeHeroLinkedProducts($query: String!, $country: CountryCode, $language: LanguageCode)
    @inContext(country: $country, language: $language) {
    products(first: 20, query: $query) {
      nodes {
        handle
        vendor
        description(truncateAt: 140)
        priceRange { minVariantPrice { amount currencyCode } }
        compareAtPriceRange { minVariantPrice { amount } }
        selectedOrFirstAvailableVariant(ignoreUnknownOptions: true, selectedOptions: []) {
          id
          availableForSale
        }
      }
    }
  }
` as const;

const HOME_PRODUCTS_QUERY = `#graphql
  ${PRODUCT_CARD_FRAGMENT}
  query HomeProducts($country: CountryCode, $language: LanguageCode)
    @inContext(country: $country, language: $language) {
    products(first: 16, sortKey: BEST_SELLING) {
      nodes {
        ...ProductCard
      }
    }
    newest: products(first: 8, sortKey: CREATED_AT, reverse: true) {
      nodes {
        ...ProductCard
      }
    }
  }
` as const;

// El árbol "Categorías" del menú de Shopify — ver ~/lib/categoryMenu y
// CATEGORIAS.md. Misma query que usa el header (MENU_FRAGMENT en
// ~/lib/fragments), pedida aparte aquí porque esta ruta no comparte el
// loader de la raíz.
const CATEGORIES_MENU_QUERY = `#graphql
  ${MENU_FRAGMENT}
  query CategoriesMenuHome($country: CountryCode, $language: LanguageCode)
    @inContext(country: $country, language: $language) {
    menu(handle: "main-menu") {
      ...Menu
    }
  }
` as const;

// Productos completos (no solo id+foto) de cada colección — hace falta
// para poder enseñar un producto real de cada categoría como relleno
// de "más vendidos" mientras no haya ventas de verdad (ver más abajo,
// heroSettings.useRealBestsellers). Primeros 3 de cada una, de sobra
// para encontrar uno con foto sin pedir el catálogo entero de golpe.
const HOME_COLLECTIONS_QUERY = `#graphql
  ${PRODUCT_CARD_FRAGMENT}
  query HomeCollections($country: CountryCode, $language: LanguageCode)
    @inContext(country: $country, language: $language) {
    collections(first: 100, sortKey: TITLE) {
      nodes {
        id
        handle
        title
        products(first: 3) {
          nodes {
            ...ProductCard
          }
        }
      }
    }
  }
` as const;
