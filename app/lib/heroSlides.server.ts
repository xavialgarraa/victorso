import {addDoc, deleteDoc, getDoc, listDocs, setDoc} from '~/lib/firestore.server';

/**
 * Slides manuales del hero de la home, configurables desde
 * /admin-interno/hero. El panel izquierdo y el derecho se gestionan por
 * separado ("position"); dentro de cada uno, "order" decide el orden del
 * carrusel (menor primero).
 */
export type HeroSlide = {
  position: 'left' | 'right';
  order: number;
  imageUrl: string;
  href: string;
  external: boolean;
  badge: string;
  badgeClass: 'storehero__badge--new' | 'storehero__badge--offer' | 'storehero__badge--brand';
  eyebrow: string;
  title: string;
  cta: string;
  ctaClass: 'btn--outline' | 'btn--primary';
};

const COLLECTION = 'hero_slides';

export async function listHeroSlides(env: Env): Promise<Array<{id: string; slide: HeroSlide}>> {
  const docs = await listDocs<HeroSlide>(env, COLLECTION);
  return docs
    .map((d) => ({id: d.id, slide: d.data}))
    .sort((a, b) => a.slide.order - b.slide.order);
}

export async function createHeroSlide(env: Env, slide: HeroSlide): Promise<string> {
  return addDoc(env, COLLECTION, slide);
}

export async function updateHeroSlide(env: Env, id: string, slide: HeroSlide): Promise<void> {
  await setDoc(env, COLLECTION, id, slide);
}

export async function deleteHeroSlide(env: Env, id: string): Promise<void> {
  await deleteDoc(env, COLLECTION, id);
}

/** Si no hay slides manuales para un lado (o el admin lo prefiere así), el
 * hero sigue rellenando ese hueco con producto novedad/más vendido —
 * ver _index.tsx. Esto decide, por lado, si ese relleno automático está
 * permitido. */
export type HeroSettings = {leftAutoFallback: boolean; rightAutoFallback: boolean};

const SETTINGS_COLLECTION = 'hero_settings';
const SETTINGS_ID = 'config';

export async function getHeroSettings(env: Env): Promise<HeroSettings> {
  const doc = await getDoc<HeroSettings>(env, SETTINGS_COLLECTION, SETTINGS_ID);
  return doc ?? {leftAutoFallback: true, rightAutoFallback: true};
}

export async function setHeroSettings(env: Env, settings: HeroSettings): Promise<void> {
  await setDoc(env, SETTINGS_COLLECTION, SETTINGS_ID, settings);
}
