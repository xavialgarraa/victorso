const ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001';

export type FaqTranslations = {
  en: {question: string; answer: string};
  fr: {question: string; answer: string};
  pt: {question: string; answer: string};
  ca: {question: string; answer: string};
};

const TOOL = {
  name: 'set_translations',
  description: 'Traducciones de una pregunta frecuente a inglés, francés, portugués y catalán.',
  input_schema: {
    type: 'object' as const,
    properties: {
      en: {
        type: 'object',
        properties: {question: {type: 'string'}, answer: {type: 'string'}},
        required: ['question', 'answer'],
      },
      fr: {
        type: 'object',
        properties: {question: {type: 'string'}, answer: {type: 'string'}},
        required: ['question', 'answer'],
      },
      pt: {
        type: 'object',
        properties: {question: {type: 'string'}, answer: {type: 'string'}},
        required: ['question', 'answer'],
      },
      ca: {
        type: 'object',
        properties: {question: {type: 'string'}, answer: {type: 'string'}},
        required: ['question', 'answer'],
      },
    },
    required: ['en', 'fr', 'pt', 'ca'],
  },
};

function isValid(input: unknown): input is FaqTranslations {
  if (!input || typeof input !== 'object') return false;
  const obj = input as Record<string, unknown>;
  return (['en', 'fr', 'pt', 'ca'] as const).every((lang) => {
    const entry = obj[lang] as Record<string, unknown> | undefined;
    return entry && typeof entry.question === 'string' && typeof entry.answer === 'string';
  });
}

/** Traduce una FAQ (pregunta + respuesta en español) a en/fr/pt/ca usando
 * Claude. Si no hay ANTHROPIC_API_KEY configurado, o la llamada falla,
 * devuelve null — la FAQ se guarda igualmente, solo que de momento se
 * muestra en español en esos idiomas (ver faq.server.ts). */
export async function translateFaqItem(
  env: Env,
  {question, answer}: {question: string; answer: string},
): Promise<FaqTranslations | null> {
  if (!env.ANTHROPIC_API_KEY) return null;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 1024,
        tools: [TOOL],
        tool_choice: {type: 'tool', name: 'set_translations'},
        messages: [
          {
            role: 'user',
            content:
              `Traduce esta pregunta frecuente de una tienda de equipos de sonido, DJ e iluminación ` +
              `(Victor So Professional) al inglés, francés, portugués y catalán. Mantén el mismo tono ` +
              `cercano y profesional, sin traducir literalmente nombres de marcas o modelos.\n\n` +
              `Pregunta: ${question}\nRespuesta: ${answer}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      console.error('[faq translate] Anthropic error:', await response.text());
      return null;
    }

    const data = (await response.json()) as {
      content: Array<{type: string; input?: unknown}>;
    };
    const toolUse = data.content.find((block) => block.type === 'tool_use');
    if (!toolUse || !isValid(toolUse.input)) return null;
    return toolUse.input;
  } catch (error) {
    console.error('[faq translate]', error);
    return null;
  }
}
