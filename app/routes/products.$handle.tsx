import {redirect, useLoaderData, Link, Await} from 'react-router';
import {Suspense, useState} from 'react';
import type {Route} from './+types/products.$handle';
import {
  getSelectedProductOptions,
  Analytics,
  useOptimisticVariant,
  getProductOptions,
  getAdjacentAndFirstAvailableVariants,
  useSelectedOptionInUrlParam,
} from '@shopify/hydrogen';
import {ProductPrice} from '~/components/ProductPrice';
import {ProductGallery} from '~/components/ProductGallery';
import {ProductForm} from '~/components/ProductForm';
import {ProductCard} from '~/components/ProductCard';
import {redirectIfHandleIsLocalized} from '~/lib/redirect';
import {PRODUCT_CARD_FRAGMENT} from '~/lib/fragments';
import {Icon} from '~/lib/icons';
import {useI18n} from '~/lib/i18n';
import {getReviews} from '~/lib/productReviews.server';
import {ProductReviews, ReviewsRatingLine} from '~/components/ProductReviews';
import {jsonLdHtml} from '~/lib/jsonLd';

export const meta: Route.MetaFunction = ({data}) => {
  const product = data?.product;
  const title = product?.title ?? '';
  const pageTitle = `${title} — Victor So Professional`;
  // La descripción real del producto puede venir con HTML o estar vacía
  // (muchos de los migrados desde LiveCommerce) — se limpia y se recorta al
  // tamaño que Google muestra, con un fallback genérico si no hay nada.
  const plainDescription = (product?.description || '').replace(/\s+/g, ' ').trim().slice(0, 160);
  const description = plainDescription || `${title} al mejor precio en Victor So Professional — tienda de equipos DJ y sonido profesional.`;
  const canonical = `https://www.victorso.es/products/${product?.handle ?? ''}`;
  const image = product?.images?.nodes?.[0]?.url;

  return [
    {title: pageTitle},
    {name: 'description', content: description},
    // Sin tagName: "link" esto se renderiza como <meta rel="canonical">,
    // que no es HTML válido y Google lo ignora — con esto sí sale como
    // <link rel="canonical">.
    {tagName: 'link', rel: 'canonical', href: canonical},
    {property: 'og:type', content: 'product'},
    {property: 'og:title', content: pageTitle},
    {property: 'og:description', content: description},
    {property: 'og:url', content: canonical},
    ...(image ? [{property: 'og:image', content: image}] : []),
  ];
};

export async function loader(args: Route.LoaderArgs) {
  const deferredData = loadDeferredData(args);
  const criticalData = await loadCriticalData(args);
  // Antes esto iba deferred (sin esperar) — pero para poder meter la nota
  // media en los datos estructurados Product/AggregateRating hace falta
  // tenerla ya en el HTML que ve Google, no solo tras hidratar en el
  // cliente. Firestore es rápido, así que esperarla aquí no se nota.
  const reviews = await getReviews(args.context.env, criticalData.product.id).catch(() => []);
  return {...deferredData, ...criticalData, reviews};
}

async function loadCriticalData({context, params, request}: Route.LoaderArgs) {
  const {handle} = params;
  const {storefront} = context;

  if (!handle) {
    throw new Error('Expected product handle to be defined');
  }

  const [{product}] = await Promise.all([
    storefront.query(PRODUCT_QUERY, {
      variables: {handle, selectedOptions: getSelectedProductOptions(request)},
    }),
  ]);

  if (!product?.id) {
    throw new Response(null, {status: 404});
  }

  redirectIfHandleIsLocalized(request, {handle, data: product});

  return {product};
}

function loadDeferredData({context}: Route.LoaderArgs) {
  const {storefront} = context;
  // Nota: idealmente séria "mismo vendor/categoria", pero eso obligaria a
  // esperar a loadCriticalData (perder el fetch en paralelo). Se muestra
  // una seleccion generica de mas vendidos en su lugar.
  const related = storefront.query(RELATED_PRODUCTS_QUERY).catch(() => null);

  return {related};
}

