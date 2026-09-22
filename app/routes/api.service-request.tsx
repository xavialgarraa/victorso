import type {Route} from './+types/api.service-request';
import {createServiceRequest, type ServiceRequestType} from '~/lib/serviceRequests.server';
import {sendServiceRequestEmail} from '~/lib/email.server';

const VALID_TYPES: ServiceRequestType[] = ['reparacion', 'instalacion', 'otro'];

export async function action({request, context}: Route.ActionArgs) {
  const formData = await request.formData();
  const name = String(formData.get('name') || '').trim();
  const contact = String(formData.get('contact') || '').trim();
  const typeRaw = String(formData.get('type') || 'otro');
  const message = String(formData.get('message') || '').trim();
  const type: ServiceRequestType = VALID_TYPES.includes(typeRaw as ServiceRequestType)
    ? (typeRaw as ServiceRequestType)
    : 'otro';

  if (!name || name.length > 100) {
    return {ok: false, error: 'Escribe tu nombre.'};
  }
  if (!contact || contact.length > 150) {
    return {ok: false, error: 'Escribe un email o teléfono de contacto.'};
  }
  if (!message || message.length > 1000) {
    return {ok: false, error: 'Cuéntanos brevemente qué necesitas.'};
  }

  try {
    await createServiceRequest(context.env, {name, contact, type, message});
  } catch (error) {
    console.error('[service-request]', error);
    return {
      ok: false,
      error: 'No se pudo enviar la solicitud ahora mismo. Escríbenos por WhatsApp o llama al 972 364 114.',
    };
  }

  // El email es "mejor esfuerzo": la solicitud ya ha quedado guardada
  // aunque RESEND_API_KEY no esté configurado o el envío falle.
  try {
    await sendServiceRequestEmail(context.env, {name, contact, type, message});
  } catch (error) {
    console.error('[service-request] email', error);
  }

  return {ok: true};
}
