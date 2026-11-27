// Sin sufijo ".server" a propósito: a diferencia de productDescriptionAI.server.ts
// (que llama a Firestore/Anthropic), esto es lógica pura y se usa también
// desde el componente de admin-interno/descripcion.tsx, no solo desde su
// loader/action — un módulo ".server" ahí rompería el bundle de cliente.
function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Un producto "sin descripción de verdad" — vacío, o con un texto tan
 * corto que es claramente un título pegado sin más. Nunca decide
 * sobrescribir algo que ya parece una descripción real. */
export function looksLikeMissingDescription(descriptionHtml: string): boolean {
  const text = stripHtml(descriptionHtml || '');
  return text.length < 25;
}
