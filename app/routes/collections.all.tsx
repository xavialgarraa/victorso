import type {Route} from './+types/collections.all';
import {useLoaderData} from 'react-router';
import {PRODUCT_CARD_FRAGMENT} from '~/lib/fragments';
import {ProductListing, type ListingFilter} from '~/components/ProductListing';

export const meta: Route.MetaFunction = () => {
  return [{title: `Todos los productos — Victor So Professional`}];
};

const SORT_OPTIONS = [
  {value: 'relevance', label: 'Relevancia'},
  {value: 'price-asc', label: 'Precio: menor a mayor'},
  {value: 'price-desc', label: 'Precio: mayor a menor'},
  {value: 'title', label: 'Nombre A-Z'},
] as const;

const PER_PAGE_OPTIONS = [12, 24, 48];

// La consulta raiz `products` de Shopify no admite el argumento `filters`
// (los facets de Shopify solo existen dentro de una coleccion real), asi
// que para "Todos los productos" traemos el catalogo entero (cabe de sobra
// bajo el limite de 250 de Shopify) y calculamos nosotros mismos los
// filtros de precio/disponibilidad/marca y el conteo real, igual que
// haria Shopify dentro de una coleccion.
export async function loader({context, request}: Route.LoaderArgs) {
  const {storefront} = context;
  const url = new URL(request.url);

  const {products} = await storefront.query(ALL_PRODUCTS_QUERY, {
    variables: {},
    cache: storefront.CacheShort(),
  });

  const collectionsData = await storefront.query(CATEGORY_LINKS_QUERY);
  const categoryLinks = collectionsData.collections.nodes
    .filter((c) => c.handle !== 'frontpage' && c.products.nodes.length > 0)
    .map((c) => ({handle: c.handle, title: c.title}));

  const allProducts = products.nodes;

  // --- Filtros seleccionados por la URL ---
  const selectedFilters = url.searchParams.getAll('filter').map((f) => {
    try {
      return JSON.parse(f) as {
        price?: {min?: number; max?: number};
        available?: boolean;
        productVendor?: string;
      };
    } catch {
      return null;
    }
  });

  const priceFilter = selectedFilters.find((f) => f?.price)?.price;
  const availabilityFilters = selectedFilters
    .filter((f) => f?.available !== undefined)
    .map((f) => f!.available);
  const vendorFilters = selectedFilters
    .filter((f) => f?.productVendor)
    .map((f) => f!.productVendor as string);

  let filtered = allProducts;
  if (priceFilter) {
    filtered = filtered.filter((p) => {
      const price = parseFloat(p.priceRange.minVariantPrice.amount);
      return (
        price >= (priceFilter.min ?? 0) &&
        price <= (priceFilter.max ?? Number.MAX_SAFE_INTEGER)
      );
    });
  }
  if (availabilityFilters.length > 0) {
    filtered = filtered.filter((p) =>
      availabilityFilters.includes(!!p.selectedOrFirstAvailableVariant?.availableForSale),
    );
  }
  if (vendorFilters.length > 0) {
    filtered = filtered.filter((p) => vendorFilters.includes(p.vendor));
  }

  // --- Orden ---
  const sortParam = url.searchParams.get('sort') || 'relevance';
  const sorted = [...filtered].sort((a, b) => {
    if (sortParam === 'price-asc' || sortParam === 'price-desc') {
      const priceA = parseFloat(a.priceRange.minVariantPrice.amount);
      const priceB = parseFloat(b.priceRange.minVariantPrice.amount);
      return sortParam === 'price-asc' ? priceA - priceB : priceB - priceA;
    }
    if (sortParam === 'title') {
      return a.title.localeCompare(b.title);
    }
    return 0; // relevancia = orden del catálogo
  });

  // --- Paginación manual ---
  const perPage = PER_PAGE_OPTIONS.includes(Number(url.searchParams.get('perPage')))
    ? Number(url.searchParams.get('perPage'))
    : PER_PAGE_OPTIONS[0];
  const totalPages = Math.max(1, Math.ceil(sorted.length / perPage));
  const page = Math.min(
    totalPages,
    Math.max(1, Number(url.searchParams.get('page')) || 1),
  );
  const pageProducts = sorted.slice((page - 1) * perPage, page * perPage);

  // --- Facets calculados sobre TODO el catálogo (no solo lo filtrado),
  // para que las opciones no desaparezcan al ir marcando filtros. ---
  const prices = allProducts.map((p) => parseFloat(p.priceRange.minVariantPrice.amount));
  const priceMin = Math.min(...prices);
  const priceMax = Math.max(...prices);

  const availableCount = allProducts.filter(
    (p) => p.selectedOrFirstAvailableVariant?.availableForSale,
  ).length;
  const unavailableCount = allProducts.length - availableCount;

  const vendorCounts = new Map<string, number>();
  for (const p of allProducts) {
    if (!p.vendor) continue;
    vendorCounts.set(p.vendor, (vendorCounts.get(p.vendor) ?? 0) + 1);
  }

  const listingFilters: ListingFilter[] = [
    {
      id: 'price',
      label: 'Precio',
      type: 'PRICE_RANGE',
      values: [
        {
          id: 'price',
          label: 'Precio',
          count: 0,
          input: JSON.stringify({price: {min: Math.floor(priceMin), max: Math.ceil(priceMax)}}),
        },
      ],
    },
    {
      id: 'availability',
      label: 'Disponibilidad',
      type: 'LIST',
      values: [
        {id: 'available-true', label: 'En existencia', count: availableCount, input: JSON.stringify({available: true})},
        {id: 'available-false', label: 'Agotado', count: unavailableCount, input: JSON.stringify({available: false})},
      ].filter((v) => v.count > 0),
    },
    {
      id: 'vendor',
      label: 'Marca',
      type: 'LIST',
      values: [...vendorCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([vendor, count]) => ({
          id: `vendor-${vendor}`,
          label: vendor,
          count,
          input: JSON.stringify({productVendor: vendor}),
        })),
    },
  ];

  return {
    products: pageProducts,
    resultCount: sorted.length,
    manualPagination: {page, totalPages},
    categoryLinks,
    listingFilters,
  };
}

export default function Collection() {
  const {products, resultCount, manualPagination, categoryLinks, listingFilters} =
    useLoaderData<typeof loader>();

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
        resultCount={resultCount}
        manualPagination={manualPagination}
      />
    </div>
  );
}

const ALL_PRODUCTS_QUERY = `#graphql
  ${PRODUCT_CARD_FRAGMENT}
  query AllProducts($country: CountryCode, $language: LanguageCode)
    @inContext(country: $country, language: $language) {
    products(first: 250) {
      nodes {
        ...ProductCard
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
