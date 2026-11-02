import type {Route} from './+types/api.newsletter-signup';
import {subscribeToNewsletter} from '~/lib/newsletter.server';
import {checkRateLimit} from '~/lib/rateLimit.server';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function action({request, context}: Route.ActionArgs) {
  if (!checkRateLimit('newsletter', request, {limit: 5, windowMs: 60 * 60_000})) {
    return {ok: false, error: 'Demasiados intentos seguidos. Prueba de nuevo en un rato.'};
  }

  const formData = await request.formData();
  const email = String(formData.get('email') || '').trim();

  if (!EMAIL_RE.test(email)) {
    return {ok: false, error: 'Introduce un email válido.'};
  }

  try {
    await subscribeToNewsletter(context.env, email);
    return {ok: true};
  } catch (error) {
    console.error('[newsletter-signup]', error);
    return {
      ok: false,
      error: 'No se pudo completar la suscripción ahora mismo. Inténtalo de nuevo en un momento.',
    };
  }
}
