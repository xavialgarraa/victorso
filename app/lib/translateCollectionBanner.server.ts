// Haiku falla de forma consistente con este esquema anidado (array de
// features dentro de 4 idiomas): en pruebas reales siempre rellenaba solo
// "en" y daba la llamada por completada, incluso con reintentos. Sonnet
// resuelve el mismo esquema sin problema — dado el bajo volumen (banners
// se editan rara vez, no en bulk como las descripciones de producto), el
// coste extra es insignificante frente a la fiabilidad.
const ANTHROPIC_MODEL = 'claude-sonnet-5';

export type CollectionBannerTranslations = Record<
  'en' | 'fr' | 'pt' | 'ca',
  {title: string; lede: string; features: Array<{title: string; text: string}>}
>;

const LOCALIZED_ENTRY_SCHEMA = {
  type: 'object' as const,
  properties: {
    title: {type: 'string'},
    lede: {type: 'string'},
    features: {
      type: 'array',
      items: {
        type: 'object',
        properties: {title: {type: 'string'}, text: {type: 'string'}},
        required: ['title', 'text'],
      },
    },
  },
  required: ['title', 'lede', 'features'],
};

const TOOL = {
  name: 'set_translations',
  description: 'Traducciones de un banner de colección a inglés, francés, portugués y catalán.',
  input_schema: {
    type: 'object' as const,
    properties: {
      en: LOCALIZED_ENTRY_SCHEMA,
      fr: LOCALIZED_ENTRY_SCHEMA,
      pt: LOCALIZED_ENTRY_SCHEMA,
      ca: LOCALIZED_ENTRY_SCHEMA,
    },
    required: ['en', 'fr', 'pt', 'ca'],
  },
};

function isValid(input: unknown, featureCount: number): input is CollectionBannerTranslations {
  if (!input || typeof input !== 'object') return false;
  const obj = input as Record<string, unknown>;
  return (['en', 'fr', 'pt', 'ca'] as const).every((lang) => {
    const entry = obj[lang] as Record<string, unknown> | undefined;
    if (!entry || typeof entry.title !== 'string' || typeof entry.lede !== 'string') return false;
    if (!Array.isArray(entry.features) || entry.features.length !== featureCount) return false;
    return (entry.features as unknown[]).every(
      (f) => f && typeof (f as Record<string, unknown>).title === 'string' && typeof (f as Record<string, unknown>).text === 'string',
    );
  });
}

async function translateOnce(
  env: Env,
  {title, lede, features}: {title: string; lede: string; features: Array<{title: string; text: string}>},
): Promise<CollectionBannerTranslations | null> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 1536,
      tools: [TOOL],
      tool_choice: {type: 'tool', name: 'set_translations'},
      messages: [
        {
          role: 'user',
          content:
            `Traduce este banner de cabecera de una colección de una tienda de equipos de sonido, DJ e ` +
            `iluminación (Victor So Professional) al inglés, francés, portugués y catalán. Debes rellenar ` +
            `las 4 traducciones completas (en, fr, pt, ca) — no te detengas tras la primera. Mantén el mismo ` +
            `tono profesional y persuasivo, el mismo número de "features" en el mismo orden, y no traduzcas ` +
            `literalmente nombres de marcas o modelos.\n\n` +
            `Título: ${title}\nTexto: ${lede}\n` +
            features.map((f, i) => `Feature ${i + 1} — título: ${f.title} / texto: ${f.text}`).join('\n'),
        },
      ],
    }),
  });

  if (!response.ok) {
    console.error('[collection banner translate] Anthropic error:', await response.text());
    return null;
  }

  const data = (await response.json()) as {
    content: Array<{type: string; input?: unknown}>;
  };
  const toolUse = data.content.find((block) => block.type === 'tool_use');
  if (!toolUse || !isValid(toolUse.input, features.length)) return null;
  return toolUse.input;
}

/** Traduce un banner de colección (título + lede + hasta 3 "features") a
 * en/fr/pt/ca usando Claude. Si no hay ANTHROPIC_API_KEY, o la llamada
 * falla, devuelve null — el banner se guarda igual, mostrando el español
 * de fallback en esos idiomas (ver collectionBanners.server.ts).
 *
 * Con este esquema anidado (array de features dentro de 4 idiomas), Haiku
 * a veces solo rellena el primer idioma y da la llamada por completada
 * (visto en pruebas reales) — por eso reintenta hasta 3 veces en vez de
 * aceptar directamente una respuesta incompleta como las FAQs (más
 * simples, sin ese problema). */
export async function translateCollectionBanner(
  env: Env,
  {title, lede, features}: {title: string; lede: string; features: Array<{title: string; text: string}>},
): Promise<CollectionBannerTranslations | null> {
  if (!env.ANTHROPIC_API_KEY) return null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const result = await translateOnce(env, {title, lede, features});
      if (result) return result;
      console.warn(`[collection banner translate] intento ${attempt} incompleto, reintentando…`);
    } catch (error) {
      console.error(`[collection banner translate] intento ${attempt}`, error);
    }
  }
  return null;
}