export default function Product() {
  const {product, related, reviews} = useLoaderData<typeof loader>();
  const [activeTab, setActiveTab] = useState<'description' | 'reviews'>('description');

  const selectedVariant = useOptimisticVariant(
    product.selectedOrFirstAvailableVariant,
    getAdjacentAndFirstAvailableVariants(product),
  );

  useSelectedOptionInUrlParam(selectedVariant.selectedOptions);

  const productOptions = getProductOptions({
    ...product,
    selectedOrFirstAvailableVariant: selectedVariant,
  });

  const {title, vendor, descriptionHtml} = product;
  const images = product.images.nodes;
  const {t} = useI18n();

  const canonicalUrl = `https://www.victorso.es/products/${product.handle}`;
  const productJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: title,
    description: (product.description || '').replace(/\s+/g, ' ').trim().slice(0, 500) || undefined,
    image: images.map((img) => img.url),
    sku: selectedVariant?.sku || undefined,
    brand: vendor ? {'@type': 'Brand', name: vendor} : undefined,
    offers: selectedVariant
      ? {
          '@type': 'Offer',
          url: canonicalUrl,
          priceCurrency: selectedVariant.price.currencyCode,
          price: selectedVariant.price.amount,
          availability: selectedVariant.availableForSale
            ? 'https://schema.org/InStock'
            : 'https://schema.org/OutOfStock',
          itemCondition: 'https://schema.org/NewCondition',
          // Campos "opcionales pero recomendados" para que la ficha sea
          // elegible como "ficha de comerciante" (Google Shopping/free
          // listings) — política real de la tienda: envío gratis desde
          // 149€ (si no, 6,99€) y devolución gratuita en 30 días.
          shippingDetails: {
            '@type': 'OfferShippingDetails',
            shippingRate: {'@type': 'MonetaryAmount', value: '6.99', currency: 'EUR'},
            shippingDestination: {'@type': 'DefinedRegion', addressCountry: 'ES'},
            deliveryTime: {
              '@type': 'ShippingDeliveryTime',
              handlingTime: {'@type': 'QuantitativeValue', minValue: 0, maxValue: 1, unitCode: 'DAY'},
              transitTime: {'@type': 'QuantitativeValue', minValue: 1, maxValue: 2, unitCode: 'DAY'},
            },
          },
          hasMerchantReturnPolicy: {
            '@type': 'MerchantReturnPolicy',
            applicableCountry: 'ES',
            returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
            merchantReturnDays: 30,
            returnMethod: 'https://schema.org/ReturnByMail',
            returnFees: 'https://schema.org/FreeReturn',
          },
        }
      : undefined,
    ...(reviews.length > 0
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1),
            reviewCount: reviews.length,
          },
        }
      : {}),
  };

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {'@type': 'ListItem', position: 1, name: 'Inicio', item: 'https://www.victorso.es/'},
      {'@type': 'ListItem', position: 2, name: title, item: canonicalUrl},
    ],
  };

  return (
    <div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{__html: jsonLdHtml(productJsonLd)}} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{__html: jsonLdHtml(breadcrumbJsonLd)}} />
      <div className="breadcrumb container">
        <Link to="/">{t('breadcrumbHome')}</Link> / {title}
      </div>
      <div className="pdp">
        <ProductGallery images={images} selectedVariantImage={selectedVariant?.image} />

        <div className="pdp__info">
          {vendor && <div className="pdp__vendor">{vendor}</div>}
          <h1 className="pdp__title">{title}</h1>
          <ReviewsRatingLine reviews={reviews} />

          <div className="pdp__price" id="pdpPrice">
            <ProductPrice
              price={selectedVariant?.price}
              compareAtPrice={selectedVariant?.compareAtPrice}
            />
          </div>

          <ProductForm
            productId={product.id}
            productOptions={productOptions}
            selectedVariant={selectedVariant}
          />

          <div className="pdp__perks">
            <div>
              <Icon name="truck" />
              <span>{t('perkShip')}</span>
            </div>
            <div>
              <Icon name="shield" />
              <span>{t('perkWarranty')}</span>
            </div>
            <div>
              <Icon name="returnArrow" />
              <span>{t('perkReturn')}</span>
            </div>
            <div>
              <Icon name="card" />
              <span>{t('perkSecure')}</span>
            </div>
          </div>
        </div>

        <div className="pdp__tabs">
          <div className="tabs__nav">
            <button
              className={activeTab === 'description' ? 'active' : ''}
              type="button"
              onClick={() => setActiveTab('description')}
            >
              {t('tabDescription')}
            </button>
            <button
              className={activeTab === 'reviews' ? 'active' : ''}
              type="button"
              onClick={() => setActiveTab('reviews')}
            >
              {t('tabReviews')} ({reviews.length})
            </button>
          </div>
          <div className={`tabs__panel${activeTab === 'description' ? ' active' : ''}`}>
            {descriptionHtml ? (
              <div className="pdp__desc" dangerouslySetInnerHTML={{__html: descriptionHtml}} />
            ) : (
              <p className="pdp__desc">{t('noDescription')}</p>
            )}
          </div>
          <div className={`tabs__panel${activeTab === 'reviews' ? ' active' : ''}`}>
            <ProductReviews
              productId={product.id}
              productHandle={product.handle}
              productTitle={title}
              reviews={reviews}
            />
          </div>
        </div>

        <Suspense fallback={null}>
          <Await resolve={related}>
            {(data) => {
              const items = data?.products.nodes.filter((p) => p.id !== product.id).slice(0, 4) ?? [];
              if (!items.length) return null;
              return (
                <div className="related">
                  <div className="section__head">
                    <h2>{t('relatedProducts')}</h2>
                  </div>
                  <div className="prodgrid">
                    {items.map((p) => (
                      <ProductCard key={p.id} product={p} />
                    ))}
                  </div>
                </div>
              );
            }}
          </Await>
        </Suspense>
      </div>

      <Analytics.ProductView
        data={{
          products: [
            {
              id: product.id,
              title: product.title,
              price: selectedVariant?.price.amount || '0',
              vendor: product.vendor,
              variantId: selectedVariant?.id || '',
              variantTitle: selectedVariant?.title || '',
              quantity: 1,
            },
          ],
        }}
      />
    </div>
  );
}

