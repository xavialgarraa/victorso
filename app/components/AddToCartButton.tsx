import {type FetcherWithComponents} from 'react-router';
import {CartForm, type OptimisticCartLineInput} from '@shopify/hydrogen';

export function AddToCartButton({
  analytics,
  children,
  disabled,
  lines,
  onClick,
  className,
}: {
  analytics?: unknown;
  children: React.ReactNode;
  disabled?: boolean;
  lines: Array<OptimisticCartLineInput>;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <CartForm route="/cart" inputs={{lines}} action={CartForm.ACTIONS.LinesAdd}>
      {(fetcher: FetcherWithComponents<any>) => (
        <>
          <input
            name="analytics"
            type="hidden"
            value={JSON.stringify(analytics)}
          />
          <button
            type="submit"
            className={`${className ?? ''}${fetcher.state !== 'idle' ? ' is-loading' : ''}`}
            onClick={onClick}
            disabled={disabled ?? fetcher.state !== 'idle'}
          >
            <span className="addtocart__spinner" aria-hidden="true" />
            <span className="addtocart__content">{children}</span>
          </button>
        </>
      )}
    </CartForm>
  );
}
