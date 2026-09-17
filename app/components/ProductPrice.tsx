import {Money} from '@shopify/hydrogen';
import type {MoneyV2} from '@shopify/hydrogen/storefront-api-types';

export function ProductPrice({
  price,
  compareAtPrice,
}: {
  price?: MoneyV2;
  compareAtPrice?: MoneyV2 | null;
}) {
  const hasOffer =
    compareAtPrice && price && parseFloat(compareAtPrice.amount) > parseFloat(price.amount);
  const pct = hasOffer
    ? Math.round((1 - parseFloat(price!.amount) / parseFloat(compareAtPrice!.amount)) * 100)
    : 0;

  return (
    <>
      <span className="now">{price ? <Money data={price} /> : <>&nbsp;</>}</span>
      {hasOffer && (
        <>
          <span className="was">
            <Money data={compareAtPrice!} />
          </span>
          <span className="badge badge--offer">-{pct}%</span>
        </>
      )}
    </>
  );
}
