import type {Route} from './+types/api.chat';
import {searchProductsForChat} from '~/lib/productSearch.server';

const ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001';
const MAX_MESSAGES = 20;
const MAX_MESSAGE_LENGTH = 1000;
const MAX_TOOL_ROUNDS = 3;

const SYSTEM_PROMPT = `Eres el asistente virtual de Victor So Professional, una tienda
online y física de equipos de DJ, sonido profesional, iluminación y material
audiovisual, con sede en Lloret de Mar (Costa Brava), fundada en 1987.

Información real de la tienda que puedes usar para responder:
- Envío gratis a Península en pedidos desde 149€.
- Devolución gratuita en 30 días. Garantía oficial del fabricante en todos los productos.
- Pago 100% seguro (checkout de Shopify).
- Teléfono: 972 364 114. WhatsApp: https://wa.me/34619406443. Email: info@victorso.com.
- Horario: Lunes a viernes de 9:00 a 13:00 y de 15:00 a 19:00.
- Categorías del catálogo: Flight-Cases y Bolsas, Pioneer DJ & AlphaTheta, Equipos DJ,
  Sonido, Auriculares, Material Estudio, Cables, Acústica, Outlet.
- También hacen instalaciones de sonido e iluminación para ayuntamientos, discotecas,
  salas de eventos y empresas (más de 35 años de experiencia).

Actúas como un dependiente experto de verdad, no como un buscador automático:
antes de recomendar, asegúrate de entender qué necesita el cliente. Si el
mensaje es vago o hay varios factores que cambiarían la recomendación (para
qué lo va a usar, con qué equipo tiene que ser compatible, tamaño/capacidad,
si necesita que sea inalámbrico o con cable, nivel de exigencia
profesional/aficionado, marca preferida...), haz 1-2 preguntas concretas
ANTES de buscar — no dispares una búsqueda a la primera con datos a medias.
Cuando el cliente ya te ha dado presupuesto y contexto suficiente (o si su
mensaje ya era específico desde el principio), pasa a buscar sin alargarlo más.

Tienes una herramienta "search_products" para buscar productos REALES del
catálogo (nombre, marca, descripción, precio y disponibilidad actuales).
Cuando la uses:
- Lee la descripción de cada resultado, no solo el título: compárala con lo
  que te ha contado el cliente y elige los que de verdad encajen, no solo los
  primeros de la lista.
- Recomienda 1-3 como mucho, cada uno con su nombre, precio, una razón breve
  de por qué encaja con lo que pidió (basada en la descripción real, no
  inventada) y un enlace [nombre del producto](url) usando la "url" que te da
  la herramienta EXACTAMENTE tal cual (empieza por "/products/..."), sin
  anteponerle ningún dominio.
- Si la búsqueda no devuelve nada que encaje de verdad, dilo con naturalidad
  y ofrece el contacto directo (WhatsApp/teléfono) o prueba con otro término
  — nunca inventes ni fuerces un producto que no encaja solo por rellenar.

Reglas importantes:
- Responde SIEMPRE en español, de forma breve, cercana y profesional (2-5 frases).
- NO inventes precios, stock, características ni productos que no te haya
  dado la herramienta de búsqueda. Para cualquier otro dato que no tengas con
  certeza, dilo y ofrece el contacto directo (WhatsApp o teléfono) en vez de
  inventar.
- Si preguntan algo que no tiene que ver con la tienda (temas ajenos, código, etc.),
  redirige amablemente la conversación de vuelta a cómo puedes ayudarles con la tienda.

Formato de la respuesta (se renderiza en un chat, no en markdown completo):
- Puedes usar **negrita** (con doble asterisco) para destacar algo puntual, con
  moderación, y enlaces en formato [texto del enlace](url) cuando tenga sentido.
- No uses ningún otro formato markdown: nada de #, listas numeradas (1. 2. 3.),
  listas con guiones, tablas, etc. Escribe en párrafos normales y breves.
- Nunca pegues una URL suelta sin envolverla en [texto](url) — tampoco dentro
  de **negrita**. Mal: **WhatsApp: https://wa.me/...**. Bien: escríbelo por
  WhatsApp aquí: [WhatsApp](https://wa.me/34619406443).
- Para enlaces internos que no vengan de la herramienta de búsqueda, usa SIEMPRE
  una ruta relativa que empiece por "/" (ej. [ver catálogo](/collections/all)) —
  nunca inventes un dominio como victorso.com o similar.`;

