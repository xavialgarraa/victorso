import type {CartApiQueryFragment} from 'storefrontapi.generated';
import type {CartLayout} from '~/components/CartMain';
import {CartForm, Money, type OptimisticCart} from '@shopify/hydrogen';
import {useEffect, useId, useRef, useState} from 'react';
import {Link, useFetcher} from 'react-router';
import {useAside} from '~/components/Aside';
import {useI18n} from '~/lib/i18n';

const FREE_SHIPPING_THRESHOLD = 149;

type CartSummaryProps = {
  cart: OptimisticCart<CartApiQueryFragment | null>;
  layout: CartLayout;
};

export function CartSummary({cart, layout}: CartSummaryProps) {
  const {t} = useI18n();
  const discountsHeadingId = useId();
  const discountCodeInputId = useId();
  const giftCardHeadingId = useId();
  const giftCardInputId = useId();

  const subtotal = parseFloat(cart?.cost?.subtotalAmount?.amount || '0');
  const currency = cart?.cost?.subtotalAmount?.currencyCode || 'EUR';
  const remaining = Math.max(0, FREE_SHIPPING_THRESHOLD - subtotal);
  const progressPct = Math.min(100, (subtotal / FREE_SHIPPING_THRESHOLD) * 100);

  return (
    <div className={layout === 'page' ? 'cart-summary' : 'cart-summary cart-summary--aside'}>
      <h3 className="mt-0">{t('orderSummary')}</h3>

      <div className="shipping-progress">
        <p>
          {remaining > 0
            ? t('shippingProgress', `${remaining.toFixed(2)} ${currency}`)
            : t('shippingReached')}
        </p>
        <div className="shipping-progress__bar">
          <div className="shipping-progress__fill" style={{width: `${progressPct}%`}} />
        </div>
      </div>

      <div className="cart-summary__row">
        <span>{t('subtotal')}</span>
        <span>
          {cart?.cost?.subtotalAmount?.amount ? <Money data={cart.cost.subtotalAmount} /> : '-'}
        </span>
      </div>

      <div className="cart-summary__row">
        <span>{t('shipping')}</span>
        <span>{remaining <= 0 ? t('free') : t('shippingAtCheckout')}</span>
      </div>

      <CartDiscounts
        discountCodes={cart?.discountCodes}
        discountsHeadingId={discountsHeadingId}
        discountCodeInputId={discountCodeInputId}
      />
      <CartGiftCard
        giftCardCodes={cart?.appliedGiftCards}
        giftCardHeadingId={giftCardHeadingId}
        giftCardInputId={giftCardInputId}
      />

      {cart?.cost?.totalAmount?.amount && (
        <div className="cart-summary__row total">
          <span>{t('total')}</span>
          <span>
            <Money data={cart.cost.totalAmount} />
          </span>
        </div>
      )}

      <CartCheckoutActions checkoutUrl={cart?.checkoutUrl} layout={layout} />
    </div>
  );
}

function CartCheckoutActions({
  checkoutUrl,
  layout,
}: {
  checkoutUrl?: string;
  layout: CartLayout;
}) {
  const {close} = useAside();
  const {t} = useI18n();

  return (
    <div className="cart-summary__actions">
      {layout === 'aside' && (
        <Link className="btn btn--outline btn--block" to="/cart" onClick={close}>
          {t('viewFullCart')}
        </Link>
      )}
      {checkoutUrl && (
        <a href={checkoutUrl} target="_self" className="btn btn--primary btn--block">
          {t('checkoutBtn')} →
        </a>
      )}
    </div>
  );
}

function CartDiscounts({
  discountCodes,
  discountsHeadingId,
  discountCodeInputId,
}: {
  discountCodes?: CartApiQueryFragment['discountCodes'];
  discountsHeadingId: string;
  discountCodeInputId: string;
}) {
  const {t} = useI18n();
  const codes: string[] =
    discountCodes?.filter((discount) => discount.applicable)?.map(({code}) => code) || [];

  return (
    <div className="cart-discount-section">
      {codes.length > 0 && (
        <UpdateDiscountForm>
          <div className="cart-summary__row">
            <span id={discountsHeadingId}>{t('discountCode')}: {codes.join(', ')}</span>
            <button type="submit" className="cart-item__remove">
              {t('remove')}
            </button>
          </div>
        </UpdateDiscountForm>
      )}
      <UpdateDiscountForm discountCodes={codes}>
        <div className="price-inputs">
          <label htmlFor={discountCodeInputId} className="sr-only">
            {t('discountCode')}
          </label>
          <input id={discountCodeInputId} type="text" name="discountCode" placeholder={t('discountCode')} />
          <button type="submit" className="btn btn--outline">
            {t('apply')}
          </button>
        </div>
      </UpdateDiscountForm>
    </div>
  );
}

