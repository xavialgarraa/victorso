import {addDoc, deleteDoc, listDocs, setDoc} from '~/lib/firestore.server';

/**
 * Preguntas frecuentes mostradas al final de la home (y con datos
 * estructurados FAQPage para SEO — Google puede sacarlas directamente en
 * el resultado de búsqueda). Gestionables desde /admin-interno/faq.
 */
export type FaqItem = {
  order: number;
  question: string;
  answer: string;
};

const COLLECTION = 'faq';

export async function listFaqItems(env: Env): Promise<Array<{id: string; item: FaqItem}>> {
  const docs = await listDocs<FaqItem>(env, COLLECTION);
  return docs.map((d) => ({id: d.id, item: d.data})).sort((a, b) => a.item.order - b.item.order);
}

export async function createFaqItem(env: Env, item: FaqItem): Promise<string> {
  return addDoc(env, COLLECTION, item);
}

export async function updateFaqItem(env: Env, id: string, item: FaqItem): Promise<void> {
  await setDoc(env, COLLECTION, id, item);
}

export async function deleteFaqItem(env: Env, id: string): Promise<void> {
  await deleteDoc(env, COLLECTION, id);
}
