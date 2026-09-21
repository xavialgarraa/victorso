import {addDoc, deleteDoc, getDoc, listDocs, setDoc} from '~/lib/firestore.server';
import type {SyncRunDetails} from '~/lib/connectors/sync.server';

/**
 * Config de cada proveedor ("conector"), guardada en Firestore para poder
 * editarla desde el panel sin re-desplegar. El id del documento es el slug
 * del proveedor (ej. "walkasse").
 */
export type SupplierConfig = {
  name: string;
  sourceType: 'url' | 'excel_upload';
  // Para sourceType "url": la URL del feed, con {usuario} y {clave} como
  // placeholders si el proveedor los pide por query string (como Walkasse).
  feedUrl?: string;
  feedUser?: string;
  feedPassword?: string;
  active: boolean;
};

const COLLECTION = 'suppliers';

export async function listSuppliers(env: Env): Promise<Array<{id: string; config: SupplierConfig}>> {
  const docs = await listDocs<SupplierConfig>(env, COLLECTION);
  return docs.map((d) => ({id: d.id, config: d.data}));
}

export async function getSupplier(env: Env, id: string): Promise<SupplierConfig | null> {
  return getDoc<SupplierConfig>(env, COLLECTION, id);
}

export async function saveSupplier(env: Env, id: string, config: SupplierConfig): Promise<void> {
  await setDoc(env, COLLECTION, id, config);
}

export async function deleteSupplier(env: Env, id: string): Promise<void> {
  await deleteDoc(env, COLLECTION, id);
}

/** Sustituye los placeholders {usuario}/{clave} en la plantilla de URL. */
export function resolveFeedUrl(config: SupplierConfig): string {
  if (!config.feedUrl) throw new Error('Este proveedor no tiene URL de feed configurada.');
  return config.feedUrl
    .replace('{usuario}', encodeURIComponent(config.feedUser ?? ''))
    .replace('{clave}', encodeURIComponent(config.feedPassword ?? ''));
}

// --- Histórico de sincronizaciones ---

export type SyncRunLog = {
  supplierId: string;
  supplierName: string;
  // 'auto-apply' = disparado por el cron externo: solo toca stock, el
  // precio se deja siempre pendiente de revisión manual.
  type: 'dry-run' | 'apply' | 'auto-apply';
  triggeredBy: string;
  startedAt: string;
  finishedAt: string;
  totalFeedRows: number;
  matchedCount: number;
  changedCount: number;
  unmatchedCount: number;
  stockApplied?: number;
  priceApplied?: number;
  pendingPriceChanges?: number;
  errors: string[];
  // Desglose completo (qué cambió, qué no, qué no encontró match), para
  // poder analizarlo después en el historial sin repetir la comparación.
  // Opcional porque las ejecuciones de antes de añadir esto no lo tienen.
  details?: SyncRunDetails;
};

export async function logSyncRun(env: Env, run: SyncRunLog): Promise<void> {
  await addDoc(env, 'sync_runs', run);
}

export async function listRecentSyncRuns(env: Env, limit = 10): Promise<Array<{id: string; run: SyncRunLog}>> {
  const docs = await listDocs<SyncRunLog>(env, 'sync_runs');
  return docs
    .map((d) => ({id: d.id, run: d.data}))
    .sort((a, b) => (a.run.finishedAt < b.run.finishedAt ? 1 : -1))
    .slice(0, limit);
}
