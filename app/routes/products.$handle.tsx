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

export const meta: Route.MetaFunction = ({data}) => {
  return [
    {title: `${data?.product.title ?? ''} — Victor So Professional`},
    {
      rel: 'canonical',
      href: `/products/${data?.product.handle}`,
    },
  ];
};

export async function loader(args: Route.LoaderArgs) {
  const deferredData = loadDeferredData(args);
  const criticalData = await loadCriticalData(args);
  // No se puede pedir por el id del producto hasta tener loadCriticalData,
  // pero seguimos sin bloquear la respuesta: se pasa como promesa para
  // <Await>, igual que "related".
  const reviews = getReviews(args.context.env, criticalData.product.id).catch(() => []);
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

  return (
    <div>
      <div className="breadcrumb container">
        <Link to="/">{t('breadcrumbHome')}</Link> / {title}
      </div>
      <div className="pdp">
        <ProductGallery images={images} selectedVariantImage={selectedVariant?.image} />

        <div className="pdp__info">
          {vendor && <div className="pdp__vendor">{vendor}</div>}
          <h1 className="pdp__title">{title}</h1>
          <Suspense fallback={null}>
            <Await resolve={reviews}>{(list) => <ReviewsRatingLine reviews={list} />}</Await>
          </Suspense>

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
              {t('tabReviews')}{' '}
              <Suspense fallback={null}>
                <Await resolve={reviews}>{(list) => `(${list.length})`}</Await>
              </Suspense>
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
            <Suspense fallback={null}>
              <Await resolve={reviews}>
                {(list) => (
                  <ProductReviews
                    productId={product.id}
                    productHandle={product.handle}
                    productTitle={title}
                    reviews={list}
                  />
                )}
              </Await>
            </Suspense>
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
