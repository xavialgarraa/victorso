import {Link} from 'react-router';
import type {Route} from './+types/marcas';
import {BRANDS} from '~/lib/brands';

export const meta: Route.MetaFunction = () => {
  return [{title: 'Nuestras Marcas — Victor So Professional'}];
};

export default function BrandsIndex() {
  return (
    <div>
      <div className="breadcrumb container">
        <Link to="/">Inicio</Link> / Nuestras Marcas
      </div>
      <section className="section">
        <div className="container">
          <h1 className="section-title-lg">Nuestras Marcas</h1>
          <p className="visit-text">
            Trabajamos con los fabricantes más reconocidos del sector del audio profesional, DJ e
            iluminación. Elige una marca para ver su información y sus productos.
          </p>
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
