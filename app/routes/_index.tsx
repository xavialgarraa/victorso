import {useLoaderData, Link} from 'react-router';
import type {Route} from './+types/_index';
import {Money} from '@shopify/hydrogen';
import {PRODUCT_CARD_FRAGMENT} from '~/lib/fragments';
import {ProductCard} from '~/components/ProductCard';
import {StoreHero, type HeroSlide} from '~/components/StoreHero';
import {Icon, type IconName} from '~/lib/icons';

export const meta: Route.MetaFunction = () => {
  return [{title: 'Victor So Professional — Equipos DJ, Sonido y Audiovisuales'}];
};

export async function loader({context}: Route.LoaderArgs) {
  const {storefront} = context;
  const [{products}, {collections}] = await Promise.all([
    storefront.query(HOME_PRODUCTS_QUERY),
    storefront.query(HOME_COLLECTIONS_QUERY),
  ]);

  const newest = [...products.nodes].sort((a, b) => (a.handle < b.handle ? 1 : -1)).slice(0, 3);
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
  const vendors = [...new Set(products.nodes.map((p) => p.vendor).filter(Boolean))].slice(0, 12);

  return {newest, bestselling, offers, bestsellers, vendors, collections: collections.nodes};
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
  const {newest, bestselling, offers, bestsellers, vendors, collections} =
    useLoaderData<typeof loader>();

  const leftSlides: HeroSlide[] = newest.map((p) => ({
    key: `new-${p.id}`,
    href: `/products/${p.handle}`,
    image: p.featuredImage?.url ?? '',
    badge: 'Nuevo',
    badgeClass: 'storehero__badge--new',
    eyebrow: p.vendor,
    title: p.title,
    cta: 'Descubrir',
    ctaClass: 'btn--outline',
  }));

  const rightSlides: HeroSlide[] = [];
  if (bestselling) {
    rightSlides.push({
      key: `best-${bestselling.id}`,
      href: `/products/${bestselling.handle}`,
      image: bestselling.featuredImage?.url ?? '',
      badge: 'Más vendido',
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
      cta: 'Ver producto',
      ctaClass: 'btn--primary',
    });
  }
  rightSlides.push(
    {
      key: 'contact',
      href: 'https://wa.me/34619406443',
      external: true,
      image: '/assets/tienda-fachada.jpeg',
      badge: 'Contacto',
      badgeClass: 'storehero__badge--brand',
      eyebrow: '972 364 114',
      title: 'Escríbenos por WhatsApp',
      cta: 'Contactar',
      ctaClass: 'btn--outline',
    },
    {
      key: 'visit',
      href: '/pages/quienes-somos',
      image: '/assets/tienda-fachada.jpeg',
      badge: 'Visítanos',
      badgeClass: 'storehero__badge--brand',
      eyebrow: 'Lloret de Mar (Girona)',
      title: 'Visita nuestra tienda',
      cta: 'Cómo llegar',
      ctaClass: 'btn--outline',
    },
  );

  return (
    <div className="home">
      <StoreHero leftSlides={leftSlides} rightSlides={rightSlides} vendors={vendors} />

      <section className="section reveal" id="categorySection">
        <div className="container">
          <div className="section__head">
            <h2>Categorías</h2>
          </div>
          <div className="catgrid">
            {collections.map((c) => (
              <Link key={c.id} className="catcard" to={`/collections/${c.handle}`}>
                <Icon name={categoryIcon(c.title)} className="catcard__icon" />
                {c.image && <img src={c.image.url} alt={c.image.altText ?? c.title} loading="lazy" />}
                <span className="catcard__label">{c.title}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="section discover reveal">
        <div className="container">
          <div className="section__head">
            <h2>Descubre más</h2>
          </div>
          <div className="discover__grid">
            <Link className="discover__card" to="/pages/instalaciones">
              <span className="discover__icon"><Icon name="speaker" /></span>
              <div className="discover__info">
                <h3>Instalaciones realizadas</h3>
                <p>Sonorización de espacios públicos, locales y eventos.</p>
                <span className="discover__link">Ver más <Icon name="arrowRight" /></span>
              </div>
            </Link>
            <a
              className="discover__card discover__card--solid"
              href="https://wa.me/34619406443"
              target="_blank"
              rel="noopener noreferrer"
            >
              <span className="discover__icon"><Icon name="chat" /></span>
              <div className="discover__info">
                <h3>Contacta por WhatsApp</h3>
                <p>Te asesoramos sin compromiso.</p>
                <span className="discover__link">Escribir <Icon name="arrowRight" /></span>
              </div>
            </a>
            <Link
              className="discover__card"
              to="/pages/quienes-somos"
              style={{backgroundImage: "url('/assets/tienda-fachada.jpeg')"}}
            >
              <span className="discover__icon"><Icon name="shield" /></span>
              <div className="discover__info">
                <h3>Quiénes somos</h3>
                <p>Más de 35 años de experiencia en sonido y DJ.</p>
                <span className="discover__link">Conócenos <Icon name="arrowRight" /></span>
              </div>
            </Link>
          </div>
        </div>
      </section>

      <div className="shipband">
        <Icon name="truck" />
        <span>Envío gratis Península desde 149€</span>
      </div>

      {offers.length > 0 && (
        <section className="section section--muted reveal">
          <div className="container">
            <div className="section__head">
              <h2>Ofertas</h2>
              <Link to="/collections/outlet">
                Ver outlet <Icon name="arrowRight" />
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
            <h2>Los más vendidos</h2>
          </div>
          <div className="prodgrid">
            {bestsellers.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
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
  }
` as const;

const HOME_COLLECTIONS_QUERY = `#graphql
  query HomeCollections($country: CountryCode, $language: LanguageCode)
    @inContext(country: $country, language: $language) {
    collections(first: 9, sortKey: TITLE) {
      nodes {
        id
        handle
        title
        image {
          url
          altText
        }
      }
    }
  }
` as const;
