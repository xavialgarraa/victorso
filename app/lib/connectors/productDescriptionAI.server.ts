import {getDoc, setDoc} from '~/lib/firestore.server';

/**
 * Versión genérica de la IA de descripciones que antes solo usaba StelOrder
 * (ver stelorderDescriptions.server.ts, que se deja intacto para no tocar
 * ese flujo ya probado). Esta la usan los demás sitios donde se crean
 * productos sin que una persona escriba la descripción a mano: la creación
 * desde distribuidores (Zentralmedia/Midwich/Walkasse, ver
 * distributorSync.server.ts) y el relleno de huecos en productos ya
 * existentes (ver admin-interno/descripcion.tsx, sección "Rellenar con IA").
 *
 * Se cachea en Firestore (colección "product_descriptions_ai") para no
 * regenerar ni gastar tokens de más si se vuelve a procesar el mismo
 * producto — la clave la decide quien llama (EAN para productos que
 * todavía no existen en Shopify, id de Shopify para los que ya existen).
 */

const COLLECTION = 'product_descriptions_ai';

type DescriptionDoc = {description: string; basedOnOriginal: boolean; generatedAt: string};

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

async function generateWithAI(
  apiKey: string,
  title: string,
  vendor: string,
  category: string,
  originalText: string | null,
): Promise<string> {
  const prompt = originalText
    ? `Eres redactor de una tienda española de equipamiento profesional de DJ, sonido, iluminación y AV. Te doy la descripción ORIGINAL de un producto, tal como la escribió el proveedor (puede estar en catalán, castellano, inglés, o mezcla, y puede ser muy escueta). Reescríbela en español de España, corta (2-4 frases, sin listas), natural y de venta — pero SIN inventar ni quitar ningún dato técnico real que aparezca en el original (potencias, medidas, frecuencias, resoluciones, etc.): tradúcelos y consérvalos tal cual.

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
  const result = (await response.json()) as {content?: Array<{text?: string}>};
  return (result.content?.[0]?.text || '').trim();
}

/** Devuelve la descripción final (pasada por IA cuando hay clave disponible)
 * para un producto, identificado por "cacheKey" (EAN si todavía no existe
 * en Shopify, id de Shopify si ya existe). */
export async function getAIProductDescription(
  env: Env,
  cacheKey: string,
  {title, vendor, category, originalText}: {title: string; vendor: string; category: string; originalText: string | null},
): Promise<{html: string; basedOnOriginal: boolean}> {
  const cleanOriginal = originalText ? stripHtml(originalText) : null;
  const hasOriginal = Boolean(cleanOriginal);

  const cached = await getDoc<DescriptionDoc>(env, COLLECTION, cacheKey);
  if (cached) return {html: `<p>${cached.description}</p>`, basedOnOriginal: cached.basedOnOriginal};

  if (!env.ANTHROPIC_API_KEY) {
    // Sin IA disponible: mejor el original tal cual (si hay) que nada.
    return {html: cleanOriginal ? `<p>${cleanOriginal}</p>` : '', basedOnOriginal: hasOriginal};
  }

  let description: string;
  try {
    description = await generateWithAI(env.ANTHROPIC_API_KEY, title, vendor, category, cleanOriginal);
  } catch (error) {
    console.error('[productDescriptionAI]', cacheKey, error);
    return {html: cleanOriginal ? `<p>${cleanOriginal}</p>` : '', basedOnOriginal: hasOriginal};
  }

  await setDoc(env, COLLECTION, cacheKey, {
    description,
    basedOnOriginal: hasOriginal,
    generatedAt: new Date().toISOString(),
  } satisfies DescriptionDoc);

  return {html: `<p>${description}</p>`, basedOnOriginal: hasOriginal};
}
