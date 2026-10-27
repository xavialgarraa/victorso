import {deleteDoc, getDoc, listDocs, setDoc} from '~/lib/firestore.server';

/**
 * Carátula elegida a mano para una categoría (colección), desde el panel
 * interno. El documento se guarda con id = handle de la colección. Si no
 * hay override, la home usa una foto aleatoria de un producto de esa
 * categoría — nunca la imagen nativa de la colección en Shopify Admin,
 * para que todo se gestione desde este panel.
 */
const COLLECTION = 'categoryCovers';

export type CategoryCoverOverride = {imageUrl: string};

export async function getCategoryCover(env: Env, handle: string): Promise<string | null> {
  const doc = await getDoc<CategoryCoverOverride>(env, COLLECTION, handle);
  return doc?.imageUrl ?? null;
}

export async function listCategoryCovers(env: Env): Promise<Record<string, string>> {
  const docs = await listDocs<CategoryCoverOverride>(env, COLLECTION);
  const map: Record<string, string> = {};
  for (const d of docs) map[d.id] = d.data.imageUrl;
  return map;
}

export async function setCategoryCover(env: Env, handle: string, imageUrl: string): Promise<void> {
  await setDoc(env, COLLECTION, handle, {imageUrl});
}

export async function clearCategoryCover(env: Env, handle: string): Promise<void> {
  await deleteDoc(env, COLLECTION, handle);
}
