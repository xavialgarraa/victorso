import {getDoc, setDoc} from '~/lib/firestore.server';
import type {StelOrderProduct} from '~/lib/connectors/stelorder.server';

/**
 * Categorías reales (por tipo de producto) para el catálogo de StelOrder —
 * son las colecciones que YA existen en Shopify (heredadas de la web
 * anterior), no unas inventadas por nosotros: el nombre de cada una tiene
 * que coincidir tal cual con el título de esa colección para que
 * getOrCreateCollection encuentre la existente en vez de crear una
 * duplicada. Las categorías propias de StelOrder están organizadas por
 * MARCA (ADAM HALL, PIONEER...), no por tipo — así que la categoría real
 * de cada producto se decide con IA leyendo su nombre, y se cachea en
 * Firestore (colección "stelorder_categories", 1 doc por id de producto)
 * para no tener que volver a preguntarle a la IA por productos ya vistos.
 */
export const STELORDER_CATEGORIES = [
  'Reproductores DJ',
  'Controladoras DJ',
  'Mixers y Mezcladores',
  'Auriculares',
  'Altavoces',
  'Flight Cases y Bolsas',
  'Giradiscos',
  'Accesorios y Cables',
  'Sistemas All-in-One',
  'Instrumentos y Teclados MIDI',
  'Otros',
] as const;

export type StelOrderCategory = (typeof STELORDER_CATEGORIES)[number];

/**
 * GID de la categoría oficial de la taxonomía estándar de Shopify (el
 * campo "category" separado del "Tipo de producto") más cercana a cada una
 * de nuestras categorías reales. La taxonomía de Shopify es fija y en
 * inglés internamente (el admin la traduce en pantalla según el idioma de
 * la tienda, pero la API siempre devuelve/acepta el GID, no un string en
 * español). "Otros" se deja sin categoría: no hay ningún nodo que encaje.
 */
export const STELORDER_CATEGORY_TAXONOMY: Record<StelOrderCategory, string | null> = {
  'Reproductores DJ': 'gid://shopify/TaxonomyCategory/el-2-5-1', // Electronics > Audio > DJ & Specialty Audio > DJ CD Players
  'Controladoras DJ': 'gid://shopify/TaxonomyCategory/el-2-5-4', // Electronics > Audio > DJ & Specialty Audio > DJ Controllers
  'Mixers y Mezcladores': 'gid://shopify/TaxonomyCategory/el-2-5-5', // Electronics > Audio > DJ & Specialty Audio > DJ Mixers
  Auriculares: 'gid://shopify/TaxonomyCategory/el-2-2-7-1-2', // Electronics > Audio > Audio Components > Headphones & Headsets > Headphones > DJ Headphones
  Altavoces: 'gid://shopify/TaxonomyCategory/el-2-2-10', // Electronics > Audio > Audio Components > Speakers
  'Flight Cases y Bolsas': 'gid://shopify/TaxonomyCategory/el-2-5-8-1', // Electronics > Audio > DJ & Specialty Audio > DJ & Specialty Audio Accessories > DJ Flight Cases & Bags
  Giradiscos: 'gid://shopify/TaxonomyCategory/el-2-3-10-2', // Electronics > Audio > Audio Players & Recorders > Turntables & Record Players > Turntables
  'Accesorios y Cables': 'gid://shopify/TaxonomyCategory/el-7-7', // Electronics > Electronics Accessories > Cables
  'Sistemas All-in-One': 'gid://shopify/TaxonomyCategory/el-2-5-2', // Electronics > Audio > DJ & Specialty Audio > DJ Systems
  'Instrumentos y Teclados MIDI': 'gid://shopify/TaxonomyCategory/ae-2-8-4-2', // Arts & Entertainment > ... > Electronic Musical Instruments > MIDI Controllers
  Otros: null,
};

const COLLECTION = 'stelorder_categories';
const BATCH_SIZE = 50;

type CategoryDoc = {category: StelOrderCategory; classifiedAt: string};

