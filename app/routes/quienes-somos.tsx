import {Link} from 'react-router';
import type {Route} from './+types/quienes-somos';
import {Icon} from '~/lib/icons';
import {BrandsTicker} from '~/components/BrandsTicker';
import {useI18n} from '~/lib/i18n';

export const meta: Route.MetaFunction = () => {
  return [{title: 'Quiénes somos — Victor So Professional'}];
};

export default function AboutPage() {
  const {t} = useI18n();
  const waHref = `https://wa.me/34619406443`;
  return (
    <div>
      <div className="breadcrumb container">
        <Link to="/">{t('breadcrumbHome')}</Link> / {t('aboutTitle')}
      </div>

      <section className="section about-hero">
        <div className="container about-hero__grid">
          <div className="about-hero__info">
            <h1 className="section-title-lg">{t('aboutTitle')}</h1>
            <p className="about-hero__lede">{t('aboutLede')}</p>
            <p className="visit-text">{t('aboutHeroIntro')}</p>
            <div className="about-hero__actions">
              <a className="btn btn--primary" href={waHref} target="_blank" rel="noopener noreferrer">
                <Icon name="chat" /> {t('aboutHeroWaCta')}
              </a>
              <a className="btn btn--outline" href="tel:+34972364114">
                <Icon name="phone" /> {t('aboutHeroCallCta')}
              </a>
            </div>
          </div>
          <div className="about-hero__photo">
            <img src="/assets/tienda-fachada.jpeg" alt="Fachada de la tienda Victor So Professional" loading="lazy" />
          </div>
        </div>
      </section>

      <section className="section reveal">
        <div className="container">
          <div className="section__head">
            <h2>{t('aboutVisitTitle')}</h2>
          </div>
          <div className="visit-grid">
            <div className="visit-photo">
              <img src="/assets/tienda-fachada.jpeg" alt="Fachada de la tienda Victor So Professional" loading="lazy" />
            </div>
            <div className="visit-map">
              <iframe
                src="https://www.google.com/maps?q=41.7040354,2.8498664&z=16&output=embed"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                allowFullScreen
                title="Ubicación de Victor So Professional"
              />
            </div>
          </div>
          <p className="visit-text">{t('aboutVisitText')}</p>
          <a
            className="btn btn--primary"
            href="https://maps.app.goo.gl/rCt2WshcWTawViw28"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Icon name="pin" /> {t('aboutVisitCta')}
          </a>
        </div>
      </section>

      <section className="section section--muted reveal">
        <div className="container">
          <div className="about-page__grid">
            <div className="about-page__text">
              <p>{t('aboutP1')}</p>
              <p>{t('aboutP2')}</p>
              <p>{t('aboutP3')}</p>
            </div>
            <div className="about-page__stats">
              <div className="about-stat">
                <span className="about-stat__num">1987</span>
                <span>{t('aboutStatYear')}</span>
              </div>
              <div className="about-stat">
                <span className="about-stat__num">+35</span>
                <span>{t('aboutStatExp')}</span>
              </div>
              <div className="about-stat">
                <span className="about-stat__num">100%</span>
                <span>{t('aboutStatWarranty')}</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section reveal">
        <div className="container">
          <div className="section__head">
            <h2>{t('aboutInstallTitle')}</h2>
          </div>
          <p className="visit-text">{t('aboutInstallIntro')}</p>
          <Link className="btn btn--primary" to="/instalaciones">
            <Icon name="arrowRight" /> {t('aboutInstallCta')}
          </Link>
        </div>
      </section>

      <section className="section section--muted reveal">
        <div className="container">
          <div className="section__head">
            <h2>{t('aboutBrands')}</h2>
          </div>
          <BrandsTicker />
        </div>
      </section>
    </div>
  );
}
