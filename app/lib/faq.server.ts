import {addDoc, deleteDoc, listDocs, setDoc} from '~/lib/firestore.server';
import {translateFaqItem} from '~/lib/translateFaq.server';
import type {LocaleCode} from '~/lib/locales';

/**
 * Preguntas frecuentes mostradas al final de la home (y con datos
 * estructurados FAQPage para SEO — Google puede sacarlas directamente en
 * el resultado de búsqueda). Gestionables desde /admin-interno/faq.
 *
 * El admin solo escribe en español (question/answer); al guardar se
 * traduce automáticamente a en/fr/pt/ca vía Claude y se guarda en
 * `translations`. Si la traducción falla, esos idiomas muestran el
 * español de fallback (ver resolveFaqItem) hasta que se reintente.
 */
export type FaqItem = {
  order: number;
  question: string;
  answer: string;
  translations?: Partial<Record<Exclude<LocaleCode, 'es'>, {question: string; answer: string}>>;
};

const COLLECTION = 'faq';

/** Resuelve un FaqItem al idioma pedido, con fallback a español. */
function resolveFaqItem(item: FaqItem, locale: LocaleCode): {question: string; answer: string} {
  if (locale === 'es') return {question: item.question, answer: item.answer};
  const translated = item.translations?.[locale];
  return translated || {question: item.question, answer: item.answer};
}

export async function listFaqItems(
  env: Env,
  locale: LocaleCode = 'es',
): Promise<Array<{id: string; item: FaqItem & {question: string; answer: string}}>> {
  const docs = await listDocs<FaqItem>(env, COLLECTION);
  return docs
    .map((d) => ({id: d.id, item: {...d.data, ...resolveFaqItem(d.data, locale)}}))
    .sort((a, b) => a.item.order - b.item.order);
}

export async function createFaqItem(env: Env, item: FaqItem): Promise<string> {
  const translations = await translateFaqItem(env, {question: item.question, answer: item.answer});
  return addDoc(env, COLLECTION, {...item, translations: translations || undefined});
}

export async function updateFaqItem(env: Env, id: string, item: FaqItem): Promise<void> {
  const translations = await translateFaqItem(env, {question: item.question, answer: item.answer});
  await setDoc(env, COLLECTION, id, {...item, translations: translations || undefined});
}

export async function deleteFaqItem(env: Env, id: string): Promise<void> {
  await deleteDoc(env, COLLECTION, id);
}
