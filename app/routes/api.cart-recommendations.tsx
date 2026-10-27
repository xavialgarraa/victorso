import type {Route} from './+types/api.cart-recommendations';
import {getManualRecommendation} from '~/lib/cartRecommendations.server';

export type CartRecommendedProduct = {
  handle: string;
  title: string;
  image: string | null;
  price: number;
  currency: string;
  compareAtPrice: number | null;
  variantId: string | null;
  availableForSale: boolean;
};

const MAX_RESULTS = 4;

const RECOMMENDATIONS_QUERY = `#graphql
  query CartProductRecommendations($productId: ID!, $intent: ProductRecommendationIntent!) {
    productRecommendations(productId: $productId, intent: $intent) {
      handle
      title
      featuredImage { url altText }
      priceRange { minVariantPrice { amount currencyCode } }
      compareAtPriceRange { minVariantPrice { amount } }
      selectedOrFirstAvailableVariant {
        id
        availableForSale
      }
    }
  }
` as const;

const PRODUCTS_BY_HANDLE_QUERY = `#graphql
  query CartRecommendationsByHandle($query: String!) {
    products(first: 10, query: $query) {
      nodes {
        handle
        title
        featuredImage { url altText }
        priceRange { minVariantPrice { amount currencyCode } }
        compareAtPriceRange { minVariantPrice { amount } }
        selectedOrFirstAvailableVariant {
          id
          availableForSale
        }
      }
    }
  }
` as const;

type RawProduct = {
  handle: string;
  title: string;
  featuredImage: {url: string; altText: string | null} | null;
  priceRange: {minVariantPrice: {amount: string; currencyCode: string}};
  compareAtPriceRange: {minVariantPrice: {amount: string}} | null;
  selectedOrFirstAvailableVariant: {id: string; availableForSale: boolean} | null;
};

function mapProduct(p: RawProduct): CartRecommendedProduct {
  return {
    handle: p.handle,
    title: p.title,
    image: p.featuredImage?.url ?? null,
    price: Number(p.priceRange.minVariantPrice.amount),
    currency: p.priceRange.minVariantPrice.currencyCode,
    compareAtPrice: p.compareAtPriceRange?.minVariantPrice?.amount
      ? Number(p.compareAtPriceRange.minVariantPrice.amount)
      : null,
    variantId: p.selectedOrFirstAvailableVariant?.id ?? null,
    availableForSale: p.selectedOrFirstAvailableVariant?.availableForSale ?? false,
  };
}

export async function loader({request, context}: Route.LoaderArgs) {
  const url = new URL(request.url);
  const productId = url.searchParams.get('productId') || '';
  const productHandle = url.searchParams.get('handle') || '';
  const excludeHandles = new Set(
    (url.searchParams.get('exclude') || '').split(',').map((h) => h.trim()).filter(Boolean),
  );

  if (!productId || !productHandle) {
    return {products: [] as CartRecommendedProduct[]};
  }

  const {storefront} = context;

  // 1. Override manual del panel admin, si existe.
  const manualHandles = await getManualRecommendation(context.env, productHandle);
  if (manualHandles.length > 0) {
    const wantedHandles = new Set(manualHandles);
    // El "query:" de Shopify es búsqueda difusa, no un filtro exacto (un
    // solo handle puede devolver productos con handles parecidos) — se
    // pide con un OR de todos los handles y se filtra después por
    // coincidencia exacta, en vez de confiar en el resultado tal cual.
    const query = manualHandles.map((h) => `handle:'${h}'`).join(' OR ');
    const data = await storefront.query(PRODUCTS_BY_HANDLE_QUERY, {variables: {query}});
    const products = (data.products.nodes as RawProduct[])
      .filter((p) => wantedHandles.has(p.handle) && !excludeHandles.has(p.handle))
      .map(mapProduct)
      .filter((p) => p.availableForSale)
      .slice(0, MAX_RESULTS);
    if (products.length > 0) return {products};
    // Si el override no da productos válidos (agotados/borrados), cae al
    // automático de abajo en vez de devolver una lista vacía.
  }

  // 2. Automático de Shopify: primero "se compran juntos", si no hay
  // suficientes, "relacionados" (mismo tipo/colección).
  const [complementary, related] = await Promise.all([
    storefront.query(RECOMMENDATIONS_QUERY, {variables: {productId, intent: 'COMPLEMENTARY'}}),
    storefront.query(RECOMMENDATIONS_QUERY, {variables: {productId, intent: 'RELATED'}}),
  ]);

  const seen = new Set<string>();
  const combined: RawProduct[] = [];
  const all = [
    ...(complementary.productRecommendations ?? []),
    ...(related.productRecommendations ?? []),
  ] as RawProduct[];
  for (const p of all) {
    if (seen.has(p.handle) || excludeHandles.has(p.handle)) continue;
    seen.add(p.handle);
    combined.push(p);
  }

  const products = combined.map(mapProduct).filter((p) => p.availableForSale).slice(0, MAX_RESULTS);
  return {products};
}
