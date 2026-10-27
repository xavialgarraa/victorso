import {useEffect} from 'react';
import {useFetcher} from 'react-router';
import type {CartRecommendedProduct} from '~/routes/api.cart-recommendations';
import {AddToCartButton} from './AddToCartButton';
import {useAside} from './Aside';
import {useI18n} from '~/lib/i18n';

// Forma mínima que necesitamos del carrito — evitamos atarnos al tipo
// exacto de CartApiQueryFragment porque useOptimisticCart() devuelve una
// variante con campos opcionales (líneas optimistas antes de confirmar
// con el servidor) que no encaja 1:1 con el fragmento generado.
type MinimalCartLine = {
  merchandise?: {product?: {id?: string; handle?: string}};
};
type MinimalCart = {
  lines?: {nodes?: MinimalCartLine[]};
};

/** "Completa tu pedido" en el carrito grande (escritorio, con hueco a la
 * derecha) — recomienda productos a partir del primer artículo del
 * carrito, excluyendo lo que ya está dentro. Se oculta sola por CSS en
 * pantallas estrechas en vez de no pedir los datos, para mantenerlo simple. */
export function CartRecommendations({cart}: {cart: MinimalCart}) {
  const {t} = useI18n();
  const {setCartWide} = useAside();
  const fetcher = useFetcher<{products: CartRecommendedProduct[]}>();

  const lines = cart.lines?.nodes ?? [];
  const seedProduct = lines[0]?.merchandise?.product;

  const cartHandles = lines
    .map((line) => line.merchandise?.product?.handle)
    .filter((h): h is string => Boolean(h));

  const seedId = seedProduct?.id;
  const seedHandle = seedProduct?.handle;
  const excludeKey = cartHandles.join(',');

  useEffect(() => {
    if (!seedId || !seedHandle) return;
    const params = new URLSearchParams({productId: seedId, handle: seedHandle, exclude: excludeKey});
    fetcher.load(`/api/cart-recommendations?${params.toString()}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedId, seedHandle, excludeKey]);

  const products = fetcher.data?.products ?? [];

  useEffect(() => {
    setCartWide(products.length > 0);
    return () => setCartWide(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products.length]);

  if (products.length === 0) return null;

  return (
    <div className="cart-recs">
      <h4>{t('cartRecsTitle')}</h4>
      <div className="cart-recs__list">
        {products.map((p) => (
          <div className="cart-recs__item" key={p.handle}>
            {p.image && <img src={p.image} alt="" className="cart-recs__img" />}
            <div className="cart-recs__info">
              <a href={`/products/${p.handle}`} className="cart-recs__title">
                {p.title}
              </a>
              <span className="cart-recs__price">
                {new Intl.NumberFormat('es-ES', {style: 'currency', currency: p.currency}).format(p.price)}
              </span>
            </div>
            {p.variantId && (
              <AddToCartButton
                className="cart-recs__add"
                lines={[{merchandiseId: p.variantId, quantity: 1}]}
              >
                +
              </AddToCartButton>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
