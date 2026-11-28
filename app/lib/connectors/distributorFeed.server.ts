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
const HISTORY_COLLECTION = 'distributor_sync_history';

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

/** Una ejecución del sync nocturno (ver scripts/supplier-feeds/sync-ftp-feeds.mjs),
 * con el diff contra el catálogo de la vez anterior — para el historial
 * del panel ("qué cambió cada día"). Si ese día falló (FTP caído,
 * formato distinto...) viene con ok:false y el mensaje de error, sin
 * las demás cifras. */
export type DistributorSyncHistoryEntry = {
  supplierId: string;
  ranAt: string;
  ok: boolean;
  error?: string;
  totalCount?: number;
  added?: number;
  removed?: number;
  priceChanged?: number;
  stockChanged?: number;
};

/** Las últimas ejecuciones de un proveedor, más recientes primero. El
 * script externo ya solo conserva como mucho ~60 (ver HISTORY_KEEP
 * ahí), así que traerlas todas y cortar aquí es simple y suficiente. */
export async function listDistributorSyncHistory(
  env: Env,
  supplierId: string,
  limit = 14,
): Promise<DistributorSyncHistoryEntry[]> {
  const docs = await listDocs<DistributorSyncHistoryEntry>(env, HISTORY_COLLECTION);
  return docs
    .map((d) => d.data)
    .filter((h) => h.supplierId === supplierId)
    .sort((a, b) => (a.ranAt < b.ranAt ? 1 : -1))
    .slice(0, limit);
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
// leer su feed directamente. Se cachea en Firestore un ratito corto en vez
// de descargarlo entero en cada carga: antes se pedía su CSV de verdad
// (fuera, por HTTP) cada vez que se entraba a CUALQUIER pestaña de
// /admin-interno/distribuidores, incluso sin tener Walkasse abierto — el
// resumen de arriba ("X marcados") de las tres pestañas lo necesita
// siempre — y eso añadía varios segundos de carga.
export const LIVE_SUPPLIER_IDS = new Set(['walkasse']);
const LIVE_FEED_CACHE_COLLECTION = 'distributor_live_feed_cache';
const LIVE_FEED_CACHE_TTL_MS = 3 * 60 * 1000;

type LiveFeedCacheDoc = {products: DistributorProduct[]; cachedAt: string};

/** Punto único de entrada para el panel: decide solo si el catálogo de un
 * proveedor se lee en vivo (HTTP, con caché corta) o desde la caché de
 * Firestore de siempre (FTP). */
export async function getDistributorProducts(env: Env, supplierId: string): Promise<DistributorProduct[]> {
  if (LIVE_SUPPLIER_IDS.has(supplierId)) {
    const cached = await getDoc<LiveFeedCacheDoc>(env, LIVE_FEED_CACHE_COLLECTION, supplierId);
    if (cached && Date.now() - new Date(cached.cachedAt).getTime() < LIVE_FEED_CACHE_TTL_MS) {
      return cached.products;
    }

    const config = await getSupplier(env, supplierId);
    if (!config) return [];
    const products = await fetchWalkasseFeed(resolveFeedUrl(config));
    const mapped = products.map(walkasseToDistributorProduct);

    // Igual que con el catálogo de Shopify: si el feed ha crecido tanto
    // que ya no cabe en un documento de Firestore, que falle en
    // silencio — la próxima carga simplemente lo vuelve a descargar.
    setDoc(env, LIVE_FEED_CACHE_COLLECTION, supplierId, {
      products: mapped,
      cachedAt: new Date().toISOString(),
    } satisfies LiveFeedCacheDoc).catch((error) => console.error('[distributorFeed] live feed cache write', error));

    return mapped;
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

