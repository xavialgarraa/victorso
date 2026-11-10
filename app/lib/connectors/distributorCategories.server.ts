import {getDoc, setDoc} from '~/lib/firestore.server';
import type {DistributorProduct} from '~/lib/connectors/distributorFeed.server';

/**
 * Categorías reales de la web (las que Víctor pasó en su Excel para el
 * menú "Categorías" — ver app/lib/categoryIcons.ts / memoria
 * project-megamenu-categorias). "Outlet" se deja fuera: en el Excel es un
 * filtro transversal sobre las demás, no un tipo de producto propio.
 */
export const DISTRIBUTOR_CATEGORIES = [
  'Alphatheta & Pioneer DJ',
  'Zona DJ',
  'Material de estudio',
  'Sonido / PA',
  'Cables',
  'Flightcases y bolsas',
  'Iluminación',
  'Otros',
] as const;

export type DistributorCategory = (typeof DISTRIBUTOR_CATEGORIES)[number];

const COLLECTION = 'distributor_categories';
const BATCH_SIZE = 50;

type CategoryDoc = {category: DistributorCategory; classifiedAt: string};

function buildPrompt(batch: DistributorProduct[]): string {
  const list = batch
    .map((p, i) => `${i + 1}. ${[p.title, p.brand, p.category].filter(Boolean).join(' — ')}`)
    .join('\n');
  return `Eres un catalogador experto de una tienda de equipamiento profesional de DJ, sonido, instrumentos, iluminación y AV. Clasifica cada producto (nombre, marca, categoría tal cual la da el distribuidor) en UNA sola categoría de esta lista fija:

${DISTRIBUTOR_CATEGORIES.map((c, i) => `${i + 1}) ${c}`).join('\n')}

Reglas:
- "Alphatheta & Pioneer DJ" = SOLO productos de esas dos marcas (son la misma empresa).
- "Zona DJ" = equipo DJ (controladoras, mixers, giradiscos, reproductores, auriculares DJ) de OTRAS marcas.
- "Material de estudio" = instrumentos, teclados/controladores MIDI, tarjetas de sonido, monitores de estudio, micrófonos de estudio.
- "Sonido / PA" = altavoces activos/pasivos, subwoofers, mezcladores de directo, amplificadores, procesadores de señal, microfonía en directo.
- "Cables" = cualquier cable, conector o adaptador de audio.
- "Flightcases y bolsas" = flightcases, racks, bolsas de transporte, fundas, muebles.
- "Iluminación" = iluminación de cualquier tipo (estática, cabezas móviles, flashes, láseres, máquinas de humo, control DMX).
- "Otros" = cualquier cosa que no encaje claramente (instrumentos acústicos sin amplificar como guitarras clásicas, accesorios genéricos, software...).
- Responde SOLO con un JSON array de strings (una categoría exacta de la lista por cada producto, en el mismo orden), sin explicaciones. Ejemplo: ["Sonido / PA","Cables",...]

Productos:
${list}`;
}

async function classifyBatchWithAI(
  apiKey: string,
  batch: DistributorProduct[],
  attempt = 1,
): Promise<DistributorCategory[]> {
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
    throw new Error(`Anthropic API error (${response.status}) clasificando distribuidores.`);
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
    (DISTRIBUTOR_CATEGORIES as readonly string[]).includes(c) ? (c as DistributorCategory) : 'Otros',
  );
}

/** Igual que classifyStelOrderProducts pero cacheado por EAN en vez de por
 * id numérico (estos productos no tienen id propio, el EAN es la única
 * clave estable entre el feed y Shopify). */
export async function classifyDistributorProducts(
  env: Env,
  products: DistributorProduct[],
): Promise<Map<string, DistributorCategory>> {
  const result = new Map<string, DistributorCategory>();
  const toClassify: DistributorProduct[] = [];

  for (const p of products) {
    const cached = await getDoc<CategoryDoc>(env, COLLECTION, p.ean);
    if (cached) {
      result.set(p.ean, cached.category);
    } else {
      toClassify.push(p);
    }
  }

  if (toClassify.length === 0) return result;
  if (!env.ANTHROPIC_API_KEY) {
    for (const p of toClassify) result.set(p.ean, 'Otros');
    return result;
  }

  for (let i = 0; i < toClassify.length; i += BATCH_SIZE) {
    const batch = toClassify.slice(i, i + BATCH_SIZE);
    let categories: DistributorCategory[];
    try {
      categories = await classifyBatchWithAI(env.ANTHROPIC_API_KEY, batch);
    } catch (error) {
      console.error('[distributorCategories] batch failed', error);
      categories = batch.map(() => 'Otros');
    }

    await Promise.all(
      batch.map((p, j) => {
        const category = categories[j];
        result.set(p.ean, category);
        return setDoc(env, COLLECTION, p.ean, {
          category,
          classifiedAt: new Date().toISOString(),
        } satisfies CategoryDoc);
      }),
    );
  }

  return result;
}
