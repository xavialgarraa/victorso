import {addDoc, deleteDoc, listDocs, setDoc} from '~/lib/firestore.server';

/**
 * Instalaciones realizadas, mostradas en /instalaciones. Antes era un
 * array fijo en el propio route; ahora vive en Firestore y se gestiona
 * desde /admin-interno/instalaciones.
 */
export type Installation = {
  order: number;
  title: string;
  location: string;
  imageUrl: string;
  description: string;
};

const COLLECTION = 'installations';

export async function listInstallations(env: Env): Promise<Array<{id: string; installation: Installation}>> {
  const docs = await listDocs<Installation>(env, COLLECTION);
  return docs
    .map((d) => ({id: d.id, installation: d.data}))
    .sort((a, b) => a.installation.order - b.installation.order);
}

export async function createInstallation(env: Env, installation: Installation): Promise<string> {
  return addDoc(env, COLLECTION, installation);
}

export async function updateInstallation(env: Env, id: string, installation: Installation): Promise<void> {
  await setDoc(env, COLLECTION, id, installation);
}

export async function deleteInstallation(env: Env, id: string): Promise<void> {
  await deleteDoc(env, COLLECTION, id);
}
