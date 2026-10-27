import type {Route} from './+types/api.popular-products';

export type PopularProduct = {
  handle: string;
  title: string;
  image: string | null;
  price: number;
  currency: string;
};

const POPULAR_PRODUCTS_QUERY = `#graphql
  query PopularProducts {
    products(first: 10, sortKey: BEST_SELLING, query: "available_for_sale:true") {
      nodes {
        handle
        title
        featuredImage { url altText }
        priceRange { minVariantPrice { amount currencyCode } }
      }
    }
  }
` as const;

/** Productos sugeridos al abrir el buscador, antes de escribir nada —
 * reutiliza el orden "más vendidos" de Shopify, igual que el hero admin. */
export async function loader({context}: Route.LoaderArgs) {
  const data = await context.storefront.query(POPULAR_PRODUCTS_QUERY);
  const products: PopularProduct[] = data.products.nodes.map((p) => ({
    handle: p.handle,
    title: p.title,
    image: p.featuredImage?.url ?? null,
    price: Number(p.priceRange.minVariantPrice.amount),
    currency: p.priceRange.minVariantPrice.currencyCode,
  }));
  return {products};
}
