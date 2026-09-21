/** Compara dos strings sin salir en cuanto encuentra la primera diferencia,
 * para no filtrar por timing cuánto de un secreto ha acertado quien llama
 * (Web Crypto no trae un timingSafeEqual de string en Workers). */
export function safeCompare(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const bytesA = encoder.encode(a);
  const bytesB = encoder.encode(b);

  // Longitudes distintas ya es una fuga de timing en sí, pero es
  // información mínima (el número de caracteres) frente a filtrar el
  // contenido byte a byte — aceptable para este nivel de amenaza.
  if (bytesA.length !== bytesB.length) return false;

  let diff = 0;
  for (let i = 0; i < bytesA.length; i++) {
    diff |= bytesA[i] ^ bytesB[i];
  }
  return diff === 0;
}
