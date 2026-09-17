import {useEffect} from 'react';
import {Link} from 'react-router';
import type {Route} from './+types/instalaciones';
import {Icon} from '~/lib/icons';

export const meta: Route.MetaFunction = () => {
  return [{title: 'Instalaciones realizadas — Victor So Professional'}];
};

const INSTALLATIONS = [
  {
    title: 'Sonorización del Paseo Marítimo de Lloret de Mar',
    location: 'Lloret de Mar (Girona)',
    image: '/assets/instalacion-paseo-maritimo.jpeg',
    description:
      'Megafonía integrada en el propio alumbrado público: altavoces instalados en las farolas a lo largo de todo el paseo marítimo, con cobertura sonora uniforme de punta a punta. El ayuntamiento la usa para avisos municipales, música ambiente y la locución/sonido de eventos como el Drone Festival, garantizando una escucha nítida en toda la longitud del paseo sin puntos ciegos.',
  },
];

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
  const waHref = `https://wa.me/34619406443?text=${encodeURIComponent(
    'Hola, querría pedir información sobre una instalación de sonido/iluminación.',
  )}`;

  return (
    <div>
      <div className="breadcrumb container">
        <Link to="/">Inicio</Link> / Instalaciones
      </div>

      <section className="section">
        <div className="container">
          <h1 className="section-title-lg">Instalaciones realizadas</h1>
          <p className="visit-text">
            Además de tienda, somos técnicos con más de 35 años de experiencia: diseñamos,
            instalamos y mantenemos sistemas de sonido e iluminación a medida para ayuntamientos,
            discotecas, salas de eventos y empresas. Desde la megafonía de un paseo marítimo hasta
            la iluminación escénica de una sala, nos encargamos de todo el proceso — estudio
            previo, instalación y servicio técnico posterior — con material profesional y garantía
            oficial.
          </p>
          <a className="btn btn--primary" href={waHref} target="_blank" rel="noopener noreferrer">
            <Icon name="chat" /> Pedir instalación
          </a>
        </div>
      </section>

      <section className="section section--muted reveal">
        <div className="container">
          <div className="install-grid">
            {INSTALLATIONS.map((ins) => (
              <article className="install-card" key={ins.title}>
                <img src={ins.image} alt={ins.title} loading="lazy" />
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
            <h2>Nuestro TikTok</h2>
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
