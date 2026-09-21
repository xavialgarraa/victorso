import {Link} from 'react-router';
import type {Route} from './+types/marcas';
import {BRANDS} from '~/lib/brands';
import {useI18n} from '~/lib/i18n';

export const meta: Route.MetaFunction = () => {
  return [{title: 'Nuestras Marcas — Victor So Professional'}];
};

export default function BrandsIndex() {
  const {t} = useI18n();
  return (
    <div>
      <div className="breadcrumb container">
        <Link to="/">{t('breadcrumbHome')}</Link> / {t('navBrands')}
      </div>
      <section className="section">
        <div className="container">
          <h1 className="section-title-lg">{t('navBrands')}</h1>
          <p className="visit-text">{t('brandsIndexLede')}</p>
          <div className="brandsindex__grid">
            {BRANDS.map((b) => (
              <Link
                key={b.slug}
                className={`brandsindex__card${b.logo ? '' : ' brandsindex__card--text'}`}
                to={`/brand/${b.slug}`}
              >
                {b.logo ? (
                  <>
                    <span className="brandsindex__logo">
                      <img src={b.logo} alt={b.name} loading="lazy" />
                    </span>
                    <span className="brandsindex__name">{b.name}</span>
                  </>
                ) : (
                  <span className="brandsindex__name brandsindex__name--big">{b.name}</span>
                )}
              </Link>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
