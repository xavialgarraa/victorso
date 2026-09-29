/**
 * Conector del ERP StelOrder. A diferencia de Walkasse (un feed CSV que
 * solo actualiza stock/precio de productos que YA existen en Shopify),
 * StelOrder es la fuente de productos que aún no están en la tienda: hay
 * que crearlos, no solo cruzarlos por EAN — ver stelorderSync.server.ts.
 *
 * Solo se sincroniza lo que Victor marca explícitamente a mano en
 * StelOrder: productos con la palabra "web" en su comentario privado
 * (private-comments). No hay heurística automática (stock, barcode...)
 * que decida esto por sí sola — ver isMarkedForWeb más abajo.
 */

const PAGE_SIZE = 500;

export type StelOrderProduct = {
  id: number;
  reference: string;
  fullReference: string;
  name: string;
  description: string | null;
  privateComments: string | null;
  barcode: string;
  salesPrice: number;
  realStock: number;
  categoryId: number | null;
  images: string[];
};

type RawStelOrderProduct = {
  id: number;
  reference: string;
  'full-reference': string;
  name: string;
  description: string | null;
  'private-comments': string | null;
  barcode: string | null;
  'sales-price': number;
  'real-stock': number;
  'product-category-id': number | null;
  'item-images'?: Array<{'item-image-path': string}>;
  inactive: boolean;
  deleted: boolean;
};

function normalize(raw: RawStelOrderProduct): StelOrderProduct {
  return {
    id: raw.id,
    reference: raw.reference,
    fullReference: raw['full-reference'],
    name: (raw.name || '').trim(),
    description: raw.description,
    privateComments: raw['private-comments'],
    barcode: (raw.barcode || '').trim(),
    salesPrice: raw['sales-price'] ?? 0,
    realStock: raw['real-stock'] ?? 0,
    categoryId: raw['product-category-id'] ?? null,
    images: (raw['item-images'] || []).map((img) => img['item-image-path']).filter(Boolean),
  };
}

/** Trae TODO el catálogo activo de StelOrder, paginando de 500 en 500. */
export async function fetchAllStelOrderProducts(apiKey: string): Promise<StelOrderProduct[]> {
  const all: StelOrderProduct[] = [];
  let start = 0;

  while (true) {
    const url = `https://app.stelorder.com/app/products?limit=${PAGE_SIZE}&start=${start}&inactive=false`;
    const response = await fetch(url, {headers: {APIKEY: apiKey}});
    if (!response.ok) {
      throw new Error(`StelOrder API error (${response.status}) en start=${start}.`);
    }
    const page = (await response.json()) as RawStelOrderProduct[];
    if (!Array.isArray(page) || page.length === 0) break;

    for (const raw of page) {
      if (raw.deleted) continue;
      all.push(normalize(raw));
    }

    if (page.length < PAGE_SIZE) break;
    start += PAGE_SIZE;
  }

  return all;
}

/** Filtro de "marcado para web": Victor escribe "web" en el comentario
 * privado del producto en StelOrder para decir "este sí quiero que se
 * venda en la tienda online". Sigue exigiendo código de barras (sin él no
 * hay forma fiable de cruzarlo/evitar duplicados en Shopify) — el stock ya
 * NO es requisito: si lo marca sin stock, se crea igual y sale "agotado"
 * hasta que le entre género, en vez de quedarse fuera silenciosamente. */
export function isMarkedForWeb(p: StelOrderProduct): boolean {
  if (p.barcode.length === 0) return false;
  if (!p.privateComments) return false;
  const plainText = p.privateComments.replace(/<[^>]+>/g, ' ');
  return /\bweb\b/i.test(plainText);
}

/**
 * Busca un producto de StelOrder por su `full-reference` (el valor que
 * usamos como SKU al crear el producto en Shopify — ver stelorderSync).
 * Se usa al vender algo en la web para saber si ese SKU viene de StelOrder
 * y, si es así, actualizarle el stock — ver setStelOrderStock.
 */
export async function findStelOrderProductByReference(
  apiKey: string,
  fullReference: string,
): Promise<StelOrderProduct | null> {
  const url = `https://app.stelorder.com/app/products?full-reference=${encodeURIComponent(fullReference)}&limit=1`;
  const response = await fetch(url, {headers: {APIKEY: apiKey}});
  if (!response.ok) throw new Error(`StelOrder API error (${response.status}) buscando referencia ${fullReference}.`);
  const page = (await response.json()) as RawStelOrderProduct[];
  if (!Array.isArray(page) || page.length === 0) return null;
  return normalize(page[0]);
}

/** Fija el stock real de un producto de StelOrder al valor exacto dado
 * (no es un ajuste relativo). Se usa para reflejar en StelOrder la
 * disponibilidad que Shopify acaba de reportar — ver
 * webhooks.inventory-levels-update.tsx. */
export async function setStelOrderStock(apiKey: string, stelOrderId: number, quantity: number): Promise<void> {
  const response = await fetch(`https://app.stelorder.com/app/products/${stelOrderId}`, {
    method: 'PUT',
    headers: {APIKEY: apiKey, 'Content-Type': 'application/json'},
    body: JSON.stringify({'real-stock': Math.max(0, quantity)}),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`StelOrder API error (${response.status}) actualizando stock de ${stelOrderId}: ${text}`);
  }
}

/** Las "categorías" propias de StelOrder están organizadas por MARCA
 * (ADAM HALL, PIONEER...) — se usan como `vendor` del producto en Shopify,
 * no como su categoría real (esa la decide la IA, ver stelorderCategories).
 */
export async function fetchStelOrderCategoryNames(apiKey: string): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  let start = 0;

  while (true) {
    const url = `https://app.stelorder.com/app/productCategories?limit=${PAGE_SIZE}&start=${start}`;
    const response = await fetch(url, {headers: {APIKEY: apiKey}});
    if (!response.ok) throw new Error(`StelOrder API error (${response.status}) leyendo categorías.`);
    const page = (await response.json()) as Array<{id: number; name: string}>;
    if (!Array.isArray(page) || page.length === 0) break;
    for (const cat of page) map.set(cat.id, cat.name);
    if (page.length < PAGE_SIZE) break;
    start += PAGE_SIZE;
  }

  return map;
}
