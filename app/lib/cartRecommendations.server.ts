import {deleteDoc, getDoc, listDocs, setDoc} from '~/lib/firestore.server';

/**
 * Recomendaciones manuales para el carrito: "si hay X en el carrito,
 * sugiere también estos otros productos" (ej. un controlador -> cables
 * específicos). El documento se guarda con id = handle del producto
 * origen, así la consulta por producto es directa (getDoc) sin escanear
 * toda la colección. Si no hay override para un producto, se recurre a
 * las recomendaciones automáticas de Shopify (productRecommendations).
 */
const COLLECTION = 'cartRecommendations';

export type CartRecommendationOverride = {recommendedHandles: string[]};

export async function getManualRecommendation(env: Env, sourceHandle: string): Promise<string[]> {
  const doc = await getDoc<CartRecommendationOverride>(env, COLLECTION, sourceHandle);
  return doc?.recommendedHandles ?? [];
}

export async function listCartRecommendationOverrides(
  env: Env,
): Promise<Array<{handle: string; recommendedHandles: string[]}>> {
  const docs = await listDocs<CartRecommendationOverride>(env, COLLECTION);
  return docs.map((d) => ({handle: d.id, recommendedHandles: d.data.recommendedHandles}));
}

export async function setCartRecommendationOverride(
  env: Env,
  sourceHandle: string,
  recommendedHandles: string[],
): Promise<void> {
  await setDoc(env, COLLECTION, sourceHandle, {recommendedHandles});
}

export async function deleteCartRecommendationOverride(env: Env, sourceHandle: string): Promise<void> {
  await deleteDoc(env, COLLECTION, sourceHandle);
}
