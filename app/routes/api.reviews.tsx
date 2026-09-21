import type {Route} from './+types/api.reviews';
import {addReview} from '~/lib/productReviews.server';

const NAME_MAX = 60;
const COMMENT_MAX = 600;

export async function action({request, context}: Route.ActionArgs) {
  const formData = await request.formData();

  // Honeypot: campo oculto que un usuario real nunca rellena, pero un bot
  // de envío automático de formularios sí. Si viene con valor, fingimos
  // éxito sin guardar nada.
  if (String(formData.get('website') || '').trim()) {
    return {ok: true};
  }

  const productId = String(formData.get('productId') || '');
  const productHandle = String(formData.get('productHandle') || '');
  const productTitle = String(formData.get('productTitle') || '');
  const name = String(formData.get('name') || '').trim().slice(0, NAME_MAX);
  const comment = String(formData.get('comment') || '').trim().slice(0, COMMENT_MAX);
  const rating = Math.min(5, Math.max(1, Math.round(Number(formData.get('rating')) || 0)));

  if (!productId) {
    return {ok: false, error: 'Falta el producto.'};
  }
  if (!name) {
    return {ok: false, error: 'Escribe tu nombre.'};
  }
  if (!comment) {
    return {ok: false, error: 'Escribe tu opinión.'};
  }
  if (!rating) {
    return {ok: false, error: 'Selecciona una valoración.'};
  }

  try {
    await addReview(
      context.env,
      {id: productId, handle: productHandle, title: productTitle},
      {name, rating, comment},
    );
    return {ok: true};
  } catch (error) {
    console.error('[reviews]', error);
    return {
      ok: false,
      error: 'No se pudo publicar tu reseña ahora mismo. Inténtalo de nuevo en un momento.',
    };
  }
}
