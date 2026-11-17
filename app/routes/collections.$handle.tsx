import {redirect, useLoaderData, Link, useSearchParams} from 'react-router';
import type {Route} from './+types/collections.$handle';
import {getPaginationVariables, Analytics} from '@shopify/hydrogen';
import type {ProductFilter} from '@shopify/hydrogen/storefront-api-types';
import {redirectIfHandleIsLocalized} from '~/lib/redirect';
import {PRODUCT_CARD_FRAGMENT} from '~/lib/fragments';
import {ProductListing, type ListingFilter} from '~/components/ProductListing';
import {useI18n} from '~/lib/i18n';
import {jsonLdHtml} from '~/lib/jsonLd';
import {getCollectionBanner} from '~/lib/collectionBanners.server';
import {getLocaleFromRequest} from '~/lib/locales';
import {CollectionBanner} from '~/components/CollectionBanner';
import {Icon} from '~/lib/icons';
import {guessCategoryIcon} from '~/lib/categoryIcons';
import {listCategoryCovers} from '~/lib/categoryCovers.server';
import {
  parseLeafTitle,
  groupNameFromHandle,
  subcategoryLinksForGroup,
} from '~/lib/connectors/categoryTaxonomy.server';
import type {ProductsByCollectionQuery} from 'storefrontapi.generated';

type GroupProduct = NonNullable<ProductsByCollectionQuery['collection']>['products']['nodes'][number];

export const meta: Route.MetaFunction = ({data}) => {
  const collection = data?.collection;
  const title = collection?.title ?? '';
  const pageTitle = `${title} — Victor So Professional`;
  const plainDescription = (collection?.description || '').replace(/\s+/g, ' ').trim().slice(0, 160);
  const description = plainDescription || `${title} al mejor precio en Victor So Professional — tienda de equipos DJ y sonido profesional en Lloret de Mar.`;
  const canonical = `https://www.victorso.es/collections/${collection?.handle ?? ''}`;
  const image = collection?.image?.url;

  return [
    {title: pageTitle},
    {name: 'description', content: description},
    {tagName: 'link', rel: 'canonical', href: canonical},
    {property: 'og:type', content: 'website'},
    {property: 'og:title', content: pageTitle},
    {property: 'og:description', content: description},
    {property: 'og:url', content: canonical},
    ...(image ? [{property: 'og:image', content: image}] : []),
  ];
};

const SORT_OPTIONS = [
  {value: 'relevance', label: 'Relevancia', sortKey: 'COLLECTION_DEFAULT', reverse: false},
  {value: 'price-asc', label: 'Precio: menor a mayor', sortKey: 'PRICE', reverse: false},
  {value: 'price-desc', label: 'Precio: mayor a menor', sortKey: 'PRICE', reverse: true},
  {value: 'newest', label: 'Novedades', sortKey: 'CREATED', reverse: true},
  {value: 'title', label: 'Nombre A-Z', sortKey: 'TITLE', reverse: false},
] as const;

export async function loader(args: Route.LoaderArgs) {
  const criticalData = await loadCriticalData(args);
  return {...criticalData};
}