function buildPrompt(batch: StelOrderProduct[]): string {
  const list = batch.map((p, i) => `${i + 1}. ${p.name.trim()}`).join('\n');
  return `Eres un catalogador experto de una tienda de equipamiento profesional de DJ, sonido, iluminación y AV (nombres en español y catalán, con muchas abreviaturas). Clasifica cada producto en UNA sola categoría de esta lista fija:

${STELORDER_CATEGORIES.map((c, i) => `${i + 1}) ${c}`).join('\n')}

Reglas:
- "Reproductores DJ" = CDJ y reproductores de medios para cabina.
- "Controladoras DJ" = controladoras que no llevan altavoz integrado (se conectan a un sistema de sonido aparte).
- "Sistemas All-in-One" = equipos todo-en-uno con altavoz/batería incorporados (ej. controladoras portátiles con altavoz).
- "Otros" = cualquier cosa que no encaje claramente en ninguna de las demás (piezas de reparación, software, cámaras/CCTV, redes, consumibles...).
- Responde SOLO con un JSON array de strings (una categoría exacta de la lista por cada producto, en el mismo orden), sin explicaciones. Ejemplo: ["Altavoces","Controladoras DJ",...]

Productos:
${list}`;
}

async function classifyBatchWithAI(
  apiKey: string,
  batch: StelOrderProduct[],
  attempt = 1,
): Promise<StelOrderCategory[]> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4000,
      messages: [{role: 'user', content: buildPrompt(batch)}],
    }),
  });

  if (!response.ok) {
    throw new Error(`Anthropic API error (${response.status}) clasificando StelOrder.`);
  }

  const data = (await response.json()) as {content?: Array<{text?: string}>};
  const text = data.content?.[0]?.text || '';
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error('La IA no devolvió un array JSON.');

  const parsed = JSON.parse(match[0]) as string[];
  if (parsed.length !== batch.length) {
    if (attempt <= 2) return classifyBatchWithAI(apiKey, batch, attempt + 1);
    throw new Error(`Desajuste de tamaño persistente clasificando lote (${parsed.length} vs ${batch.length}).`);
  }

  return parsed.map((c) =>
    (STELORDER_CATEGORIES as readonly string[]).includes(c) ? (c as StelOrderCategory) : 'Otros',
  );
}

/**
 * Devuelve la categoría de cada producto: de caché (Firestore) si ya se
 * clasificó antes, o preguntando a la IA (y guardándola) si es nuevo. Solo
 * llama a la IA por los productos realmente nuevos/no vistos, en lotes de
 * 50 — pensado para correr tanto en la primera carga masiva como, más
 * adelante, cuando entren 1-2 productos nuevos en cada sincronización.
 */
export async function classifyStelOrderProducts(
  env: Env,
  products: StelOrderProduct[],
): Promise<Map<number, StelOrderCategory>> {
  const result = new Map<number, StelOrderCategory>();
  const toClassify: StelOrderProduct[] = [];

  for (const p of products) {
    const cached = await getDoc<CategoryDoc>(env, COLLECTION, String(p.id));
    if (cached) {
      result.set(p.id, cached.category);
    } else {
      toClassify.push(p);
    }
  }

  if (toClassify.length === 0) return result;
  if (!env.ANTHROPIC_API_KEY) {
    // Sin IA disponible: se marcan como "Otros" (revisable a mano en el
    // panel) en vez de romper toda la sincronización.
    for (const p of toClassify) result.set(p.id, 'Otros');
    return result;
  }

  for (let i = 0; i < toClassify.length; i += BATCH_SIZE) {
    const batch = toClassify.slice(i, i + BATCH_SIZE);
    let categories: StelOrderCategory[];
    try {
      categories = await classifyBatchWithAI(env.ANTHROPIC_API_KEY, batch);
    } catch (error) {
      console.error('[stelorderCategories] batch failed', error);
      categories = batch.map(() => 'Otros');
    }

    await Promise.all(
      batch.map((p, j) => {
        const category = categories[j];
        result.set(p.id, category);
        return setDoc(env, COLLECTION, String(p.id), {
          category,
          classifiedAt: new Date().toISOString(),
        } satisfies CategoryDoc);
      }),
    );
  }

  return result;
}
