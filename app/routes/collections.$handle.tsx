import {redirect, useLoaderData, Link, useSearchParams} from 'react-router';
import type {Route} from './+types/collections.$handle';
import {getPaginationVariables, Analytics} from '@shopify/hydrogen';
import type {ProductFilter} from '@shopify/hydrogen/storefront-api-types';
import {redirectIfHandleIsLocalized} from '~/lib/redirect';
import {PRODUCT_CARD_FRAGMENT, MENU_FRAGMENT} from '~/lib/fragments';
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
  findCategoriesMenuItem,
  groupByHandle,
  subcategoriesOf,
  leafContext,
} from '~/lib/categoryMenu';
import type {ProductsByCollectionQuery} from 'storefrontapi.generated';

type GroupProduct = NonNullable<ProductsByCollectionQuery['collection']>['products']['nodes'][number];

// "Alphatheta & Pioneer DJ" es la única de las 7 categorías principales
// cuya colección de Shopify es la fuente real de productos (el menú la
// enlaza a la colección de siempre, con sus 46 productos) — las otras 6
// son "bare" a propósito: sus productos reales viven repartidos en sus
// subcategorías. Antes se detectaba esto mirando si la colección propia
// tenía 0 productos, pero el clasificador de IA de distribuidores (ver
// distributorCategories.server.ts) solo conoce la categoría PRINCIPAL,
// nunca la subcategoría exacta — así que un producto nuevo clasificado
// como, p. ej., "Flightcases y bolsas" acaba asignado directamente a esa
// colección "bare", que deja de tener 0 productos, y la página entera
// cambiaba de modo: dejaba de agregar subcategorías y solo enseñaba esos
// pocos productos sueltos, escondiendo el resto del catálogo real de esa
// categoría. Ahora el modo se decide por esta lista fija, no por el
// conteo, y los productos que caigan por error en la colección "bare" se
// fusionan igualmente en el listado agregado (ver más abajo) en vez de
// desaparecer de la vista.
const GROUPS_WITH_REAL_OWN_COLLECTION = new Set(['pioneer-dj-alphatheta']);

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

  const [{collection}, {collection: countData}, banner, categoryCovers, {menu}] = await Promise.all([
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
    listCategoryCovers(context.env).catch((): Record<string, string> => ({})),
    // El árbol "Categorías" del menú de Shopify es la única fuente de
    // verdad de qué es una categoría y qué es una subcategoría de cuál
    // (ver CATEGORIAS.md) — no una lista fija en el código, para que
    // Víctor pueda reordenar/renombrar/mover desde el editor de
    // Navegación de Shopify sin tocar nada aquí.
    storefront.query(CATEGORIES_MENU_QUERY),
  ]);

  if (!collection) {
    throw new Response(`Collection ${handle} not found`, {status: 404});
  }

  redirectIfHandleIsLocalized(request, {handle, data: collection});

  const resultCount = countData?.products.nodes.length ?? collection.products.nodes.length;
  // findCategoriesMenuItem/leafContext/groupByHandle viven en un módulo
  // normal (no ".server") a propósito — ver ~/lib/categoryMenu — pero
  // igualmente se resuelven aquí en el loader, no en el componente: la
  // query del menú solo se pide del lado del servidor.
  const categoriesItem = findCategoriesMenuItem(menu);
  const leafRef = leafContext(categoriesItem, handle);
  const leaf = leafRef
    ? {group: leafRef.group.title, groupHandle: leafRef.group.handle, sub: leafRef.sub.title}
    : null;
  const groupRef = groupByHandle(categoriesItem, handle);

  // Las categorías principales (6 "bare" + "PIONEER DJ & ALPHATHETA",
  // fusionada a mano en el menú de Shopify) aterrizan aquí con la
  // cuadrícula de sus propias subcategorías para poder navegar de
  // categoría a subcategoría — y, si la categoría sí tiene productos
  // propios (el caso de Alphatheta), la cuadrícula sale encima del
  // listado normal en vez de sustituirlo.
  let groupLanding: {group: string; tiles: Array<{sub: string; handle: string; photo: string | null; fallbackIcon: ReturnType<typeof guessCategoryIcon>}>} | null = null;
  if (groupRef) {
    const subs = subcategoriesOf(categoriesItem, groupRef.handle);
    const summaryData = subs.length > 0 ? await storefront.query(ALL_COLLECTIONS_SUMMARY_QUERY) : null;
    const summaryByHandle = new Map((summaryData?.collections.nodes ?? []).map((c) => [c.handle, c]));
    const tiles = subs
      .map((sub) => {
        const summary = summaryByHandle.get(sub.handle);
        if (!summary || summary.products.nodes.length === 0) return null;
        const autoPhoto = summary.products.nodes[0]?.featuredImage?.url ?? null;
        return {
          sub: sub.title,
          handle: sub.handle,
          photo: categoryCovers[sub.handle] ?? autoPhoto,
          fallbackIcon: guessCategoryIcon(sub.title),
        };
      })
      .filter((t): t is NonNullable<typeof t> => t !== null);
    groupLanding = {group: groupRef.title, tiles};
  }

  // Las 6 colecciones "grupo" bare (todo lo que tienen de verdad está
  // repartido en sus subcategorías) muestran aquí el catálogo combinado
  // de todas sus subcategorías con producto — más los que la propia
  // colección "bare" tenga por error (ver nota junto a
  // GROUPS_WITH_REAL_OWN_COLLECTION), para que no desaparezcan de la
  // vista. Se paginan y ordenan en memoria porque no existe ninguna
  // colección real de Shopify que las junte.
  const groupHasRealOwnCollection = groupRef ? GROUPS_WITH_REAL_OWN_COLLECTION.has(groupRef.handle) : false;
  let groupProducts: GroupProduct[] | null = null;
  let groupResultCount = 0;
  let groupFilters: ListingFilter[] = [];
  if (groupLanding && !groupHasRealOwnCollection && groupLanding.tiles.length > 0) {
    const perSubcategory = await Promise.all(
      groupLanding.tiles.map((tile) =>
        storefront.query(PRODUCTS_BY_COLLECTION_QUERY, {variables: {handle: tile.handle, first: 24, filters}}),
      ),
    );
    const seen = new Set<string>();
    const merged = [...collection.products.nodes, ...perSubcategory.flatMap((d) => d.collection?.products.nodes ?? [])]
      .filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
    groupResultCount = merged.length;
    const sorted = sortGroupProducts(merged, sortConfig.value);
    const page = Math.max(1, Number(url.searchParams.get('page')) || 1);
    groupProducts = sorted.slice((page - 1) * perPage, page * perPage);
    // No existe una sola colección de Shopify que agrupe estas
    // subcategorías, así que tampoco hay un solo "filters" que valga —
    // se fusionan los de cada subcategoría (sumando recuentos por
    // valor, y el precio combinando el mínimo/máximo de todas) para que
    // esta página pueda filtrar igual que una de hoja.
    groupFilters = mergeGroupFilters(perSubcategory);
  }

  return {
    collection,
    resultCount,
    banner,
    leaf,
    groupLanding,
    groupHasRealOwnCollection,
    groupProducts,
    groupResultCount,
    groupFilters,
    perPage,
  };
}

