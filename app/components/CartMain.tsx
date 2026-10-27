import {useOptimisticCart} from '@shopify/hydrogen';
import {Link} from 'react-router';
import type {CartApiQueryFragment} from 'storefrontapi.generated';
import {useAside} from '~/components/Aside';
import {CartLineItem, type CartLine} from '~/components/CartLineItem';
import {CartSummary} from './CartSummary';
import {CartRecommendations} from './CartRecommendations';
import {useI18n} from '~/lib/i18n';

export type CartLayout = 'page' | 'aside';

export type CartMainProps = {
  cart: CartApiQueryFragment | null;
  layout: CartLayout;
};

export type LineItemChildrenMap = {[parentId: string]: CartLine[]};
/** Returns a map of all line items and their children. */
function getLineItemChildrenMap(lines: CartLine[]): LineItemChildrenMap {
  const children: LineItemChildrenMap = {};
  for (const line of lines) {
    if ('parentRelationship' in line && line.parentRelationship?.parent) {
      const parentId = line.parentRelationship.parent.id;
      if (!children[parentId]) children[parentId] = [];
      children[parentId].push(line);
    }
    if ('lineComponents' in line) {
      const lineChildren = getLineItemChildrenMap(line.lineComponents);
      for (const [parentId, childIds] of Object.entries(lineChildren)) {
        if (!children[parentId]) children[parentId] = [];
        children[parentId].push(...childIds);
      }
    }
  }
  return children;
}

/**
 * The main cart component that displays the cart items and summary.
 * It is used by both the /cart route and the cart aside dialog.
 */
export function CartMain({layout, cart: originalCart}: CartMainProps) {
  const cart = useOptimisticCart(originalCart);

  const cartHasItems = cart?.totalQuantity ? cart.totalQuantity > 0 : false;
  const childrenMap = getLineItemChildrenMap(cart?.lines?.nodes ?? []);

  if (!cartHasItems) {
    return <CartEmpty layout={layout} />;
  }

  const lines = (
    <div className={layout === 'page' ? 'cart-items-card' : undefined}>
      {(cart?.lines?.nodes ?? []).map((line) => {
        if ('parentRelationship' in line && line.parentRelationship?.parent) {
          return null;
        }
        return <CartLineItem key={line.id} line={line} layout={layout} childrenMap={childrenMap} />;
      })}
    </div>
  );
  const summary = <CartSummary cart={cart} layout={layout} />;

  // El layout "page" (/cart) usa el grid de .cart-page, que espera estas
  // dos piezas como hijos directos (líneas + resumen en dos columnas) — no
  // envolverlas en un div extra aquí o se rompe esa maquetación.
  if (layout === 'page') {
    return (
      <div className="cart-page">
        {lines}
        {summary}
      </div>
    );
  }

  return (
    <div className="cart-drawer">
      <div className="cart-drawer__main">
        {lines}
        {summary}
      </div>
      {cart && <CartRecommendations cart={cart} />}
    </div>
  );
}

function CartEmpty({layout}: {layout: CartMainProps['layout']}) {
  const {close} = useAside();
  const {t} = useI18n();
  return (
    <div className="empty-state">
      <p>{t('cartEmpty')}</p>
      <Link
        className="btn btn--primary"
        to="/collections/all"
        onClick={close}
        prefetch="viewport"
      >
        {t('cartEmptyCta')}
      </Link>
    </div>
  );
}
