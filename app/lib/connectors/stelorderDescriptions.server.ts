import {getDoc, setDoc} from '~/lib/firestore.server';
import type {StelOrderProduct} from '~/lib/connectors/stelorder.server';
import type {StelOrderCategory} from '~/lib/connectors/stelorderCategories.server';

/**
 * Descripción de cada producto: SIEMPRE pasa por IA, en español (la tienda
 * usa "es" como idioma principal — Translate & Adapt se encarga de las
 * demás). Si StelOrder ya trae una descripción, se usa como base real (la
 * IA la traduce/pule pero no puede inventar ni quitar datos técnicos que
 * ya aparezcan ahí); si no hay ninguna, se genera desde cero a partir de
 * título+marca+categoría. Se cachea en Firestore (colección
 * "stelorder_descriptions", 1 doc por id de producto) para no regenerarla
 * en cada sincronización.
 */

const COLLECTION = 'stelorder_descriptions';

type DescriptionDoc = {description: string; basedOnOriginal: boolean; generatedAt: string};

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

async function generateWithAI(
  apiKey: string,
  title: string,
  vendor: string,
  category: StelOrderCategory,
  originalText: string | null,
): Promise<string> {
  const prompt = originalText
    ? `Eres redactor de una tienda española de equipamiento profesional de DJ, sonido, iluminación y AV. Te doy la descripción ORIGINAL de un producto, tal como la escribió el proveedor (puede estar en catalán, castellano, o mezcla, y puede ser muy escueta). Reescríbela en español de España, corta (2-4 frases, sin listas), natural y de venta — pero SIN inventar ni quitar ningún dato técnico real que aparezca en el original (potencias, medidas, frecuencias, resoluciones, etc.): tradúcelos y consérvalos tal cual.

Producto: ${title}
Marca: ${vendor}
Categoría: ${category}
Descripción original: ${originalText}

Responde SOLO con la descripción reescrita, sin comillas ni explicaciones.`
    : `Escribe una descripción de producto corta (2-3 frases, sin listas, en español de España) para una tienda de equipamiento profesional de DJ, sonido, iluminación y AV. No inventes especificaciones técnicas concretas (potencias, medidas, etc.) que no te doy — describe de forma genérica pero útil qué es y para qué sirve.

Producto: ${title}
Marca: ${vendor}
Categoría: ${category}

Responde SOLO con la descripción, sin comillas ni explicaciones.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{role: 'user', content: prompt}],
    }),
  });

  if (!response.ok) throw new Error(`Anthropic API error (${response.status}) generando descripción.`);
  const data = (await response.json()) as {content?: Array<{text?: string}>};
  return (data.content?.[0]?.text || '').trim();
}

/** Devuelve la descripción final (siempre pasada por IA) a usar para un producto. */
export async function getStelOrderDescription(
  env: Env,
  product: StelOrderProduct,
  category: StelOrderCategory,
  vendor: string,
): Promise<{html: string; basedOnOriginal: boolean}> {
  const originalText = product.description ? stripHtml(product.description) : null;
  const hasOriginal = Boolean(originalText);

  const cached = await getDoc<DescriptionDoc>(env, COLLECTION, String(product.id));
  if (cached) return {html: `<p>${cached.description}</p>`, basedOnOriginal: cached.basedOnOriginal};

  if (!env.ANTHROPIC_API_KEY) {
    // Sin IA disponible: mejor usar el original tal cual (si hay) que
    // dejar el producto sin descripción.
    return {html: originalText ? `<p>${originalText}</p>` : '', basedOnOriginal: hasOriginal};
  }

  let description: string;
  try {
    description = await generateWithAI(env.ANTHROPIC_API_KEY, product.name, vendor, category, originalText);
  } catch (error) {
    console.error('[stelorderDescriptions] generate', product.id, error);
    return {html: originalText ? `<p>${originalText}</p>` : '', basedOnOriginal: hasOriginal};
  }

  await setDoc(env, COLLECTION, String(product.id), {
    description,
    basedOnOriginal: hasOriginal,
    generatedAt: new Date().toISOString(),
  } satisfies DescriptionDoc);

  return {html: `<p>${description}</p>`, basedOnOriginal: hasOriginal};
}