function UpdateDiscountForm({
  discountCodes,
  children,
}: {
  discountCodes?: string[];
  children: React.ReactNode;
}) {
  return (
    <CartForm
      route="/cart"
      action={CartForm.ACTIONS.DiscountCodesUpdate}
      inputs={{discountCodes: discountCodes || []}}
    >
      {children}
    </CartForm>
  );
}

function CartGiftCard({
  giftCardCodes,
  giftCardHeadingId,
  giftCardInputId,
}: {
  giftCardCodes: CartApiQueryFragment['appliedGiftCards'] | undefined;
  giftCardHeadingId: string;
  giftCardInputId: string;
}) {
  const {t} = useI18n();
  const giftCardCodeInput = useRef<HTMLInputElement>(null);
  const removeButtonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const previousCardIdsRef = useRef<string[]>([]);
  const giftCardAddFetcher = useFetcher({key: 'gift-card-add'});
  const [removedCardIndex, setRemovedCardIndex] = useState<number | null>(null);

  useEffect(() => {
    if (giftCardAddFetcher.data && giftCardCodeInput.current !== null) {
      giftCardCodeInput.current.value = '';
    }
  }, [giftCardAddFetcher.data]);

  useEffect(() => {
    const currentCardIds = giftCardCodes?.map((card) => card.id) || [];

    if (removedCardIndex !== null && giftCardCodes) {
      const focusTargetIndex = Math.min(removedCardIndex, giftCardCodes.length - 1);
      const focusTargetCard = giftCardCodes[focusTargetIndex];
      const focusButton = focusTargetCard
        ? removeButtonRefs.current.get(focusTargetCard.id)
        : null;

      if (focusButton) {
        focusButton.focus();
      } else if (giftCardCodeInput.current) {
        giftCardCodeInput.current.focus();
      }

      setRemovedCardIndex(null);
    }

    previousCardIdsRef.current = currentCardIds;
  }, [giftCardCodes, removedCardIndex]);

  const handleRemoveClick = (cardId: string) => {
    const index = previousCardIdsRef.current.indexOf(cardId);
    if (index !== -1) setRemovedCardIndex(index);
  };

  return (
    <div className="cart-discount-section">
      {giftCardCodes && giftCardCodes.length > 0 && (
        <div>
          <span id={giftCardHeadingId} className="sr-only">
            {t('giftCard')}
          </span>
          {giftCardCodes.map((giftCard) => (
            <RemoveGiftCardForm
              key={giftCard.id}
              giftCardId={giftCard.id}
              lastCharacters={giftCard.lastCharacters}
              onRemoveClick={() => handleRemoveClick(giftCard.id)}
              buttonRef={(el: HTMLButtonElement | null) => {
                if (el) removeButtonRefs.current.set(giftCard.id, el);
                else removeButtonRefs.current.delete(giftCard.id);
              }}
            >
              <div className="cart-summary__row">
                <span>
                  ***{giftCard.lastCharacters} (<Money data={giftCard.amountUsed} />)
                </span>
              </div>
            </RemoveGiftCardForm>
          ))}
        </div>
      )}

      <AddGiftCardForm fetcherKey="gift-card-add">
        <div className="price-inputs">
          <label htmlFor={giftCardInputId} className="sr-only">
            {t('giftCard')}
          </label>
          <input
            id={giftCardInputId}
            type="text"
            name="giftCardCode"
            placeholder={t('giftCard')}
            ref={giftCardCodeInput}
          />
          <button type="submit" className="btn btn--outline" disabled={giftCardAddFetcher.state !== 'idle'}>
            {t('apply')}
          </button>
        </div>
      </AddGiftCardForm>
    </div>
  );
}

function AddGiftCardForm({
  fetcherKey,
  children,
}: {
  fetcherKey?: string;
  children: React.ReactNode;
}) {
  return (
    <CartForm route="/cart" fetcherKey={fetcherKey} action={CartForm.ACTIONS.GiftCardCodesAdd}>
      {children}
    </CartForm>
  );
}

function RemoveGiftCardForm({
  giftCardId,
  lastCharacters,
  children,
  onRemoveClick,
  buttonRef,
}: {
  giftCardId: string;
  lastCharacters: string;
  children: React.ReactNode;
  onRemoveClick?: () => void;
  buttonRef?: (el: HTMLButtonElement | null) => void;
}) {
  const {t} = useI18n();
  return (
    <CartForm
      route="/cart"
      action={CartForm.ACTIONS.GiftCardCodesRemove}
      inputs={{giftCardCodes: [giftCardId]}}
    >
      {children}
      <button
        type="submit"
        className="cart-item__remove"
        aria-label={`${t('remove')} — ***${lastCharacters}`}
        onClick={onRemoveClick}
        ref={buttonRef}
      >
        {t('remove')}
      </button>
    </CartForm>
  );
}
