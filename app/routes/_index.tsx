import {useLoaderData, Link} from 'react-router';
import type {Route} from './+types/_index';
import {Money} from '@shopify/hydrogen';
import {PRODUCT_CARD_FRAGMENT} from '~/lib/fragments';
import {ProductCard} from '~/components/ProductCard';
import {StoreHero, type HeroSlide} from '~/components/StoreHero';
import {QuoteForm} from '~/components/QuoteForm';
import {RatingBadge, Testimonials} from '~/components/Testimonials';
import {Icon, type IconName} from '~/lib/icons';
import {useI18n} from '~/lib/i18n';

export const meta: Route.MetaFunction = () => {
  return [{title: 'Victor So Professional — Equipos DJ, Sonido y Audiovisuales'}];
};

export async function loader({context}: Route.LoaderArgs) {
  const {storefront} = context;
  const [{products, newest: newestByDate, featuredHome}, {collections}] = await Promise.all([
    storefront.query(HOME_PRODUCTS_QUERY),
    storefront.query(HOME_COLLECTIONS_QUERY),
  ]);

  // "Novedades" del hero: si Iván ha metido productos a mano en la colección
  // "Novedades destacadas (Home)" (Shopify > Colecciones), se usan esos en
  // el orden que él les dé; si la deja vacía, se muestran los 3 productos
  // más nuevos de verdad (por fecha de creación real, no por nombre/handle).
  const newest = featuredHome?.products?.nodes?.length
    ? featuredHome.products.nodes.slice(0, 3)
    : newestByDate.nodes;
  const bestselling = products.nodes[0] ?? null;
  const offers = products.nodes
    .filter(
      (p) =>
        p.compareAtPriceRange?.minVariantPrice &&
        parseFloat(p.compareAtPriceRange.minVariantPrice.amount) >
          parseFloat(p.priceRange.minVariantPrice.amount),
    )
    .slice(0, 4);
  const bestsellers = products.nodes.slice(0, 8);
  // "frontpage" es la colección automática de Shopify con todos los
  // productos; no es una categoría real. "novedades-destacadas-home" es de
  // uso interno (elige qué sale en el hero) y tampoco debe listarse como
  // categoría. Solo mostramos categorías que ya tienen productos asignados
  // en el catálogo actual.
  const collectionsWithProducts = collections.nodes
    .filter(
      (c) =>
        c.handle !== 'frontpage' &&
        c.handle !== 'novedades-destacadas-home' &&
        c.products.nodes.length > 0,
    )
    .slice(0, 9);

  return {newest, bestselling, offers, bestsellers, collections: collectionsWithProducts};
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
  const {newest, bestselling, offers, bestsellers, collections} =
    useLoaderData<typeof loader>();
  const {t} = useI18n();

  const leftSlides: HeroSlide[] = newest.map((p) => ({
    key: `new-${p.id}`,
    href: `/products/${p.handle}`,
    image: p.featuredImage?.url ?? '',
    badge: t('storeHeroNewBadge'),
    badgeClass: 'storehero__badge--new',
    eyebrow: p.vendor,
    title: p.title,
    cta: t('storeHeroNewCta'),
    ctaClass: 'btn--outline',
  }));

  const rightSlides: HeroSlide[] = [];
  if (bestselling) {
    rightSlides.push({
      key: `best-${bestselling.id}`,
      href: `/products/${bestselling.handle}`,
      image: bestselling.featuredImage?.url ?? '',
      badge: t('storeHeroBestsellerBadge'),
      badgeClass: 'storehero__badge--offer',
      eyebrow: bestselling.vendor,
      title: bestselling.title,
      priceNode: (
        <div className="storehero__price">
          <span className="now">
            <Money data={bestselling.priceRange.minVariantPrice} />
          </span>
        </div>
      ),
      cta: t('storeHeroBestsellerCta'),
      ctaClass: 'btn--primary',
    });
  }
  rightSlides.push(
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
    },
  );

  return (
    <div className="home">
      <StoreHero leftSlides={leftSlides} rightSlides={rightSlides} />

      <section className="section reveal" id="categorySection">
        <div className="container">
          <div className="section__head">
            <h2>{t('sectionCategories')}</h2>
          </div>
          <div className="catgrid">
            {collections.map((c) => {
              // Usamos la foto de portada de la colección si el admin la ha
              // subido; si no, la del primer producto real de esa categoría,
              // para que las categorías nuevas ya se vean bien sin configurar nada.
              const photo = c.image ?? c.products.nodes[0]?.featuredImage;
              return (
                <Link key={c.id} className="catcard" to={`/collections/${c.handle}`}>
                  <Icon name={categoryIcon(c.title)} className="catcard__icon" />
                  {photo && <img src={photo.url} alt={photo.altText ?? c.title} loading="lazy" />}
                  <span className="catcard__label">{c.title}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

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

      <div className="shipband">
        <Icon name="truck" />
        <span>{t('shipBar')} 149€</span>
      </div>

      {offers.length > 0 && (
        <section className="section section--muted reveal">
          <div className="container">
            <div className="section__head">
              <h2>{t('sectionOffers')}</h2>
              <Link to="/collections/outlet">
                {t('sectionOffersLink')} <Icon name="arrowRight" />
              </Link>
            </div>
            <div className="prodgrid">
              {offers.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="section reveal">
        <div className="container">
          <div className="section__head">
            <h2>{t('sectionBestsellers')}</h2>
          </div>
          <div className="prodgrid">
            {bestsellers.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </div>
      </section>

      <section className="section reveal">
        <div className="container">
          <div className="section__head">
            <h2>Lo que dicen de nosotros</h2>
            <RatingBadge compact />
          </div>
          <Testimonials />
        </div>
      </section>

      <section className="section section--muted reveal">
        <div className="container quoteform-section">
          <div className="quoteform-section__info">
            <h2>{t('quoteFormTitle')}</h2>
            <p>{t('techIntro')}</p>
          </div>
          <QuoteForm compact />
        </div>
      </section>
    </div>
  );
}

const HOME_PRODUCTS_QUERY = `#graphql
  ${PRODUCT_CARD_FRAGMENT}
  query HomeProducts($country: CountryCode, $language: LanguageCode)
    @inContext(country: $country, language: $language) {
    products(first: 16, sortKey: BEST_SELLING) {
      nodes {
        ...ProductCard
      }
    }
    newest: products(first: 3, sortKey: CREATED_AT, reverse: true) {
      nodes {
        ...ProductCard
      }
    }
    featuredHome: collectionByHandle(handle: "novedades-destacadas-home") {
      products(first: 3) {
        nodes {
          ...ProductCard
        }
      }
    }
  }
` as const;

const HOME_COLLECTIONS_QUERY = `#graphql
  query HomeCollections($country: CountryCode, $language: LanguageCode)
    @inContext(country: $country, language: $language) {
    collections(first: 20, sortKey: TITLE) {
      nodes {
        id
        handle
        title
        image {
          url
          altText
        }
        products(first: 1) {
          nodes {
            id
            featuredImage {
              url
              altText
            }
          }
        }
      }
    }
  }
` as const;