const PRODUCT_VARIANT_FRAGMENT = `#graphql
  fragment ProductVariant on ProductVariant {
    availableForSale
    compareAtPrice {
      amount
      currencyCode
    }
    id
    image {
      __typename
      id
      url
      altText
      width
      height
    }
    price {
      amount
      currencyCode
    }
    product {
      title
      handle
    }
    selectedOptions {
      name
      value
    }
    sku
    title
    unitPrice {
      amount
      currencyCode
    }
  }
` as const;

const PRODUCT_FRAGMENT = `#graphql
  fragment Product on Product {
    id
    title
    vendor
    handle
    descriptionHtml
    description
    encodedVariantExistence
    encodedVariantAvailability
    images(first: 8) {
      nodes {
        id
        url
        altText
        width
        height
      }
    }
    options {
      name
      optionValues {
        name
        firstSelectableVariant {
          ...ProductVariant
        }
        swatch {
          color
          image {
            previewImage {
              url
            }
          }
        }
      }
    }
    selectedOrFirstAvailableVariant(selectedOptions: $selectedOptions, ignoreUnknownOptions: true, caseInsensitiveMatch: true) {
      ...ProductVariant
    }
    adjacentVariants (selectedOptions: $selectedOptions) {
      ...ProductVariant
    }
    seo {
      description
      title
    }
  }
  ${PRODUCT_VARIANT_FRAGMENT}
` as const;

const PRODUCT_QUERY = `#graphql
  query Product(
    $country: CountryCode
    $handle: String!
    $language: LanguageCode
    $selectedOptions: [SelectedOptionInput!]!
  ) @inContext(country: $country, language: $language) {
    product(handle: $handle) {
      ...Product
    }
  }
  ${PRODUCT_FRAGMENT}
` as const;

const RELATED_PRODUCTS_QUERY = `#graphql
  ${PRODUCT_CARD_FRAGMENT}
  query RelatedProducts($country: CountryCode, $language: LanguageCode)
    @inContext(country: $country, language: $language) {
    products(first: 5, sortKey: BEST_SELLING) {
      nodes {
        ...ProductCard
      }
    }
  }
` as const;
