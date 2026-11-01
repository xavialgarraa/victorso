import type {Route} from './+types/api.newsletter-signup';
import {subscribeToNewsletter} from '~/lib/newsletter.server';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function action({request, context}: Route.ActionArgs) {
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
