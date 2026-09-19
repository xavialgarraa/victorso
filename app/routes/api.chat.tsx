import type {Route} from './+types/api.chat';

const ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001';
const MAX_MESSAGES = 20;
const MAX_MESSAGE_LENGTH = 1000;

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

Reglas importantes:
- Responde SIEMPRE en español, de forma breve, cercana y profesional (2-4 frases,
  usa listas solo si aporta claridad).
- NO inventes precios, stock ni características concretas de productos que no
  conozcas: si preguntan por un producto específico, indícales que lo busquen en la
  web o contacten por WhatsApp/teléfono para confirmarlo al momento.
- Si preguntan algo que no tiene que ver con la tienda (temas ajenos, código, etc.),
  redirige amablemente la conversación de vuelta a cómo puedes ayudarles con la tienda.
- Si no sabes algo con certeza, dilo y ofrece el contacto directo (WhatsApp o teléfono)
  en vez de inventar.`;

type ChatMessage = {role: 'user' | 'assistant'; content: string};

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

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': context.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 400,
        system: SYSTEM_PROMPT,
        messages,
      }),
    });

    if (!response.ok) {
      console.error('[chat] Anthropic API error:', response.status, await response.text());
      return Response.json(
        {error: 'No he podido responder ahora mismo. Prueba de nuevo en un momento.'},
        {status: 200},
      );
    }

    const data = (await response.json()) as {
      content: Array<{type: string; text?: string}>;
    };
    const reply = data.content.find((block) => block.type === 'text')?.text?.trim();

    if (!reply) {
      return Response.json(
        {error: 'No he podido responder ahora mismo. Prueba de nuevo en un momento.'},
        {status: 200},
      );
    }

    return Response.json({reply});
  } catch (error) {
    console.error('[chat]', error);
    return Response.json(
      {error: 'No he podido responder ahora mismo. Prueba de nuevo en un momento.'},
      {status: 200},
    );
  }
}
