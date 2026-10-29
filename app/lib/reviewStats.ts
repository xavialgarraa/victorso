export type ReviewStats = {average: number; count: number};

/** Lee el metafield `reviews.reviews` (mismo JSON que usa la ficha de
 * producto) y calcula nota media + nº de reseñas aprobadas, para las
 * estrellas de las tarjetas de producto. Sin llamada aparte a la Admin
 * API: ya viene incluido en la misma consulta Storefront de la tarjeta. */
export function parseReviewStats(metafieldValue: string | null | undefined): ReviewStats | null {
  if (!metafieldValue) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(metafieldValue);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed)) return null;

  const approved = (parsed as Array<Record<string, unknown>>).filter(
    (r): r is {rating: number; status: string} =>
      Boolean(r) && typeof r === 'object' && r.status === 'approved' && typeof r.rating === 'number',
  );
  if (approved.length === 0) return null;

  const sum = approved.reduce((acc, r) => acc + r.rating, 0);
  return {average: sum / approved.length, count: approved.length};
}
