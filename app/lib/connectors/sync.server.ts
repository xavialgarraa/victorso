import type {CatalogVariant} from '~/lib/shopifyProducts.server';
import type {WalkasseProduct} from '~/lib/connectors/walkasse.server';

/**
 * Formato normalizado que espera la lógica de cruce, para que cualquier
 * proveedor (Walkasse u otro más adelante) pueda usarla igual.
 */
export type SupplierRow = {
  ean: string;
  stock: number;
  precioVenta: number;
  referencia: string; // código/nombre del proveedor, solo para mostrar en el resumen
};

export type SyncChange = {
  stock?: {from: number; to: number};
  price?: {from: number; to: number};
};

export type MatchedRow = {
  status: 'matched';
  ean: string;
  title: string;
  sku: string;
  supplierRef: string;
  productId: string;
  variantId: string;
  inventoryItemId: string;
  changes: SyncChange;
  // Si el proveedor manda un precio que no tiene pinta de ser real (0,
  // negativo, o un salto enorme respecto al actual), se avisa aquí en vez
  // de proponerlo como cambio a aplicar — un precio a 0€ escrito sin
  // querer en la tienda real es el peor caso posible de este conector.
  priceWarning?: string;
};

export type UnmatchedRow = {
  status: 'unmatched';
  ean: string;
  referencia: string;
};

export type SyncRow = MatchedRow | UnmatchedRow;

export type SyncSummary = {
  totalFeedRows: number;
  matchedCount: number;
  changedCount: number;
  unchangedCount: number;
  unmatchedCount: number;
  suspiciousPriceCount: number;
  rows: SyncRow[];
};

const MIN_VALID_PRICE = 0.01;
// Si el precio nuevo es menos de un tercio o más del triple del actual,
// es más probable que sea un dato corrupto del feed que una bajada/subida
// real — se avisa en vez de proponerlo como cambio automático.
const SUSPICIOUS_PRICE_RATIO_LOW = 1 / 3;
const SUSPICIOUS_PRICE_RATIO_HIGH = 3;

export function walkasseToSupplierRows(products: WalkasseProduct[]): SupplierRow[] {
  return products.map((p) => ({
    ean: p.ean,
    stock: p.stock,
    precioVenta: p.precioVenta,
    referencia: p.articulo || p.denominacion,
  }));
}

/**
 * Compara las filas del proveedor contra el catálogo (siempre por EAN,
 * contra TODO el catálogo, nunca filtrando antes por marca). No escribe
 * nada en Shopify — solo calcula qué cambiaría, para el resumen previo a
 * confirmar.
 */
export function buildSyncSummary(
  supplierRows: SupplierRow[],
  catalog: Map<string, CatalogVariant>,
): SyncSummary {
  const rows: SyncRow[] = [];
  let matchedCount = 0;
  let changedCount = 0;
  let unchangedCount = 0;
  let unmatchedCount = 0;
  let suspiciousPriceCount = 0;

  for (const row of supplierRows) {
    const variant = catalog.get(row.ean);
    if (!variant) {
      unmatchedCount++;
      rows.push({status: 'unmatched', ean: row.ean, referencia: row.referencia});
      continue;
    }

    matchedCount++;
    const changes: SyncChange = {};
    let priceWarning: string | undefined;

    if (variant.inventoryQuantity !== row.stock) {
      changes.stock = {from: variant.inventoryQuantity, to: row.stock};
    }

    // Los precios pueden venir con redondeos distintos; 1 céntimo de
    // margen evita marcar cambios por ruido de coma flotante.
    if (Math.abs(variant.price - row.precioVenta) > 0.005) {
      if (row.precioVenta < MIN_VALID_PRICE) {
        // Nunca se propone como cambio a aplicar — un precio a 0€/negativo
        // casi seguro es un dato corrupto del feed, no un precio real.
        priceWarning = `El proveedor manda un precio inválido (${row.precioVenta}€) — se ignora, no se propone cambiarlo.`;
        suspiciousPriceCount++;
      } else {
        const ratio = row.precioVenta / variant.price;
        if (ratio < SUSPICIOUS_PRICE_RATIO_LOW || ratio > SUSPICIOUS_PRICE_RATIO_HIGH) {
          priceWarning = `Salto de precio inusual (${variant.price.toFixed(2)}€ → ${row.precioVenta.toFixed(2)}€) — revísalo antes de confirmar.`;
          suspiciousPriceCount++;
        }
        changes.price = {from: variant.price, to: row.precioVenta};
      }
    }

    if (changes.stock || changes.price) changedCount++;
    else unchangedCount++;

    rows.push({
      status: 'matched',
      ean: row.ean,
      title: variant.title,
      sku: variant.sku,
      supplierRef: row.referencia,
      productId: variant.productId,
      variantId: variant.variantId,
      inventoryItemId: variant.inventoryItemId,
      changes,
      priceWarning,
    });
  }

  return {
    totalFeedRows: supplierRows.length,
    matchedCount,
    changedCount,
    unchangedCount,
    unmatchedCount,
    suspiciousPriceCount,
    rows,
  };
}

export type SyncRunDetails = {
  changed: Array<{
    ean: string;
    title: string;
    sku: string;
    supplierRef: string;
    stockFrom: number | null;
    stockTo: number | null;
    priceFrom: number | null;
    priceTo: number | null;
    priceWarning?: string;
  }>;
  unchanged: Array<{ean: string; title: string; sku: string}>;
  unmatched: Array<{ean: string; referencia: string}>;
  // Avisos de precio (inválido o salto raro) — separados de "changed"
  // porque un precio inválido NO se propone como cambio, pero sigue
  // mereciendo que alguien lo revise a mano en el feed del proveedor.
  priceWarnings: Array<{ean: string; title: string; message: string}>;
};

/** Aplana el resumen a algo compacto para guardar en Firestore junto al
 * registro de la sincronización, y poder revisarlo luego en el historial
 * sin tener que repetir la comparación. */
export function summaryToRunDetails(summary: SyncSummary): SyncRunDetails {
  const details: SyncRunDetails = {changed: [], unchanged: [], unmatched: [], priceWarnings: []};

  for (const row of summary.rows) {
    if (row.status === 'unmatched') {
      details.unmatched.push({ean: row.ean, referencia: row.referencia});
      continue;
    }

    if (row.priceWarning) {
      details.priceWarnings.push({ean: row.ean, title: row.title, message: row.priceWarning});
    }

    if (row.changes.stock || row.changes.price) {
      details.changed.push({
        ean: row.ean,
        title: row.title,
        sku: row.sku,
        supplierRef: row.supplierRef,
        stockFrom: row.changes.stock?.from ?? null,
        stockTo: row.changes.stock?.to ?? null,
        priceFrom: row.changes.price?.from ?? null,
        priceTo: row.changes.price?.to ?? null,
        priceWarning: row.priceWarning,
      });
    } else {
      details.unchanged.push({ean: row.ean, title: row.title, sku: row.sku});
    }
  }

  return details;
}
