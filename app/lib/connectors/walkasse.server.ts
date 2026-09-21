/**
 * Conector del proveedor Walkasse: descarga su feed CSV y lo normaliza al
 * formato interno { ean, stock, coste, precioVenta, pesoGramos, imagenUrl,
 * descripcion }. El cruce con el catálogo de Shopify se hace siempre por
 * EAN (ver shopifyProducts.server.ts) — nunca por marca, porque Walkasse
 * distribuye productos de varias marcas (Walkasse, DJBAG.PRO, PALMIN...).
 */

export type WalkasseProduct = {
  articulo: string;
  ean: string;
  marca: string;
  denominacion: string;
  stock: number;
  coste: number;
  precioVenta: number;
  pesoGramos: number;
  imagenUrl: string;
  descripcion: string;
};

// Orden real de columnas del feed. Es fijo (no se lee de la cabecera) para
// no depender de que Walkasse escriba los nombres siempre igual.
const COLUMNS = [
  'ARTICULO',
  'IMAGEN',
  'PESO',
  'IVA',
  'PRECIOCANO',
  'TIPCANON',
  'COMPRA',
  'VENTA',
  'FAMILIA',
  'MARCA',
  'DENOMINA',
  'URL',
  'STOCK',
  'PARTNUMBER',
  'CODIGOBAR',
  'DESCEXTRTF',
  'AVAILABILITYDATE',
] as const;

const DESCEXTRTF_INDEX = COLUMNS.indexOf('DESCEXTRTF'); // 15
const LAST_INDEX = COLUMNS.length - 1; // AVAILABILITYDATE, 16

/**
 * Divide una línea del CSV por ";" sin tratar comillas como caracter
 * especial (Walkasse no las usa para escapar, y tratarlas como tal rompe
 * el parseo por el apóstrofo suelto que mete Excel delante de ARTICULO).
 * Si hay más columnas de las esperadas, se asume que el ";" de más está
 * dentro de DESCEXTRTF (el único campo de texto libre) y se reconstruye.
 */
function splitWalkasseLine(line: string): string[] | null {
  const fields = line.split(';');
  if (fields.length === COLUMNS.length) return fields;
  if (fields.length < COLUMNS.length) return null;

  const head = fields.slice(0, DESCEXTRTF_INDEX);
  const tail = fields[fields.length - 1];
  const middle = fields.slice(DESCEXTRTF_INDEX, fields.length - 1).join(';');
  return [...head, middle, tail];
}

const HTML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  '#39': "'",
  apos: "'",
  nbsp: ' ',
};

function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#\d+|[a-zA-Z]+);/g, (match, code: string) => {
    if (code[0] === '#') {
      const num = Number(code.slice(1));
      return Number.isFinite(num) ? String.fromCharCode(num) : match;
    }
    return HTML_ENTITIES[code] ?? match;
  });
}

const CUT_MARKERS = ['[R]', '[PC]', '[PD]', '[E]', 'Descargo de responsabilidad'];

/** Limpia DESCEXTRTF: corta los bloques de metadatos internos de Walkasse,
 * quita las etiquetas HTML y des-escapa entidades. */
export function cleanWalkasseDescription(raw: string): string {
  let cut = raw;
  for (const marker of CUT_MARKERS) {
    const idx = cut.indexOf(marker);
    if (idx !== -1) cut = cut.slice(0, idx);
  }
  const withoutTags = decodeHtmlEntities(cut.replace(/<[^>]+>/g, ' '));
  return withoutTags.replace(/\s+/g, ' ').trim();
}

function parseNumber(raw: string): number {
  // Los CSV de proveedores españoles suelen usar coma decimal.
  const cleaned = raw.trim().replace(',', '.');
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : 0;
}

/** Parsea el CSV completo del feed. Puro (sin fetch) para poder probarlo
 * con texto de ejemplo sin necesitar la URL/credenciales reales. */
export function parseWalkasseFeed(csvText: string): WalkasseProduct[] {
  const lines = csvText.split(/\r\n|\n|\r/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return [];

  // La primera línea es la cabecera; se descarta (no se usa para mapear,
  // el orden de columnas es fijo — ver COLUMNS arriba).
  const rows = lines.slice(1);

  const seenEans = new Set<string>();
  const products: WalkasseProduct[] = [];

  for (const line of rows) {
    const fields = splitWalkasseLine(line);
    if (!fields) continue; // fila corrupta (menos columnas de las esperadas): se descarta

    const get = (name: (typeof COLUMNS)[number]) => fields[COLUMNS.indexOf(name)]?.trim() ?? '';

    const ean = get('CODIGOBAR');
    if (!ean) continue; // sin EAN no hay forma de cruzarlo con el catálogo
    if (seenEans.has(ean)) continue; // duplicado exacto: nos quedamos con la primera aparición
    seenEans.add(ean);

    products.push({
      // Excel antepone un apóstrofo a ARTICULO para forzarlo como texto;
      // no es parte del código real.
      articulo: get('ARTICULO').replace(/^'/, ''),
      ean,
      marca: get('MARCA'),
      denominacion: get('DENOMINA'),
      stock: Math.max(0, Math.round(parseNumber(get('STOCK')))),
      coste: parseNumber(get('COMPRA')),
      precioVenta: parseNumber(get('VENTA')),
      pesoGramos: Math.round(parseNumber(get('PESO')) * 1000),
      imagenUrl: get('IMAGEN'),
      descripcion: cleanWalkasseDescription(get('DESCEXTRTF')),
    });
  }

  return products;
}

/** Descarga y parsea el feed real de Walkasse. La URL ya resuelta (con
 * usuario/clave sustituidos) viene de la config del proveedor en
 * Firestore — ver suppliers.server.ts / resolveFeedUrl. */
export async function fetchWalkasseFeed(feedUrl: string): Promise<WalkasseProduct[]> {
  const response = await fetch(feedUrl);
  if (!response.ok) {
    throw new Error(`No se pudo descargar el feed de Walkasse (${response.status}).`);
  }
  const csvText = await response.text();
  return parseWalkasseFeed(csvText);
}
