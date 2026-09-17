import type {CartLineUpdateInput} from '@shopify/hydrogen/storefront-api-types';
import type {CartLayout, LineItemChildrenMap} from '~/components/CartMain';
import {CartForm, Image, Money, type OptimisticCartLine} from '@shopify/hydrogen';
import {useVariantUrl} from '~/lib/variants';
import {Link} from 'react-router';
import {useAside} from './Aside';
import {Icon} from '~/lib/icons';
import type {CartApiQueryFragment} from 'storefrontapi.generated';

export type CartLine = OptimisticCartLine<CartApiQueryFragment>;

/**
 * A single line item in the cart. It displays the product image, title, price.
 * It also provides controls to update the quantity or remove the line item.
 */
export function CartLineItem({
  layout,
  line,
  childrenMap,
}: {
  layout: CartLayout;
  line: CartLine;
  childrenMap: LineItemChildrenMap;
}) {
  const {id, merchandise, quantity, isOptimistic} = line;
  const {product, title, image, selectedOptions} = merchandise;
  const lineItemUrl = useVariantUrl(product.handle, selectedOptions);
  const {close} = useAside();
  const lineItemChildren = childrenMap[id];

  const prevQuantity = Number(Math.max(0, quantity - 1).toFixed(0));
  const nextQuantity = Number((quantity + 1).toFixed(0));
  const variantLabel = selectedOptions
    .filter((o) => o.value !== 'Default Title')
    .map((o) => o.value)
    .join(' / ');

  return (
    <div className="cart-item" data-variant={id}>
      {image && <Image alt={title} aspectRatio="1/1" data={image} width={100} height={100} />}
      <div className="cart-item__info">
        <Link
          prefetch="intent"
          to={lineItemUrl}
          onClick={() => {
            if (layout === 'aside') close();
          }}
        >
          <div className="cart-item__title">{product.title}</div>
        </Link>
        {variantLabel && <div className="cart-item__variant">{variantLabel}</div>}
        <div className="cart-item__price">
          <Money data={line.cost.totalAmount} />
        </div>
      </div>
      <div className="cart-item__right">
        <div className="qty-stepper">
          <CartLineUpdateButton lines={[{id, quantity: prevQuantity}]}>
            <button
              type="submit"
              aria-label="Restar"
              disabled={quantity <= 1 || !!isOptimistic}
            >
              <Icon name="minus" />
            </button>
          </CartLineUpdateButton>
          <span>{quantity}</span>
          <CartLineUpdateButton lines={[{id, quantity: nextQuantity}]}>
            <button type="submit" aria-label="Sumar" disabled={!!isOptimistic}>
              <Icon name="plus" />
            </button>
          </CartLineUpdateButton>
        </div>
        <CartLineRemoveButton lineIds={[id]} disabled={!!isOptimistic} />
      </div>

      {lineItemChildren ? (
        <ul className="cart-line-children">
          {lineItemChildren.map((childLine) => (
            <CartLineItem
              childrenMap={childrenMap}
              key={childLine.id}
              line={childLine}
              layout={layout}
            />
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function CartLineRemoveButton({
  lineIds,
  disabled,
}: {
  lineIds: string[];
  disabled: boolean;
}) {
  return (
    <CartForm
      fetcherKey={getUpdateKey(lineIds)}
      route="/cart"
      action={CartForm.ACTIONS.LinesRemove}
      inputs={{lineIds}}
    >
      <button className="cart-item__remove" disabled={disabled} type="submit">
        Quitar
      </button>
    </CartForm>
  );
}

function CartLineUpdateButton({
  children,
  lines,
}: {
  children: React.ReactNode;
  lines: CartLineUpdateInput[];
}) {
  const lineIds = lines.map((line) => line.id);

  return (
    <CartForm
      fetcherKey={getUpdateKey(lineIds)}
      route="/cart"
      action={CartForm.ACTIONS.LinesUpdate}
      inputs={{lines}}
    >
      {children}
    </CartForm>
  );
}

function getUpdateKey(lineIds: string[]) {
  return [CartForm.ACTIONS.LinesUpdate, ...lineIds].join('-');
}