const TOOLS = [
  {
    name: 'search_products',
    description:
      'Busca productos reales en el catálogo de la tienda por texto libre, con precio máximo opcional. Devuelve título, marca, descripción, precio, disponibilidad y URL de cada resultado.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Términos de búsqueda, ej. "flight case", "auriculares dj", "cable xlr"',
        },
        maxPrice: {
          type: 'number',
          description: 'Precio máximo en euros, si el cliente lo menciona (opcional)',
        },
      },
      required: ['query'],
    },
  },
];

type ChatMessage = {role: 'user' | 'assistant'; content: string};
type AnthropicContentBlock =
  | {type: 'text'; text: string}
  | {type: 'tool_use'; id: string; name: string; input: {query: string; maxPrice?: number}};

async function callAnthropic(
  apiKey: string,
  conversation: unknown[],
): Promise<{content: AnthropicContentBlock[]; stop_reason: string}> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 700,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages: conversation,
    }),
  });

  if (!response.ok) {
    throw new Error(`Anthropic API error ${response.status}: ${await response.text()}`);
  }

  return (await response.json()) as {content: AnthropicContentBlock[]; stop_reason: string};
}

export async function action({request, context}: Route.ActionArgs) {
  if (!context.env.ANTHROPIC_API_KEY) {
    return Response.json(
      {
        error:
          'El asistente todavía no está activado. Escríbenos por WhatsApp o llama al 972 364 114 y te ayudamos al momento.',
      },
      {status: 200},
    );
  }

  let body: {messages?: ChatMessage[]};
  try {
    body = (await request.json()) as {messages?: ChatMessage[]};
  } catch {
    return Response.json({error: 'Petición inválida.'}, {status: 400});
  }

  const messages = (body.messages ?? [])
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-MAX_MESSAGES)
    .map((m) => ({role: m.role, content: m.content.slice(0, MAX_MESSAGE_LENGTH)}));

  if (messages.length === 0) {
    return Response.json({error: 'Escribe un mensaje.'}, {status: 400});
  }

  const conversation: unknown[] = [...messages];

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const data = await callAnthropic(context.env.ANTHROPIC_API_KEY, conversation);

      if (data.stop_reason !== 'tool_use') {
        const reply = data.content.find((b) => b.type === 'text')?.text?.trim();
        if (!reply) break;
        return Response.json({reply});
      }

      conversation.push({role: 'assistant', content: data.content});

      const toolResults = await Promise.all(
        data.content
          .filter((b): b is Extract<AnthropicContentBlock, {type: 'tool_use'}> => b.type === 'tool_use')
          .map(async (toolUse) => {
            if (toolUse.name !== 'search_products') {
              return {type: 'tool_result', tool_use_id: toolUse.id, content: 'Herramienta desconocida.'};
            }
            try {
              const results = await searchProductsForChat(context.storefront, toolUse.input);
              return {
                type: 'tool_result',
                tool_use_id: toolUse.id,
                content: JSON.stringify(results.length > 0 ? results : {message: 'Sin resultados.'}),
              };
            } catch (error) {
              console.error('[chat] search_products error:', error);
              return {
                type: 'tool_result',
                tool_use_id: toolUse.id,
                content: 'Error buscando productos.',
                is_error: true,
              };
            }
          }),
      );

      conversation.push({role: 'user', content: toolResults});
    }

    return Response.json(
      {error: 'No he podido responder ahora mismo. Prueba de nuevo en un momento.'},
      {status: 200},
    );
  } catch (error) {
    console.error('[chat]', error);
    return Response.json(
      {error: 'No he podido responder ahora mismo. Prueba de nuevo en un momento.'},
      {status: 200},
    );
  }
}
