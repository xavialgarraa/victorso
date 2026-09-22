import {addDoc, deleteDoc, listDocs} from '~/lib/firestore.server';

const COLLECTION = 'service_requests';

export type ServiceRequestType = 'reparacion' | 'instalacion' | 'otro';

export type ServiceRequest = {
  name: string;
  contact: string;
  type: ServiceRequestType;
  message: string;
  createdAt: string;
};

/** Guarda la solicitud siempre en Firestore, para no perder el lead aunque
 * el envío del email falle o RESEND_API_KEY no esté configurado todavía. */
export async function createServiceRequest(
  env: Env,
  data: {name: string; contact: string; type: ServiceRequestType; message: string},
): Promise<void> {
  const request: ServiceRequest = {...data, createdAt: new Date().toISOString()};
  await addDoc(env, COLLECTION, request);
}

export async function listServiceRequests(
  env: Env,
): Promise<Array<{id: string; request: ServiceRequest}>> {
  const docs = await listDocs<ServiceRequest>(env, COLLECTION);
  return docs
    .map((d) => ({id: d.id, request: d.data}))
    .sort((a, b) => (a.request.createdAt < b.request.createdAt ? 1 : -1));
}

export async function deleteServiceRequest(env: Env, id: string): Promise<void> {
  await deleteDoc(env, COLLECTION, id);
}
