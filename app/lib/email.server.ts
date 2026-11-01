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

/** Confirmación al propio cliente de que su solicitud se ha recibido
 * (solo si el contacto que dejó es un email). Mejor esfuerzo, como el resto. */
export async function sendServiceRequestConfirmationEmail(
  env: Env,
  {to, name, type}: {to: string; name: string; type: string},
): Promise<void> {
  if (!env.RESEND_API_KEY) {
    console.warn(`[solicitud] RESEND_API_KEY no configurado: se omite la confirmación a ${to}.`);
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
      subject: 'Hemos recibido tu solicitud — Victor So Professional',
      html: `
        <p>Hola ${name},</p>
        <p>Hemos recibido tu solicitud de ${REQUEST_TYPE_LABEL[type] || type.toLowerCase()} y nos pondremos en contacto contigo en breve.</p>
        <p>Si lo necesitas antes, puedes escribirnos por WhatsApp al <a href="https://wa.me/34619406443">619 406 443</a> o llamar al 972 364 114.</p>
        <p>— Victor So Professional</p>
      `,
    }),
  });

  if (!response.ok) {
    console.error(`[solicitud] Error enviando confirmación a ${to}:`, await response.text());
  }
}

/** Avisa al admin de que hay una reseña nueva esperando moderación. */
export async function sendNewReviewPendingEmail(
  env: Env,
  {productTitle, name, rating, comment, adminUrl}: {
    productTitle: string;
    name: string;
    rating: number;
    comment: string;
    adminUrl: string;
  },
): Promise<void> {
  if (!env.RESEND_API_KEY) {
    console.warn(`[reseñas] RESEND_API_KEY no configurado: se omite el aviso de reseña nueva.`);
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
      subject: `Nueva reseña pendiente de moderación — ${productTitle}`,
      html: `
        <p>Nueva reseña en <strong>${productTitle}</strong>:</p>
        <p><strong>${name}</strong> — ${'★'.repeat(rating)}${'☆'.repeat(5 - rating)}</p>
        <p>${comment.replace(/\n/g, '<br>')}</p>
        <p><a href="${adminUrl}">Moderar reseñas</a></p>
      `,
    }),
  });

  if (!response.ok) {
    console.error(`[reseñas] Error enviando aviso de reseña nueva:`, await response.text());
  }
}

/** Avisa al cliente que su reseña ya está publicada (solo si dejó email). */
export async function sendReviewApprovedEmail(
  env: Env,
  {to, name, productTitle, productUrl}: {to: string; name: string; productTitle: string; productUrl: string},
): Promise<void> {
  if (!env.RESEND_API_KEY) {
    console.warn(`[reseñas] RESEND_API_KEY no configurado: se omite el aviso de reseña aprobada a ${to}.`);
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
      subject: '¡Tu reseña ya está publicada!',
      html: `
        <p>Hola ${name},</p>
        <p>Gracias por tu opinión sobre <strong>${productTitle}</strong> — ya está publicada en la ficha del producto.</p>
        <p><a href="${productUrl}">Ver la reseña</a></p>
        <p>— Victor So Professional</p>
      `,
    }),
  });

  if (!response.ok) {
    console.error(`[reseñas] Error enviando aviso de reseña aprobada a ${to}:`, await response.text());
  }
}

/** Avisa al admin de que una sincronización automática (cron) ha fallado. */
export async function sendSyncFailureEmail(
  env: Env,
  {supplierName, error}: {supplierName: string; error: string},
): Promise<void> {
  if (!env.RESEND_API_KEY) {
    console.warn(`[sync] RESEND_API_KEY no configurado: se omite el aviso de fallo de ${supplierName}.`);
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
      subject: `⚠️ Fallo en la sincronización automática — ${supplierName}`,
      html: `
        <p>La sincronización automática de <strong>${supplierName}</strong> ha fallado:</p>
        <p style="font-family: monospace; background: #f4f4f4; padding: 8px 12px; border-radius: 6px;">${error}</p>
        <p>Revisa el panel de sincronización para más detalle.</p>
      `,
    }),
  });

  if (!response.ok) {
    console.error(`[sync] Error enviando aviso de fallo:`, await response.text());
  }
}

/** Avisa al admin de que una sincronización automática ha encontrado
 * cambios de precio pendientes de confirmar a mano (nunca se aplican solos). */
export async function sendPriceChangesPendingEmail(
  env: Env,
  {supplierName, count, adminUrl}: {supplierName: string; count: number; adminUrl: string},
): Promise<void> {
  if (!env.RESEND_API_KEY) {
    console.warn(`[sync] RESEND_API_KEY no configurado: se omite el aviso de precios pendientes de ${supplierName}.`);
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
      subject: `💲 ${count} cambio${count === 1 ? '' : 's'} de precio pendiente${count === 1 ? '' : 's'} — ${supplierName}`,
      html: `
        <p>La sincronización de <strong>${supplierName}</strong> ha detectado <strong>${count}</strong> cambio${count === 1 ? '' : 's'} de precio que no se ha${count === 1 ? '' : 'n'} aplicado automáticamente.</p>
        <p>Revísalo${count === 1 ? '' : 's'} y confírmalo${count === 1 ? '' : 's'} a mano en el panel:</p>
        <p><a href="${adminUrl}">Ir al panel de sincronización</a></p>
      `,
    }),
  });

  if (!response.ok) {
    console.error(`[sync] Error enviando aviso de precios pendientes:`, await response.text());
  }
}
