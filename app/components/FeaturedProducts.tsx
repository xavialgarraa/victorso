import {useState} from 'react';
import {ProductCard} from '~/components/ProductCard';
import {useI18n} from '~/lib/i18n';
import type {ProductCardFragment} from 'storefrontapi.generated';

type Tab = 'bestsellers' | 'newest' | 'offers';

/** Sección "Productos destacados" con pestañas — sustituye a las dos
 * secciones sueltas de "Más valorados" y "Ofertas" por una sola con
 * tabs, como en el mockup. Las tres listas ya vienen cargadas desde el
 * loader de la home, cambiar de pestaña es solo estado de cliente, sin
 * ningún viaje al servidor. */
export function FeaturedProducts({
  bestsellers,
  newest,
  offers,
}: {
  bestsellers: ProductCardFragment[];
  newest: ProductCardFragment[];
  offers: ProductCardFragment[];
}) {
  const {t} = useI18n();
  const [tab, setTab] = useState<Tab>('bestsellers');

  const lists: Record<Tab, ProductCardFragment[]> = {bestsellers, newest, offers};
  const tabs: Array<{key: Tab; label: string}> = [
    {key: 'bestsellers', label: t('tabBestsellers')},
    {key: 'newest', label: t('tabNewest')},
    ...(offers.length > 0 ? [{key: 'offers' as const, label: t('tabOffers')}] : []),
  ];
  const products = lists[tab];

  return (
    <section className="section reveal">
      <div className="container">
        <div className="section__head">
          <h2>{t('featuredTitle')}</h2>
        </div>
        <div className="featured-tabs">
          {tabs.map((tb) => (
            <button
              key={tb.key}
              type="button"
              className={`featured-tabs__btn${tab === tb.key ? ' active' : ''}`}
              onClick={() => setTab(tb.key)}
            >
              {tb.label}
            </button>
          ))}
        </div>
        <div className="prodgrid prodgrid--home">
          {products.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </div>
    </section>
  );
}
