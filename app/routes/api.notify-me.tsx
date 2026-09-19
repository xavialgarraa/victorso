import type {Route} from './+types/api.notify-me';
import {addRestockSubscriber} from '~/lib/restockSubscribers.server';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function action({request, context}: Route.ActionArgs) {
  const formData = await request.formData();
  const email = String(formData.get('email') || '').trim();
  const productId = String(formData.get('productId') || '');

  if (!productId) {
    return {ok: false, error: 'Falta el producto.'};
  }
  if (!EMAIL_RE.test(email)) {
    return {ok: false, error: 'Introduce un email válido.'};
  }

  try {
    await addRestockSubscriber(context.env, productId, email);
    return {ok: true};
  } catch (error) {
    console.error('[notify-me]', error);
    return {
      ok: false,
      error: 'No se pudo guardar tu email ahora mismo. Inténtalo de nuevo en un momento.',
    };
  }
}
