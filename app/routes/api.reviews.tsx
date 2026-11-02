import type {Route} from './+types/api.reviews';
import {addReview} from '~/lib/productReviews.server';
import {sendNewReviewPendingEmail} from '~/lib/email.server';
import {checkRateLimit} from '~/lib/rateLimit.server';

const NAME_MAX = 60;
const COMMENT_MAX = 600;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function action({request, context}: Route.ActionArgs) {
  if (!checkRateLimit('reviews', request, {limit: 5, windowMs: 60 * 60_000})) {
    return {ok: false, error: 'Demasiados intentos seguidos. Prueba de nuevo en un rato.'};
  }

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
  const emailRaw = String(formData.get('email') || '').trim();
  const email = EMAIL_RE.test(emailRaw) ? emailRaw : undefined;
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
      {name, email, rating, comment},
    );
  } catch (error) {
    console.error('[reviews]', error);
    return {
      ok: false,
      error: 'No se pudo publicar tu reseña ahora mismo. Inténtalo de nuevo en un momento.',
    };
  }

  try {
    const adminUrl = new URL('/admin-interno/resenas', request.url).toString();
    await sendNewReviewPendingEmail(context.env, {productTitle, name, rating, comment, adminUrl});
  } catch (error) {
    console.error('[reviews] admin alert email', error);
  }

  return {ok: true};
}
