import {Link, useNavigate} from 'react-router';
import {useState} from 'react';
import {type MappedProductOptions} from '@shopify/hydrogen';
import type {
  Maybe,
  ProductOptionValueSwatch,
} from '@shopify/hydrogen/storefront-api-types';
import {AddToCartButton} from './AddToCartButton';
import {useAside} from './Aside';
import {Icon} from '~/lib/icons';
import {NotifyMeForm} from './NotifyMeForm';
import type {ProductFragment} from 'storefrontapi.generated';
import {useI18n} from '~/lib/i18n';

export function ProductForm({
  productId,
  productOptions,
  selectedVariant,
}: {
  productId: string;
  productOptions: MappedProductOptions[];
  selectedVariant: ProductFragment['selectedOrFirstAvailableVariant'];
}) {
  const navigate = useNavigate();
  const {open} = useAside();
  const {t} = useI18n();
  const [qty, setQty] = useState(1);
  return (
    <div className="product-form">
      {productOptions.map((option) => {
        // If there is only a single value in the option values, don't display the option
        if (option.optionValues.length === 1) return null;

        return (
          <div className="option-select" key={option.name}>
            <label>{option.name}</label>
            <div className="product-options-grid">
              {option.optionValues.map((value) => {
                const {
                  name,
                  handle,
                  variantUriQuery,
                  selected,
                  available,
                  exists,
                  isDifferentProduct,
                  swatch,
                } = value;

                if (isDifferentProduct) {
                  // SEO
                  // When the variant is a combined listing child product
                  // that leads to a different url, we need to render it
                  // as an anchor tag
                  return (
                    <Link
                      className="product-options-item"
                      key={option.name + name}
                      prefetch="intent"
                      preventScrollReset
                      replace
                      to={`/products/${handle}?${variantUriQuery}`}
                      style={{
                        border: selected
                          ? '1px solid #e30613'
                          : '1px solid var(--border-strong)',
                        opacity: available ? 1 : 0.3,
                      }}
                    >
                      <ProductOptionSwatch swatch={swatch} name={name} />
                    </Link>
                  );
                } else {
                  // SEO
                  // When the variant is an update to the search param,
                  // render it as a button with javascript navigating to
                  // the variant so that SEO bots do not index these as
                  // duplicated links
                  return (
                    <button
                      type="button"
                      className={`product-options-item${
                        exists && !selected ? ' link' : ''
                      }`}
                      key={option.name + name}
                      style={{
                        border: selected
                          ? '1px solid #e30613'
                          : '1px solid var(--border-strong)',
                        opacity: available ? 1 : 0.3,
                      }}
                      disabled={!exists}
                      onClick={() => {
                        if (!selected) {
                          void navigate(`?${variantUriQuery}`, {
                            replace: true,
                            preventScrollReset: true,
                          });
                        }
                      }}
                    >
                      <ProductOptionSwatch swatch={swatch} name={name} />
                    </button>
                  );
                }
              })}
            </div>
          </div>
        );
      })}

      <div className="qty-row">
        <span style={{fontWeight: 700, fontSize: '.85rem'}}>{t('quantity')}</span>
        <div className="qty-stepper">
          <button type="button" aria-label="Restar" onClick={() => setQty((q) => Math.max(1, q - 1))}>
            <Icon name="minus" />
          </button>
          <span>{qty}</span>
          <button type="button" aria-label="Sumar" onClick={() => setQty((q) => q + 1)}>
            <Icon name="plus" />
          </button>
        </div>
      </div>

      <p className={`stock-msg ${selectedVariant?.availableForSale ? 'in' : 'out'}`}>
        <Icon name={selectedVariant?.availableForSale ? 'checkCircle' : 'close'} />
        <span>{selectedVariant?.availableForSale ? t('inStock') : t('outOfStock')}</span>
      </p>

      <div className="pdp__actions">
        <AddToCartButton
          className="btn btn--primary"
          disabled={!selectedVariant || !selectedVariant.availableForSale}
          onClick={() => {
            open('cart');
          }}
          lines={
            selectedVariant
              ? [
                  {
                    merchandiseId: selectedVariant.id,
                    quantity: qty,
                    selectedVariant,
                  },
                ]
              : []
          }
        >
          {selectedVariant?.availableForSale ? t('addToCart') : t('outOfStock')}
        </AddToCartButton>
        <AddToCartButton
          className="btn btn--dark"
          disabled={!selectedVariant || !selectedVariant.availableForSale}
          onClick={() => {
            void navigate('/cart');
          }}
          lines={
            selectedVariant
              ? [
                  {
                    merchandiseId: selectedVariant.id,
                    quantity: qty,
                    selectedVariant,
                  },
                ]
              : []
          }
        >
          {t('buyNow')}
        </AddToCartButton>
      </div>

      {!selectedVariant?.availableForSale && <NotifyMeForm productId={productId} />}
    </div>
  );
}

function ProductOptionSwatch({
  swatch,
  name,
}: {
  swatch?: Maybe<ProductOptionValueSwatch> | undefined;
  name: string;
}) {
  const image = swatch?.image?.previewImage?.url;
  const color = swatch?.color;

  if (!image && !color) return name;

  return (
    <div
      aria-label={name}
      className="product-option-label-swatch"
      style={{
        backgroundColor: color || 'transparent',
      }}
    >
      {!!image && <img src={image} alt={name} />}
    </div>
  );
}
