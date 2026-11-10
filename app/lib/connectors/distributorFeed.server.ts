import {getDoc, listDocs, setDoc} from '~/lib/firestore.server';
import {fetchWalkasseFeed, type WalkasseProduct} from '~/lib/connectors/walkasse.server';
import {getSupplier, resolveFeedUrl} from '~/lib/connectors/suppliers.server';

/**
 * Catálogo normalizado de un distribuidor que solo habla FTP (Zentralmedia,
 * Midwich...). Como Oxygen no puede hablar FTP (ver sync.server.ts), un
 * script externo (GitHub Action, fuera de este runtime) descarga y parsea
 * el feed de cada uno y lo deja aquí, en Firestore — el panel solo lee.
 */
export type DistributorProduct = {
  supplierId: string;
  ean: string;
  sku: string;
  title: string;
  brand: string;
  category: string;
  description: string;
  imageUrl: string;
  price: number;
  stock: number;
};

const CHUNK_COLLECTION = 'distributor_feed_chunks';
const META_COLLECTION = 'distributor_feed_meta';
const SELECTION_COLLECTION = 'distributor_selection';

export type DistributorFeedMeta = {
  supplierId: string;
  updatedAt: string;
  totalCount: number;
  chunkCount: number;
};

/** Solo lectura, usada por el panel. El script externo escribe estos
 * documentos directamente contra la REST API de Firestore (ver
 * scripts/supplier-feeds/README.md) — no reutiliza este fichero porque
 * corre en Node normal, no en el runtime de Oxygen. */
export async function getDistributorFeedMeta(env: Env, supplierId: string): Promise<DistributorFeedMeta | null> {
  return getDoc<DistributorFeedMeta>(env, META_COLLECTION, supplierId);
}

export async function listDistributorProducts(env: Env, supplierId: string): Promise<DistributorProduct[]> {
  const chunks = await listDocs<{supplierId: string; chunkIndex: number; items: DistributorProduct[]}>(
    env,
    CHUNK_COLLECTION,
  );
  return chunks
    .filter((c) => c.data.supplierId === supplierId)
    .sort((a, b) => a.data.chunkIndex - b.data.chunkIndex)
    .flatMap((c) => c.data.items ?? []);
}

function walkasseToDistributorProduct(p: WalkasseProduct): DistributorProduct {
  return {
    supplierId: 'walkasse',
    ean: p.ean,
    sku: p.articulo,
    title: p.denominacion,
    brand: p.marca,
    category: '',
    description: p.descripcion,
    imageUrl: p.imagenUrl,
    price: p.precioVenta,
    stock: p.stock,
  };
}

// A diferencia de Zentralmedia/Midwich (solo FTP, necesitan el script
// externo + Firestore de por medio), Walkasse ya habla HTTP — Oxygen puede
// leer su feed directamente en cada carga, sin caché en Firestore.
export const LIVE_SUPPLIER_IDS = new Set(['walkasse']);

/** Punto único de entrada para el panel: decide solo si el catálogo de un
 * proveedor se lee en vivo (HTTP) o desde la caché de Firestore (FTP). */
export async function getDistributorProducts(env: Env, supplierId: string): Promise<DistributorProduct[]> {
  if (LIVE_SUPPLIER_IDS.has(supplierId)) {
    const config = await getSupplier(env, supplierId);
    if (!config) return [];
    const products = await fetchWalkasseFeed(resolveFeedUrl(config));
    return products.map(walkasseToDistributorProduct);
  }
  return listDistributorProducts(env, supplierId);
}

export type SelectionConfig = {
  supplierId: string;
  selectedEans: string[];
  updatedAt: string;
  updatedBy: string;
};

export async function getSelection(env: Env, supplierId: string): Promise<SelectionConfig | null> {
  return getDoc<SelectionConfig>(env, SELECTION_COLLECTION, supplierId);
}

export async function saveSelection(
  env: Env,
  supplierId: string,
  selectedEans: string[],
  updatedBy: string,
): Promise<void> {
  await setDoc(env, SELECTION_COLLECTION, supplierId, {
    supplierId,
    selectedEans,
    updatedAt: new Date().toISOString(),
    updatedBy,
  });
}

