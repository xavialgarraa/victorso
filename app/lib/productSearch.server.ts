import type {HydrogenContext} from '@shopify/hydrogen';

const SEARCH_QUERY = `#graphql
  query ChatProductSearch($term: String!, $first: Int!, $country: CountryCode, $language: LanguageCode)
    @inContext(country: $country, language: $language) {
    search(query: $term, types: [PRODUCT], first: $first, unavailableProducts: LAST) {
      nodes {
        ... on Product {
          title
          handle
          vendor
          priceRange {
            minVariantPrice {
              amount
              currencyCode
            }
          }
          selectedOrFirstAvailableVariant(ignoreUnknownOptions: true, selectedOptions: []) {
            availableForSale
          }
        }
      }
    }
  }
` as const;

export type ProductSearchResult = {
  title: string;
  vendor: string;
  price: string;
  currency: string;
  available: boolean;
  url: string;
};

/** Busca productos reales del catálogo (Storefront API) para que el
 * asistente de chat pueda recomendar con datos ciertos en vez de
 * inventarlos. */
export async function searchProductsForChat(
  storefront: HydrogenContext['storefront'],
  {query, maxPrice}: {query: string; maxPrice?: number},
): Promise<ProductSearchResult[]> {
  const {search} = await storefront.query(SEARCH_QUERY, {
    variables: {term: query, first: 10},
  });

  let products = search.nodes as Array<{
    title: string;
    handle: string;
    vendor: string;
    priceRange: {minVariantPrice: {amount: string; currencyCode: string}};
    selectedOrFirstAvailableVariant: {availableForSale: boolean} | null;
  }>;

  if (typeof maxPrice === 'number') {
    products = products.filter(
      (p) => parseFloat(p.priceRange.minVariantPrice.amount) <= maxPrice,
    );
  }

  return products.slice(0, 5).map((p) => ({
    title: p.title,
    vendor: p.vendor,
    price: p.priceRange.minVariantPrice.amount,
    currency: p.priceRange.minVariantPrice.currencyCode,
    available: p.selectedOrFirstAvailableVariant?.availableForSale ?? true,
    url: `/products/${p.handle}`,
  }));
}