async function loadCriticalData({context, params, request}: Route.LoaderArgs) {
  const {handle} = params;
  const {storefront} = context;
  const url = new URL(request.url);
  const locale = getLocaleFromRequest(request);

  const perPage = [12, 24, 48].includes(Number(url.searchParams.get('perPage')))
    ? Number(url.searchParams.get('perPage'))
    : 12;
  const paginationVariables = getPaginationVariables(request, {pageBy: perPage});

  const sortParam = url.searchParams.get('sort') || 'relevance';
  const sortConfig = SORT_OPTIONS.find((s) => s.value === sortParam) ?? SORT_OPTIONS[0];

  const filters: ProductFilter[] = url.searchParams
    .getAll('filter')
    .map((f) => {
      try {
        return JSON.parse(f) as ProductFilter;
      } catch {
        return null;
      }
    })
    .filter((f): f is ProductFilter => f !== null);

  if (!handle) {
    throw redirect('/collections');
  }

  // Se sabe por la URL sola, antes incluso de pedir la colección — si no
  // es ninguno de los 7 grupos no hace falta la llamada extra de abajo.
  const groupName = groupNameFromHandle(handle);

  const [{collection}, {collection: countData}, banner, categoryCovers, subcategoryData] = await Promise.all([
    storefront.query(COLLECTION_QUERY, {
      variables: {
        handle,
        filters,
        sortKey: sortConfig.sortKey,
        reverse: sortConfig.reverse,
        ...paginationVariables,
      },
    }),
    // El conteo real no viene en ningún campo de Shopify (ProductConnection
    // no tiene totalCount); se calcula pidiendo hasta 250 ids con los mismos
    // filtros, en paralelo, solo para mostrar un número correcto.
    storefront.query(COLLECTION_COUNT_QUERY, {
      variables: {handle, filters},
    }),
    getCollectionBanner(context.env, handle, locale),
    // Solo hace falta para la cuadrícula de subcategorías de una página
    // de grupo (ver groupLanding abajo) — pedirlo siempre y en paralelo
    // es más simple que condicionarlo al handle antes de saber si es un
    // grupo, y es la misma llamada barata que ya usa /collections.
    listCategoryCovers(context.env).catch((): Record<string, string> => ({})),
    // Para filtrar la cuadrícula a solo las subcategorías con al menos
    // un producto y usar la foto de uno de ellos como icono por defecto
    // (si no hay carátula propia en categoryCovers). Solo se pide cuando
    // hace falta — en una página normal de producto/hoja es coste cero.
    groupName ? storefront.query(ALL_COLLECTIONS_SUMMARY_QUERY) : Promise.resolve(null),
  ]);

  if (!collection) {
    throw new Response(`Collection ${handle} not found`, {status: 404});
  }

  redirectIfHandleIsLocalized(request, {handle, data: collection});

  const resultCount = countData?.products.nodes.length ?? collection.products.nodes.length;
  // parseLeafTitle vive en un módulo .server — tiene que resolverse aquí
  // en el loader, no en el componente (el componente también se incluye
  // en el bundle de cliente para la hidratación, y ese bundle no puede
  // importar nada de un módulo .server).
  const leaf = parseLeafTitle(collection.title);
  // Las colecciones "grupo" (6 bare + "PIONEER DJ & ALPHATHETA", ver
  // GROUP_HANDLES) ahora aterrizan aquí con la cuadrícula de sus propias
  // subcategorías para poder navegar de categoría a subcategoría — y,
  // si el grupo sí tiene productos propios (el caso de Alphatheta), la
  // cuadrícula sale encima del listado normal en vez de sustituirlo.
  const groupLanding = groupName
    ? (() => {
        const summaryByHandle = new Map(
          (subcategoryData?.collections.nodes ?? []).map((c) => [c.handle, c]),
        );
        const tiles = subcategoryLinksForGroup(groupName)
          .map(({sub, handle: subHandle}) => {
            const summary = summaryByHandle.get(subHandle);
            if (!summary || summary.products.nodes.length === 0) return null;
            const autoPhoto = summary.products.nodes[0]?.featuredImage?.url ?? null;
            return {
              sub,
              handle: subHandle,
              photo: categoryCovers[subHandle] ?? autoPhoto,
              fallbackIcon: guessCategoryIcon(sub),
            };
          })
          .filter((t): t is NonNullable<typeof t> => t !== null);
        return {group: groupName, tiles};
      })()
    : null;

  // Las 6 colecciones "grupo" bare (0 productos propios — todo lo que
  // tienen está repartido en sus subcategorías) muestran aquí el
  // catálogo combinado de todas sus subcategorías con producto, igual
  // que la de Alphatheta (que sí tiene productos propios y no necesita
  // esto). Se paginan y ordenan en memoria porque no existe ninguna
  // colección real de Shopify que las junte.
  let groupProducts: GroupProduct[] | null = null;
  let groupResultCount = 0;
  if (groupLanding && collection.products.nodes.length === 0 && groupLanding.tiles.length > 0) {
    const perSubcategory = await Promise.all(
      groupLanding.tiles.map((tile) =>
        storefront.query(PRODUCTS_BY_COLLECTION_QUERY, {variables: {handle: tile.handle, first: 24}}),
      ),
    );
    const seen = new Set<string>();
    const merged = perSubcategory
      .flatMap((d) => d.collection?.products.nodes ?? [])
      .filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
    groupResultCount = merged.length;
    const sorted = sortGroupProducts(merged, sortConfig.value);
    const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
    groupProducts = sorted.slice((page - 1) * perPage, page * perPage);
  }

  return {collection, resultCount, banner, leaf, groupLanding, groupProducts, groupResultCount, perPage};
}

