import {useEffect} from 'react';
import {Link, useLoaderData} from 'react-router';
import type {Route} from './+types/instalaciones';
import {Icon} from '~/lib/icons';
import {useI18n} from '~/lib/i18n';
import {listInstallations} from '~/lib/installations.server';

export const meta: Route.MetaFunction = () => {
  return [{title: 'Instalaciones realizadas — Victor So Professional'}];
};

export async function loader({context}: Route.LoaderArgs) {
  const installations = await listInstallations(context.env);
  return {installations: installations.map((i) => i.installation)};
}

/**
 * El script de embed de TikTok solo procesa los <blockquote> presentes en el
 * DOM cuando se ejecuta. Se inyecta al montar la pagina para que la escanee.
 */
function useTikTokEmbed() {
  useEffect(() => {
    document.getElementById('tiktok-embed-script')?.remove();
    const script = document.createElement('script');
    script.id = 'tiktok-embed-script';
    script.async = true;
    script.src = 'https://www.tiktok.com/embed.js';
    document.body.appendChild(script);
    return () => {
      document.getElementById('tiktok-embed-script')?.remove();
    };
  }, []);
}

export default function InstallationsPage() {
  useTikTokEmbed();
  const {t} = useI18n();
  const {installations} = useLoaderData<typeof loader>();
  const waHref = `https://wa.me/34619406443?text=${encodeURIComponent(t('installWaText'))}`;

  return (
    <div>
      <div className="breadcrumb container">
        <Link to="/">{t('breadcrumbHome')}</Link> / {t('navInstalaciones')}
      </div>

      <section className="section">
        <div className="container">
          <h1 className="section-title-lg">{t('aboutInstallTitle')}</h1>
          <p className="visit-text">{t('aboutInstallIntro')}</p>
          <a className="btn btn--primary" href={waHref} target="_blank" rel="noopener noreferrer">
            <Icon name="whatsapp" /> {t('installCta')}
          </a>
        </div>
      </section>

      <section className="section section--muted reveal">
        <div className="container">
          <div className="install-grid">
            {installations.map((ins) => (
              <article className="install-card" key={ins.title}>
                <img src={ins.imageUrl} alt={ins.title} loading="lazy" />
                <div className="install-card__body">
                  <h3>{ins.title}</h3>
                  <div className="install-card__loc">
                    <Icon name="pin" /> {ins.location}
                  </div>
                  <p>{ins.description}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section reveal">
        <div className="container">
          <div className="section__head">
            <h2>{t('installTiktokTitle')}</h2>
          </div>
          <div className="tiktok-embed-wrap">
            <blockquote
              className="tiktok-embed"
              cite="https://www.tiktok.com/@emilio.victorso"
              data-unique-id="emilio.victorso"
              data-embed-type="creator"
              style={{maxWidth: '780px', minWidth: '288px'}}
            >
              <section />
            </blockquote>
          </div>
        </div>
      </section>
    </div>
  );
}
