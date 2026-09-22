import {Link} from 'react-router';
import type {Route} from './+types/servicio-tecnico';
import {Icon} from '~/lib/icons';
import {QuoteForm} from '~/components/QuoteForm';
import {useI18n} from '~/lib/i18n';

export const meta: Route.MetaFunction = () => {
  return [{title: 'Servicio Técnico — Victor So Professional'}];
};

export default function ServicioTecnicoPage() {
  const {t} = useI18n();
  const waHref = `https://wa.me/34619406443?text=${encodeURIComponent(t('techWaText'))}`;

  return (
    <div>
      <div className="breadcrumb container">
        <Link to="/">{t('breadcrumbHome')}</Link> / {t('techTitle')}
      </div>

      <section className="section">
        <div className="container">
          <h1 className="section-title-lg">{t('techTitle')}</h1>
          <p className="visit-text">{t('techIntro')}</p>

          <div className="tech-badges">
            <div className="tech-badge">
              <img src="/assets/logos/pioneer-dj.png" alt="Pioneer DJ" loading="lazy" />
              <span>{t('techAuthorized')}</span>
            </div>
            <div className="tech-badge">
              <img src="/assets/logos/alphatheta.jpg" alt="AlphaTheta" loading="lazy" />
              <span>{t('techAuthorized')}</span>
            </div>
          </div>

          <a className="btn btn--primary" href={waHref} target="_blank" rel="noopener noreferrer">
            <Icon name="whatsapp" /> {t('techCta')}
          </a>
        </div>
      </section>

      <section className="section section--muted reveal">
        <div className="container">
          <div className="tech-grid">
            <div className="tech-card">
              <Icon name="wrench" />
              <h3>{t('techCard1Title')}</h3>
              <p>{t('techCard1Text')}</p>
            </div>
            <div className="tech-card">
              <Icon name="shield" />
              <h3>{t('techCard2Title')}</h3>
              <p>{t('techCard2Text')}</p>
            </div>
            <div className="tech-card">
              <Icon name="checkCircle" />
              <h3>{t('techCard3Title')}</h3>
              <p>{t('techCard3Text')}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="section reveal">
        <div className="container">
          <div className="section__head">
            <h2>{t('techContactTitle')}</h2>
          </div>
          <p className="visit-text">{t('techContactText')}</p>
          <div className="tech-contacts">
            <a className="btn btn--outline" href={waHref} target="_blank" rel="noopener noreferrer">
              <Icon name="whatsapp" /> WhatsApp
            </a>
            <a className="btn btn--outline" href="tel:+34972364114">
              <Icon name="phone" /> 972 364 114
            </a>
          </div>

          <div className="tech-quoteform">
            <h3>{t('quoteFormTitle')}</h3>
            <QuoteForm />
          </div>
        </div>
      </section>

      <section className="section section--muted reveal">
        <div className="container tech-install-cta">
          <div>
            <h2>{t('techInstallTitle')}</h2>
            <p className="visit-text">{t('techInstallText')}</p>
          </div>
          <Link className="btn btn--primary" to="/instalaciones">
            <Icon name="arrowRight" /> {t('techInstallCta')}
          </Link>
        </div>
      </section>
    </div>
  );
}