function sortGroupProducts(products: GroupProduct[], sort: string): GroupProduct[] {
  const copy = [...products];
  switch (sort) {
    case 'price-asc':
      return copy.sort((a, b) => Number(a.priceRange.minVariantPrice.amount) - Number(b.priceRange.minVariantPrice.amount));
    case 'price-desc':
      return copy.sort((a, b) => Number(b.priceRange.minVariantPrice.amount) - Number(a.priceRange.minVariantPrice.amount));
    case 'newest':
      return copy.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    case 'title':
      return copy.sort((a, b) => a.title.localeCompare(b.title));
    default:
      return copy;
  }
}

export default function Collection() {
  const {collection, resultCount, banner, leaf, groupLanding, groupProducts, groupResultCount, perPage} =
    useLoaderData<typeof loader>();
  const {t} = useI18n();
  const [searchParams] = useSearchParams();

  const listingFilters: ListingFilter[] = (collection.products.filters ?? []).map((f) => ({
    id: f.id,
    label: f.label,
    type: f.type,
    values: f.values.map((v) => ({
      id: v.id,
      label: v.label,
      count: v.count,
      input: String(v.input),
    })),
  }));

  // "leaf" (Categoría > Subcategoría para el breadcrumb) ya viene
  // calculado del loader — ver el comentario junto a parseLeafTitle ahí.
  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: leaf
      ? [
          {'@type': 'ListItem', position: 1, name: 'Inicio', item: 'https://www.victorso.es/'},
          {
            '@type': 'ListItem',
            position: 2,
            name: leaf.group,
            item: `https://www.victorso.es/collections/${leaf.groupHandle}`,
          },
          {
            '@type': 'ListItem',
            position: 3,
            name: leaf.sub,
            item: `https://www.victorso.es/collections/${collection.handle}`,
          },
        ]
      : [
          {'@type': 'ListItem', position: 1, name: 'Inicio', item: 'https://www.victorso.es/'},
          {
            '@type': 'ListItem',
            position: 2,
            name: collection.title,
            item: `https://www.victorso.es/collections/${collection.handle}`,
          },
        ],
  };

  return (
    <div className="collection">
      <script type="application/ld+json" dangerouslySetInnerHTML={{__html: jsonLdHtml(breadcrumbJsonLd)}} />
      <div className="breadcrumb container">
        <a href="/">{t('breadcrumbHome')}</a>{' '}
        {leaf ? (
          <>
            {' / '}
            <Link to={`/collections/${leaf.groupHandle}`}>{leaf.group}</Link>
            {' / '}
            <span aria-current="page">{leaf.sub}</span>
          </>
        ) : (
          <>/ {collection.title}</>
        )}
      </div>
      {banner && <CollectionBanner banner={banner} resultCount={resultCount} />}
      {collection.description && (
        <div className="container">
          <p className="collection-description">{collection.description}</p>
        </div>
      )}
      {groupLanding && (
        // Página de un grupo (ver GROUP_HANDLES): cuadrícula para
        // navegar de categoría a subcategoría también sin pasar por el
        // mega-menú — solo las que ya tienen al menos un producto.
        <div className="container category-landing">
          {groupLanding.tiles.length === 0 ? (
            <p className="category-landing__empty">{t('categoryLandingEmpty')}</p>
          ) : (
            <>
              {!collection.description && <p className="category-landing__hint">{t('categoryLandingHint')}</p>}
              <div className="category-landing__grid">
                {groupLanding.tiles.map((tile) => (
                  <Link key={tile.handle} to={`/collections/${tile.handle}`} className="category-landing__tile">
                    <span className="category-landing__icon">
                      {tile.photo ? (
                        <img src={tile.photo} alt="" loading="lazy" />
                      ) : (
                        <Icon name={tile.fallbackIcon} />
                      )}
                    </span>
                    <span className="category-landing__label">{tile.sub}</span>
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>
      )}
      {/* "Alphatheta & Pioneer DJ" es grupo Y colección con productos
          propios a la vez (ver GROUP_HANDLES) — ahí la cuadrícula de
          arriba sale además del listado normal, no en su lugar. */}
      {(!groupLanding || resultCount > 0) && (
        <>
          <div id="collection-products" />
          <ProductListing
            title={collection.title}
            products={collection.products}
            filters={listingFilters}
            sortOptions={SORT_OPTIONS.map(({value, label}) => ({value, label}))}
            resultCount={resultCount}
          />
        </>
      )}
      {/* Los 6 grupos "bare" (ver GROUP_HANDLES) no tienen productos
          propios en Shopify — sus productos reales están repartidos en
          sus subcategorías, juntados y paginados a mano en el loader
          (ver groupProducts/sortGroupProducts) porque no hay ninguna
          colección real que los contenga a todos. */}
      {groupLanding && resultCount === 0 && groupProducts && groupProducts.length > 0 && (
        <>
          <div id="collection-products" />
          <ProductListing
            title={collection.title}
            products={groupProducts}
            filters={[]}
            sortOptions={SORT_OPTIONS.map(({value, label}) => ({value, label}))}
            resultCount={groupResultCount}
            manualPagination={{
              page: Math.max(1, Number(searchParams.get('page')) || 1),
              totalPages: Math.max(1, Math.ceil(groupResultCount / perPage)),
            }}
          />
        </>
      )}
      <Analytics.CollectionView
        data={{
          collection: {
            id: collection.id,
            handle: collection.handle,
          },
        }}
      />
    </div>
  );
}

const COLLECTION_QUERY = `#graphql
  ${PRODUCT_CARD_FRAGMENT}
  query Collection(
    $handle: String!
    $country: CountryCode
    $language: LanguageCode
    $first: Int
    $last: Int
    $startCursor: String
    $endCursor: String
    $filters: [ProductFilter!]
    $sortKey: ProductCollectionSortKeys
    $reverse: Boolean
  ) @inContext(country: $country, language: $language) {
    collection(handle: $handle) {
      id
      handle
      title
      description
      image {
        url
      }
      products(
        first: $first,
        last: $last,
        before: $startCursor,
        after: $endCursor,
        filters: $filters,
        sortKey: $sortKey,
        reverse: $reverse
      ) {
        filters {
          id
          label
          type
          values {
            id
            label
            count
            input
          }
        }
        nodes {
          ...ProductCard
        }
        pageInfo {
          hasPreviousPage
          hasNextPage
          endCursor
          startCursor
        }
      }
    }
  }
` as const;

const COLLECTION_COUNT_QUERY = `#graphql
  query CollectionCount(
    $handle: String!
    $country: CountryCode
    $language: LanguageCode
    $filters: [ProductFilter!]
  ) @inContext(country: $country, language: $language) {
    collection(handle: $handle) {
      products(first: 250, filters: $filters) {
        nodes {
          id
        }
      }
    }
  }
` as const;

// Para la página de un grupo "bare" (0 productos propios, ver
// GROUP_HANDLES): sus productos reales viven repartidos en sus
// subcategorías, no hay una sola colección que los tenga todos — se
// piden en paralelo, una llamada por subcategoría con esta misma query
// (forma fija, apta para codegen — una query con un número variable de
// alias por grupo no lo sería), y se juntan y ordenan en loadGroupProducts.
const PRODUCTS_BY_COLLECTION_QUERY = `#graphql
  ${PRODUCT_CARD_FRAGMENT}
  query ProductsByCollection($handle: String!, $first: Int!, $country: CountryCode, $language: LanguageCode)
    @inContext(country: $country, language: $language) {
    collection(handle: $handle) {
      products(first: $first) {
        nodes {
          ...ProductCard
          createdAt
        }
      }
    }
  }
` as const;

// Resumen barato de todas las colecciones (sin productos reales, solo
// cuánto tienen y una foto) — se usa para filtrar y dar icono a la
// cuadrícula de subcategorías de una página de grupo. Son pocas decenas
// de colecciones, así que pedirlas todas y filtrar en JS (ver
// groupLanding arriba) es más simple que generar una query dinámica con
// un alias por subcategoría.
const ALL_COLLECTIONS_SUMMARY_QUERY = `#graphql
  query AllCollectionsSummary($country: CountryCode, $language: LanguageCode)
    @inContext(country: $country, language: $language) {
    collections(first: 100, sortKey: TITLE) {
      nodes {
        handle
        products(first: 1) {
          nodes {
            id
            featuredImage {
              url
            }
          }
        }
      }
    }
  }
` as const;
