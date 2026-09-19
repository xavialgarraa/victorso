import type {Route} from './+types/collections.all';
import {useLoaderData} from 'react-router';
import {getPaginationVariables} from '@shopify/hydrogen';
import {PRODUCT_CARD_FRAGMENT} from '~/lib/fragments';
import {ProductListing, type ListingFilter} from '~/components/ProductListing';

export const meta: Route.MetaFunction = () => {
  return [{title: `Todos los productos — Victor So Professional`}];
};

const SORT_OPTIONS = [
  {value: 'relevance', label: 'Relevancia', sortKey: 'BEST_SELLING', reverse: false},
  {value: 'price-asc', label: 'Precio: menor a mayor', sortKey: 'PRICE', reverse: false},
  {value: 'price-desc', label: 'Precio: mayor a menor', sortKey: 'PRICE', reverse: true},
  {value: 'newest', label: 'Novedades', sortKey: 'CREATED_AT', reverse: true},
  {value: 'title', label: 'Nombre A-Z', sortKey: 'TITLE', reverse: false},
] as const;

export async function loader({context, request}: Route.LoaderArgs) {
  const {storefront} = context;
  const url = new URL(request.url);

  const perPage = [12, 24, 48].includes(Number(url.searchParams.get('perPage')))
    ? Number(url.searchParams.get('perPage'))
    : 12;
  const paginationVariables = getPaginationVariables(request, {pageBy: perPage});

  const sortParam = url.searchParams.get('sort') || 'relevance';
  const sortConfig = SORT_OPTIONS.find((s) => s.value === sortParam) ?? SORT_OPTIONS[0];

  // Nota: la query raiz `products` no admite el argumento `filters` (los
  // facets de Shopify solo existen dentro de una coleccion), asi que en
  // "todos los productos" solo hay orden + paginacion, sin filtro lateral.
  // A cambio, ofrecemos un acceso rapido por categoria real del catalogo.
  const [{products}, {collections}] = await Promise.all([
    storefront.query(CATALOG_QUERY, {
      variables: {
        sortKey: sortConfig.sortKey,
        reverse: sortConfig.reverse,
        ...paginationVariables,
      },
    }),
    storefront.query(CATEGORY_LINKS_QUERY),
  ]);

  const categoryLinks = collections.nodes
    .filter((c) => c.handle !== 'frontpage' && c.products.nodes.length > 0)
    .map((c) => ({handle: c.handle, title: c.title}));

  return {products, categoryLinks};
}

export default function Collection() {
  const {products, categoryLinks} = useLoaderData<typeof loader>();

  const listingFilters: ListingFilter[] = [];

  return (
    <div className="collection">
      <div className="breadcrumb container">
        <a href="/">Inicio</a> / Todos los productos
      </div>
      <ProductListing
        title="Todos los productos"
        products={products}
        filters={listingFilters}
        categoryLinks={categoryLinks}
        sortOptions={SORT_OPTIONS.map(({value, label}) => ({value, label}))}
        resultCount={products.nodes.length}
      />
    </div>
  );
}

const CATALOG_QUERY = `#graphql
  ${PRODUCT_CARD_FRAGMENT}
  query Catalog(
    $country: CountryCode
    $language: LanguageCode
    $first: Int
    $last: Int
    $startCursor: String
    $endCursor: String
    $sortKey: ProductSortKeys
    $reverse: Boolean
  ) @inContext(country: $country, language: $language) {
    products(
      first: $first,
      last: $last,
      before: $startCursor,
      after: $endCursor,
      sortKey: $sortKey,
      reverse: $reverse
    ) {
      nodes {
        ...ProductCard
      }
      pageInfo {
        hasPreviousPage
        hasNextPage
        startCursor
        endCursor
      }
    }
  }
` as const;

const CATEGORY_LINKS_QUERY = `#graphql
  query CategoryLinks($country: CountryCode, $language: LanguageCode)
    @inContext(country: $country, language: $language) {
    collections(first: 20, sortKey: TITLE) {
      nodes {
        handle
        title
        products(first: 1) {
          nodes {
            id
          }
        }
      }
    }
  }
` as const;
