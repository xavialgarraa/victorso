/** Serializa un objeto para un <script type="application/ld+json">, escapando
 * "<" para que un valor embebido con "</script>" no pueda cerrar la etiqueta
 * e inyectar HTML/JS. JSON.stringify por sí solo no escapa esa secuencia. */
export function jsonLdHtml(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}
