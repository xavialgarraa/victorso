import {Link} from 'react-router';
import type {Route} from './+types/opina';
import {Icon} from '~/lib/icons';

// Abre la ficha de Google Maps directamente en la pestaña de reseñas
// (con el botón "Escribir una reseña" a la vista). Si en algún momento
// se verifica el Perfil de Empresa en business.google.com, ahí sale un
// enlace corto tipo g.page/r/XXXXXXXX/review que va un paso más directo
// — se puede sustituir por ese cuando se tenga.
const GOOGLE_REVIEW_URL =
  'https://www.google.com/maps/place/Victor+So+Professional+S.L.+-+DJ+Equipment,+Studio,+Lights+%26+More/@41.7040314,2.8498659,17z/data=!4m8!3m7!1s0x12bb1737b5042867:0xa951a550aceaff14!8m2!3d41.7040314!4d2.8498659!9m1!1b1!16s%2Fg%2F1tcw0hfj';

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
