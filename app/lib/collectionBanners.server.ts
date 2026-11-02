import {deleteDoc, getDoc, listDocs, setDoc} from '~/lib/firestore.server';
import {translateCollectionBanner} from '~/lib/translateCollectionBanner.server';
import type {LocaleCode} from '~/lib/locales';

/**
 * Banner editorial opcional para la cabecera de una colección (marca o
 * campaña), configurable desde /admin-interno/colecciones. Un documento
 * por handle de colección — si no existe, la colección se muestra sin
 * banner (comportamiento de siempre).
 *
 * El admin solo escribe en español (title/lede/features); al guardar se
 * traduce automáticamente a en/fr/pt/ca vía Claude, igual que las FAQs
 * (ver faq.server.ts / translateFaq.server.ts).
 */
export type CollectionBannerFeature = {
  icon: 'shield' | 'wrench' | 'truck' | 'check' | 'globe' | 'star';
  title: string;
  text: string;
};

export type CollectionBanner = {
  active: boolean;
  logos: string[];
  backgroundImage?: string;
  title: string;
  lede: string;
  features: CollectionBannerFeature[];
  translations?: Partial<
    Record<Exclude<LocaleCode, 'es'>, {title: string; lede: string; features: Array<{title: string; text: string}>}>
  >;
};

const COLLECTION = 'collection_banners';

function resolveCollectionBanner(
  banner: CollectionBanner,
  locale: LocaleCode,
): {title: string; lede: string; features: CollectionBannerFeature[]} {
  if (locale === 'es') return {title: banner.title, lede: banner.lede, features: banner.features};
  const translated = banner.translations?.[locale];
  if (!translated) return {title: banner.title, lede: banner.lede, features: banner.features};
  return {
    title: translated.title,
    lede: translated.lede,
    features: banner.features.map((f, i) => ({...f, title: translated.features[i]?.title ?? f.title, text: translated.features[i]?.text ?? f.text})),
  };
}

/** Banner de una colección concreta, ya resuelto al idioma pedido.
 * Devuelve null si no hay banner configurado o está desactivado. */
export async function getCollectionBanner(
  env: Env,
  handle: string,
  locale: LocaleCode = 'es',
): Promise<
  {title: string; lede: string; features: CollectionBannerFeature[]; logos: string[]; backgroundImage?: string} | null
> {
  const doc = await getDoc<CollectionBanner>(env, COLLECTION, handle);
  if (!doc || !doc.active) return null;
  return {...resolveCollectionBanner(doc, locale), logos: doc.logos, backgroundImage: doc.backgroundImage};
}

/** Todos los banners configurados (admin), indexados por handle de colección. */
export async function listCollectionBanners(env: Env): Promise<Record<string, CollectionBanner>> {
  const docs = await listDocs<CollectionBanner>(env, COLLECTION);
  return Object.fromEntries(docs.map((d) => [d.id, d.data]));
}

export async function upsertCollectionBanner(
  env: Env,
  handle: string,
  banner: Omit<CollectionBanner, 'translations'>,
): Promise<void> {
  const translations = await translateCollectionBanner(env, {
    title: banner.title,
    lede: banner.lede,
    features: banner.features,
  });
  await setDoc(env, COLLECTION, handle, {...banner, translations: translations || undefined});
}

export async function deleteCollectionBanner(env: Env, handle: string): Promise<void> {
  await deleteDoc(env, COLLECTION, handle);
}
