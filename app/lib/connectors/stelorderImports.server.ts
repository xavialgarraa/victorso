import {getDoc, listDocs, setDoc} from '~/lib/firestore.server';

/**
 * Registro de qué productos de StelOrder ya se crearon en Shopify (1 doc
 * por id de producto de StelOrder, colección "stelorder_imports"). Crear
 * ~900 productos de golpe se pasaría del límite de tiempo/subpeticiones de
 * un solo request en Oxygen, así que la creación se hace por lotes desde
 * el panel — este registro es lo que permite que cada lote sepa qué falta
 * por crear, sin repetir productos ya importados.
 */

const COLLECTION = 'stelorder_imports';

export type StelOrderImportDoc = {
  shopifyProductId: string;
  barcode: string;
  importedAt: string;
};

export async function getImportedStelOrderIds(env: Env): Promise<Set<number>> {
  const docs = await listDocs<StelOrderImportDoc>(env, COLLECTION);
  return new Set(docs.map((d) => Number(d.id)));
}

export async function getStelOrderImport(env: Env, stelOrderId: number): Promise<StelOrderImportDoc | null> {
  return getDoc<StelOrderImportDoc>(env, COLLECTION, String(stelOrderId));
}

export async function markStelOrderImported(
  env: Env,
  stelOrderId: number,
  shopifyProductId: string,
  barcode: string,
): Promise<void> {
  await setDoc(env, COLLECTION, String(stelOrderId), {
    shopifyProductId,
    barcode,
    importedAt: new Date().toISOString(),
  } satisfies StelOrderImportDoc);
}
