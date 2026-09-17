import {Link, useLoaderData} from 'react-router';
import type {Route} from './+types/quienes-somos';
import {Icon} from '~/lib/icons';

export const meta: Route.MetaFunction = () => {
  return [{title: 'Quiénes somos — Victor So Professional'}];
};

export async function loader({context}: Route.LoaderArgs) {
  const {storefront} = context;
  const {products} = await storefront.query(VENDORS_QUERY);
  const vendors = [...new Set(products.nodes.map((p) => p.vendor).filter(Boolean))].slice(0, 16);
  return {vendors};
}

export default function AboutPage() {
  const {vendors} = useLoaderData<typeof loader>();
  return (
    <div>
      <div className="breadcrumb container">
        <Link to="/">Inicio</Link> / Quiénes somos
      </div>

      <section className="section about-page">
        <div className="container">
          <h1 className="section-title-lg">Quiénes somos</h1>
          <p className="visit-text">
            Desde 1987, tu tienda de confianza en equipos de sonido, DJ e iluminación en la Costa
            Brava.
          </p>
        </div>
      </section>

      <section className="section reveal">
        <div className="container">
          <div className="section__head">
            <h2>Visítanos</h2>
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
          <p className="visit-text">
            Además de tienda online, somos tienda física con servicio técnico e instalaciones a
            domicilio. Pásate a ver el material en directo o pide cita para tu instalación.
          </p>
          <a
            className="btn btn--primary"
            href="https://maps.app.goo.gl/rCt2WshcWTawViw28"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Icon name="pin" /> Cómo llegar
          </a>
        </div>
      </section>

      <section className="section section--muted reveal">
        <div className="container">
          <div className="about-page__grid">
            <div className="about-page__text">
              <p>
                Victor So Professional es una empresa fundada en 1987 para dar respuesta a la
                creciente demanda de audio de calidad en la Costa Brava. Con los años hemos ido
                ampliando nuestro campo de actividad hacia la iluminación espectacular, los
                audiovisuales y las instalaciones de antenas y fibra óptica.
              </p>
              <p>
                Uno de nuestros objetivos fundamentales, que se mantiene desde el primer día, es
                ofrecer productos de calidad, realizar instalaciones fiables y duraderas en el
                tiempo, y mantener siempre el equilibrio entre calidad y precio.
              </p>
              <p>
                Hoy seguimos siendo una tienda especializada y de trato cercano: asesoramos a
                técnicos de sonido, DJs y estudios profesionales para que encuentren el equipo que
                mejor se adapta a su proyecto.
              </p>
            </div>
            <div className="about-page__stats">
              <div className="about-stat">
                <span className="about-stat__num">1987</span>
                <span>Año de fundación</span>
              </div>
              <div className="about-stat">
                <span className="about-stat__num">+35</span>
                <span>Años de experiencia</span>
              </div>
              <div className="about-stat">
                <span className="about-stat__num">100%</span>
                <span>Garantía oficial</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section reveal">
        <div className="container">
          <div className="section__head">
            <h2>Instalaciones realizadas</h2>
          </div>
          <p className="visit-text">
            Además de tienda, somos técnicos con más de 35 años de experiencia: diseñamos,
            instalamos y mantenemos sistemas de sonido e iluminación a medida para ayuntamientos,
            discotecas, salas de eventos y empresas.
          </p>
          <Link className="btn btn--primary" to="/instalaciones">
            <Icon name="arrowRight" /> Ver instalaciones realizadas
          </Link>
        </div>
      </section>

      {vendors.length > 0 && (
        <section className="section section--muted reveal">
          <div className="container">
            <div className="section__head">
              <h2>Marcas con las que trabajamos</h2>
            </div>
            <div className="ticker">
              <div className="ticker__track">
                {[...vendors, ...vendors].map((v, i) => (
                  <Link key={`${v}-${i}`} className="ticker__pill" to={`/search?q=${encodeURIComponent(v)}`}>
                    {v}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

const VENDORS_QUERY = `#graphql
  query AboutVendors($country: CountryCode, $language: LanguageCode)
    @inContext(country: $country, language: $language) {
    products(first: 50) {
      nodes {
        vendor
      }
    }
  }
` as const;
