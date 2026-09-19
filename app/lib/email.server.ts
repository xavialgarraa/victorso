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
