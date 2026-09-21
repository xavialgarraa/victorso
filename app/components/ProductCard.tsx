import {Link} from 'react-router';
import {Image, Money} from '@shopify/hydrogen';
import type {ProductCardFragment} from 'storefrontapi.generated';
import {AddToCartButton} from '~/components/AddToCartButton';
import {useAside} from '~/components/Aside';
import {Icon} from '~/lib/icons';
import {useI18n} from '~/lib/i18n';

export function ProductCard({product}: {product: ProductCardFragment}) {
  const {t} = useI18n();
  const price = product.priceRange.minVariantPrice;
  const compareAtPrice = product.compareAtPriceRange?.minVariantPrice;
  const hasOffer =
    compareAtPrice && parseFloat(compareAtPrice.amount) > parseFloat(price.amount);
  const pct = hasOffer
    ? Math.round((1 - parseFloat(price.amount) / parseFloat(compareAtPrice.amount)) * 100)
    : 0;
  const variant = product.selectedOrFirstAvailableVariant;
  const {open} = useAside();

  return (
    <article className="pcard">
      <Link to={`/products/${product.handle}`} prefetch="intent">
        <div className="pcard__imgwrap">
          {(hasOffer || !variant?.availableForSale) && (
            <div className="pcard__badges">
              {hasOffer && <span className="badge badge--offer">-{pct}%</span>}
              {!variant?.availableForSale && (
                <span className="badge badge--outlet">{t('outOfStock')}</span>
              )}
            </div>
          )}
          {product.featuredImage && (
            <Image
              data={product.featuredImage}
              aspectRatio="1/1"
              sizes="(min-width: 45em) 25vw, 50vw"
            />
          )}
        </div>
        <div className="pcard__body">
          {product.vendor && <div className="pcard__vendor">{product.vendor}</div>}
          <div className="pcard__title">{product.title}</div>
          {product.description && <p className="pcard__desc">{product.description}</p>}
        </div>
      </Link>
      <div className="pcard__footer">
        <div className="pcard__price">
          {hasOffer && <span className="badge badge--offer pcard__pricebadge">-{pct}%</span>}
          <span className="now">
            <Money data={price} />
          </span>
          {hasOffer && (
            <span className="was">
              <Money data={compareAtPrice} />
            </span>
          )}
        </div>
        {variant?.availableForSale && (
          <AddToCartButton
            className="pcard__addbtn"
            lines={[{merchandiseId: variant.id, quantity: 1}]}
            onClick={() => open('cart')}
          >
            <Icon name="cart" />
          </AddToCartButton>
        )}
      </div>
    </article>
  );
}
