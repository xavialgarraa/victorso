/** Envía el aviso de restock via Resend. Si RESEND_API_KEY no está
 * configurado todavía, se omite el envío real (queda registrado en
 * consola) sin romper el resto del flujo. */
export async function sendRestockEmail(
  env: Env,
  {to, productTitle, productUrl}: {to: string; productTitle: string; productUrl: string},
): Promise<void> {
  if (!env.RESEND_API_KEY) {
    console.warn(
      `[restock] RESEND_API_KEY no configurado: se omite el email a ${to} para "${productTitle}".`,
    );
    return;
  }

  const from = env.RESEND_FROM_EMAIL || 'Victor So Professional <info@victorso.com>';

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from,
      to,
      subject: `Ya está disponible: ${productTitle}`,
      html: `
        <p>¡Buenas noticias!</p>
        <p><strong>${productTitle}</strong> ya está disponible de nuevo.</p>
        <p><a href="${productUrl}">Ver el producto</a></p>
        <p>— Victor So Professional</p>
      `,
    }),
  });

  if (!response.ok) {
    console.error(`[restock] Error enviando email a ${to}:`, await response.text());
  }
}

const REQUEST_TYPE_LABEL: Record<string, string> = {
  reparacion: 'Reparación',
  instalacion: 'Instalación',
  otro: 'Otro',
};

/** Avisa por email de una solicitud de presupuesto (servicio técnico /
 * instalaciones) nueva. Igual que sendRestockEmail: si RESEND_API_KEY no
 * está configurado, no rompe nada — la solicitud ya ha quedado guardada
 * en Firestore de todas formas. */
export async function sendServiceRequestEmail(
  env: Env,
  {name, contact, type, message}: {name: string; contact: string; type: string; message: string},
): Promise<void> {
  if (!env.RESEND_API_KEY) {
    console.warn(`[solicitud] RESEND_API_KEY no configurado: se omite el aviso por email de ${name}.`);
    return;
  }

  const from = env.RESEND_FROM_EMAIL || 'Victor So Professional <info@victorso.com>';
  const to = env.SERVICE_REQUEST_TO_EMAIL || 'info@victorso.com';

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from,
      to,
      reply_to: contact.includes('@') ? contact : undefined,
      subject: `Nueva solicitud de presupuesto (${REQUEST_TYPE_LABEL[type] || type}) — ${name}`,
      html: `
        <p>Nueva solicitud desde la web:</p>
        <p><strong>Nombre:</strong> ${name}</p>
        <p><strong>Contacto:</strong> ${contact}</p>
        <p><strong>Tipo:</strong> ${REQUEST_TYPE_LABEL[type] || type}</p>
        <p><strong>Mensaje:</strong><br>${message.replace(/\n/g, '<br>')}</p>
      `,
    }),
  });

  if (!response.ok) {
    console.error(`[solicitud] Error enviando aviso por email:`, await response.text());
  }
}