function mergeGroupFilters(
  perSubcategory: Array<{
    collection?: {
      products: {
        filters: Array<{id: string; label: string; type: string; values: Array<{id: string; label: string; count: number; input: unknown}>}>;
      };
    } | null;
  }>,
): ListingFilter[] {
  const byId = new Map<string, ListingFilter>();

  for (const d of perSubcategory) {
    for (const f of d.collection?.products.filters ?? []) {
      if (f.type === 'PRICE_RANGE') {
        const raw = f.values[0] ? String(f.values[0].input) : null;
        let parsed: {price?: {min?: number; max?: number}} | null = null;
        try {
          parsed = raw ? (JSON.parse(raw) as {price?: {min?: number; max?: number}}) : null;
        } catch {
          parsed = null;
        }
        const min = parsed?.price?.min ?? 0;
        const max = parsed?.price?.max ?? 0;
        const existing = byId.get(f.id);
        if (!existing) {
          byId.set(f.id, {
            id: f.id,
            label: f.label,
            type: f.type,
            values: [{id: f.values[0]?.id ?? f.id, label: f.values[0]?.label ?? f.label, count: 0, input: JSON.stringify({price: {min, max}})}],
          });
        } else {
          const value = existing.values[0];
          let eParsed: {price?: {min?: number; max?: number}} = {};
          try {
            eParsed = JSON.parse(value.input) as {price?: {min?: number; max?: number}};
          } catch {
            eParsed = {};
          }
          value.input = JSON.stringify({
            price: {
              min: Math.min(eParsed.price?.min ?? min, min),
              max: Math.max(eParsed.price?.max ?? max, max),
            },
          });
        }
        continue;
      }

      let group = byId.get(f.id);
      if (!group) {
        group = {id: f.id, label: f.label, type: f.type, values: []};
        byId.set(f.id, group);
      }
      for (const v of f.values) {
        const existingValue = group.values.find((gv) => gv.id === v.id);
        if (existingValue) existingValue.count += v.count;
        else group.values.push({id: v.id, label: v.label, count: v.count, input: String(v.input)});
      }
    }
  }

  return Array.from(byId.values()).filter((f) => f.values.length > 0);
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
  const {collection, resultCount, banner, leaf, groupLanding, groupHasRealOwnCollection, groupProducts, groupResultCount, groupFilters, perPage} =
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
        // Página de una categoría principal (ver ~/lib/categoryMenu): cuadrícula para
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
      {/* "Alphatheta & Pioneer DJ" es categoría principal Y colección
          con productos propios a la vez (el menú de Shopify enlaza esa
          categoría a la colección real, no a una "bare") — ahí la
          cuadrícula de arriba sale además del listado normal, no en su
          lugar. */}
      {(!groupLanding || groupHasRealOwnCollection) && (
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
      {/* Las categorías principales "bare" no tienen productos
          propios en Shopify — sus productos reales están repartidos en
          sus subcategorías, juntados y paginados a mano en el loader
          (ver groupProducts/sortGroupProducts) porque no hay ninguna
          colección real que los contenga a todos. */}
      {groupLanding && !groupHasRealOwnCollection && groupProducts && groupProducts.length > 0 && (
        <>
          <div id="collection-products" />
          <ProductListing
            title={collection.title}
            products={groupProducts}
            filters={groupFilters}
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
          createdAt
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

// El árbol "Categorías" del menú de Shopify — ver ~/lib/categoryMenu y
// CATEGORIAS.md. Es la misma query que usa el header (MENU_FRAGMENT en
// ~/lib/fragments), pedida aparte aquí porque esta ruta no comparte el
// loader de la raíz.
const CATEGORIES_MENU_QUERY = `#graphql
  ${MENU_FRAGMENT}
  query CategoriesMenu($country: CountryCode, $language: LanguageCode)
    @inContext(country: $country, language: $language) {
    menu(handle: "main-menu") {
      ...Menu
    }
  }
` as const;

// Para la página de una categoría principal "bare" (0 productos
// propios): sus productos reales viven repartidos en sus
// subcategorías, no hay una sola colección que los tenga todos — se
// piden en paralelo, una llamada por subcategoría con esta misma query
// (forma fija, apta para codegen — una query con un número variable de
// alias por grupo no lo sería), y se juntan y ordenan en sortGroupProducts.
const PRODUCTS_BY_COLLECTION_QUERY = `#graphql
  ${PRODUCT_CARD_FRAGMENT}
  query ProductsByCollection(
    $handle: String!
    $first: Int!
    $filters: [ProductFilter!]
    $country: CountryCode
    $language: LanguageCode
  ) @inContext(country: $country, language: $language) {
    collection(handle: $handle) {
      products(first: $first, filters: $filters) {
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
