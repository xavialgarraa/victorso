import {fetchAllStelOrderProducts, type StelOrderProduct} from '~/lib/connectors/stelorder.server';
import {getShopifyCatalogBySku, type CatalogVariant} from '~/lib/shopifyProducts.server';
import {
  MIN_VALID_PRICE,
  SUSPICIOUS_PRICE_RATIO_HIGH,
  SUSPICIOUS_PRICE_RATIO_LOW,
  type SyncRunDetails,
} from '~/lib/connectors/sync.server';

/**
 * Cruce por SKU para los productos migrados desde LiveCommerce (el Excel
 * de 491 productos) — un flujo distinto al de creación vía "web" + EAN.
 * Aquí el producto YA existe en Shopify (se sube una vez por CSV nativo de
 * Shopify) y lo único que hace este conector es mantenerle el stock al
 * día cruzando por SKU = `full-reference` de StelOrder — el mismo campo
 * que ya usa el webhook de inventory_levels/update para el espejo
 * contrario, así las dos direcciones usan la misma clave.
 *
 * Nunca crea productos ni aplica precio solo — ver stelorderSync.server.ts
 * para la creación de productos nuevos (eso sigue siendo por EAN + "web").
 */

function normKey(s: string): string {
  return s.trim().toUpperCase();
}

export type SkuMatchedRow = {
  status: 'matched';
  sku: string;
  title: string;
  productId: string;
  variantId: string;
  inventoryItemId: string;
  shopifyStock: number;
  shopifyPrice: number;
  stelorderId: number;
  stelorderStock: number;
  stelorderPrice: number;
  stockChange: {from: number; to: number} | null;
  priceChange: {from: number; to: number} | null;
  priceWarning?: string;
};

export type SkuUnmatchedRow = {status: 'unmatched'; sku: string; title: string};
export type SkuAmbiguousRow = {status: 'ambiguous'; sku: string; title: string; count: number};
export type SkuSyncRow = SkuMatchedRow | SkuUnmatchedRow | SkuAmbiguousRow;

export type SkuSyncSummary = {
  totalShopifySkus: number;
  matchedCount: number;
  unmatchedCount: number;
  ambiguousCount: number;
  stockChangedCount: number;
  pendingPriceChanges: number;
  rows: SkuSyncRow[];
};

export async function buildStelOrderSkuSyncSummary(env: Env): Promise<SkuSyncSummary> {
  if (!env.STELORDER_API_KEY) throw new Error('Falta STELORDER_API_KEY en las variables de entorno.');

  const [shopifyBySku, stelorderProducts] = await Promise.all([
    getShopifyCatalogBySku(env),
    fetchAllStelOrderProducts(env.STELORDER_API_KEY),
  ]);

  const byFullReference = new Map<string, StelOrderProduct[]>();
  for (const p of stelorderProducts) {
    const key = normKey(p.fullReference || '');
    if (!key) continue;
    const list = byFullReference.get(key) ?? [];
    list.push(p);
    byFullReference.set(key, list);
  }

  const rows: SkuSyncRow[] = [];
  let matchedCount = 0;
  let unmatchedCount = 0;
  let ambiguousCount = 0;
  let stockChangedCount = 0;
  let pendingPriceChanges = 0;

  for (const variant of shopifyBySku.values()) {
    const key = normKey(variant.sku);
    const list = byFullReference.get(key);

    if (!list) {
      unmatchedCount++;
      rows.push({status: 'unmatched', sku: variant.sku, title: variant.title});
      continue;
    }
    if (list.length > 1) {
      ambiguousCount++;
      rows.push({status: 'ambiguous', sku: variant.sku, title: variant.title, count: list.length});
      continue;
    }

    const stel = list[0];
    matchedCount++;

    const stockChange =
      variant.inventoryQuantity !== stel.realStock
        ? {from: variant.inventoryQuantity, to: stel.realStock}
        : null;
    if (stockChange) stockChangedCount++;

    // StelOrder guarda el precio SIN IVA — siempre comparar/proponer
    // salesPriceWithTax (con IVA), nunca salesPrice a secas.
    let priceChange: {from: number; to: number} | null = null;
    let priceWarning: string | undefined;
    if (Math.abs(variant.price - stel.salesPriceWithTax) > 0.005) {
      if (stel.salesPriceWithTax < MIN_VALID_PRICE) {
        priceWarning = `StelOrder manda un precio inválido (${stel.salesPriceWithTax}€ con IVA) — se ignora.`;
      } else {
        const ratio = stel.salesPriceWithTax / variant.price;
        if (ratio < SUSPICIOUS_PRICE_RATIO_LOW || ratio > SUSPICIOUS_PRICE_RATIO_HIGH) {
          priceWarning = `Salto de precio inusual (${variant.price.toFixed(2)}€ → ${stel.salesPriceWithTax.toFixed(2)}€ con IVA) — revísalo antes de confirmar.`;
        }
        priceChange = {from: variant.price, to: stel.salesPriceWithTax};
        pendingPriceChanges++;
      }
    }

    rows.push({
      status: 'matched',
      sku: variant.sku,
      title: variant.title,
      productId: variant.productId,
      variantId: variant.variantId,
      inventoryItemId: variant.inventoryItemId,
      shopifyStock: variant.inventoryQuantity,
      shopifyPrice: variant.price,
      stelorderId: stel.id,
      stelorderStock: stel.realStock,
      stelorderPrice: stel.salesPriceWithTax,
      stockChange,
      priceChange,
      priceWarning,
    });
  }

  return {
    totalShopifySkus: shopifyBySku.size,
    matchedCount,
    unmatchedCount,
    ambiguousCount,
    stockChangedCount,
    pendingPriceChanges,
    rows,
  };
}

/** Aplana el resumen al mismo formato que usa el historial para Walkasse/
 * StelOrder por EAN (ver summaryToRunDetails en sync.server.ts), para que
 * el desglose fila a fila también se guarde y se pueda ver después. No hay
 * EAN en este flujo (el cruce es por SKU) — se reutiliza ese campo para el
 * SKU, es lo que la tabla del historial usa como clave y texto. */
export function skuSyncSummaryToRunDetails(summary: SkuSyncSummary): SyncRunDetails {
  const details: SyncRunDetails = {changed: [], unchanged: [], unmatched: [], priceWarnings: [], orphaned: []};

  for (const row of summary.rows) {
    if (row.status === 'unmatched') {
      details.unmatched.push({ean: row.sku, referencia: row.title});
      continue;
    }
    if (row.status === 'ambiguous') {
      details.unmatched.push({ean: row.sku, referencia: `${row.title} (${row.count} coincidencias ambiguas)`});
      continue;
    }

    if (row.priceWarning) {
      details.priceWarnings.push({ean: row.sku, title: row.title, message: row.priceWarning});
    }

    if (row.stockChange || row.priceChange) {
      details.changed.push({
        ean: row.sku,
        title: row.title,
        sku: row.sku,
        supplierRef: String(row.stelorderId),
        stockFrom: row.stockChange?.from ?? null,
        stockTo: row.stockChange?.to ?? null,
        priceFrom: row.priceChange?.from ?? null,
        priceTo: row.priceChange?.to ?? null,
        priceWarning: row.priceWarning,
      });
    } else {
      details.unchanged.push({ean: row.sku, title: row.title, sku: row.sku});
    }
  }

  return details;
}
