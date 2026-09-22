import {Link} from 'react-router';
import type {Route} from './+types/opina';
import {Icon} from '~/lib/icons';

// Enlace de "Escribir una reseña" de la ficha de Google Business.
// TODO: sustituir por el enlace real (tipo https://g.page/r/XXXXXXXX/review)
// en cuanto Xavier lo pase — de momento es un marcador de posición.
const GOOGLE_REVIEW_URL = 'https://g.page/r/PENDIENTE/review';

export const meta: Route.MetaFunction = () => {
  return [{title: 'Gracias por tu visita — Victor So Professional'}];
};

export default function OpinaPage() {
  return (
    <div className="opina-page">
      <div className="opina-page__card">
        <img className="opina-page__logo" src="/assets/logo-icon.png" alt="Victor So Professional" width={56} height={46} />
        <h1>¡Gracias por tu visita!</h1>
        <p>Tu opinión nos ayuda muchísimo a seguir mejorando. ¿Nos dejas una reseña en Google? Solo te llevará un minuto.</p>
        <a className="btn btn--primary opina-page__cta" href={GOOGLE_REVIEW_URL} target="_blank" rel="noopener noreferrer">
          <Icon name="star" /> Dejar reseña en Google
        </a>
        <Link className="opina-page__back" to="/">
          Volver a la tienda
        </Link>
      </div>
    </div>
  );
}
