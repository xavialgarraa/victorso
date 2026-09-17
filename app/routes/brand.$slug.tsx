import {Link, redirect, useLoaderData} from 'react-router';
import type {Route} from './+types/brand.$slug';
import {Icon} from '~/lib/icons';
import {findBrand} from '~/lib/brands';

export const meta: Route.MetaFunction = ({data}) => {
  return [{title: `${data?.brand.name ?? ''} — Victor So Professional`}];
};

export async function loader({context, params}: Route.LoaderArgs) {
  const brand = findBrand(params.slug ?? '');
  if (!brand) {
    throw redirect('/marcas');
  }

  const {storefront} = context;
  // Shopify no tiene "marca" como entidad propia: aproximamos el conteo
  // de productos buscando por el campo vendor.
  const {products} = await storefront.query(BRAND_PRODUCTS_QUERY, {
    variables: {query: `vendor:'${brand.name}'`},
  });

  return {brand, count: products.nodes.length, hasMore: products.pageInfo.hasNextPage};
}

export default function BrandPage() {
  const {brand, count, hasMore} = useLoaderData<typeof loader>();

  return (
    <div>
      <div className="breadcrumb container">
        <Link to="/">Inicio</Link> / <Link to="/marcas">Nuestras Marcas</Link> / {brand.name}
      </div>
      <section className="section brand-page">
        <div className="container brand-page__inner">
          {brand.logo && (
            <div className="brand-page__logo">
              <img src={brand.logo} alt={brand.name} loading="lazy" />
            </div>
          )}
          <h1 className="section-title-lg">{brand.name}</h1>
          <p className="visit-text">{brand.description}</p>
          <div className="brand-page__actions">
            {brand.website && (
              <a className="btn btn--outline" href={brand.website} target="_blank" rel="noopener noreferrer">
                Visitar web oficial <Icon name="arrowRight" />
              </a>
            )}
            {count > 0 ? (
              <Link className="btn btn--primary" to={`/search?q=${encodeURIComponent(brand.name)}`}>
                Ver productos ({hasMore ? `${count}+` : count})
              </Link>
            ) : (
              <Link className="btn btn--primary" to="/collections/all">
                Ver todos los productos
              </Link>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

const BRAND_PRODUCTS_QUERY = `#graphql
  query BrandProducts($query: String, $country: CountryCode, $language: LanguageCode)
    @inContext(country: $country, language: $language) {
    products(first: 50, query: $query) {
      nodes {
        id
      }
      pageInfo {
        hasNextPage
      }
    }
  }
` as const;
