import {Fragment} from 'react';
import {Link} from 'react-router';
import {BRANDS} from '~/lib/brands';

const FEATURED_BRANDS = BRANDS.filter((b) => b.featured);

/** Ports the demo's `brandStrip()`: featured brand logos in an infinite ticker. */
export function BrandsTicker() {
  return (
    <div className="ticker">
      <div className="ticker__track">
        {[0, 1].map((rep) => (
          <Fragment key={rep}>
            {FEATURED_BRANDS.map((b) => (
              <Link key={`${rep}-${b.slug}`} className="ticker__logo" to={`/brand/${b.slug}`} aria-label={b.name}>
                <img src={b.logo} alt={b.name} loading="lazy" />
              </Link>
            ))}
            <Link className="ticker__logo ticker__logo--all" to="/marcas">
              Ver todas las marcas
            </Link>
          </Fragment>
        ))}
      </div>
    </div>
  );
}
