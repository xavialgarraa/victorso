/**
 * Límite de frecuencia muy simple para endpoints públicos sin login
 * (chat, newsletter, reseñas, solicitud de servicio) — evita que un
 * script pueda martillear esos endpoints para generar spam o, en el caso
 * del chat, gastar la cuota de la API de Anthropic sin control.
 *
 * Contador en memoria del proceso (ventana fija): no persiste entre
 * despliegues ni se comparte entre instancias del Worker, así que no es
 * un límite perfecto a nivel global — pero sí sube mucho el listón frente
 * a un abuso casual o un bot simple, sin necesitar infraestructura nueva
 * (Redis, KV, etc.) que esta tienda no tiene hoy.
 */

type Bucket = {count: number; resetAt: number};

const buckets = new Map<string, Bucket>();

// Limpieza oportunista: cada vez que se añade una entrada nueva, se
// aprovecha para tirar las que ya caducaron, así el Map no crece sin
// límite mientras el Worker esté caliente.
function sweep(now: number) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

/** Identificador del cliente a partir de la request — Oxygen/Cloudflare
 * manda la IP real en estas cabeceras (no te puedes fiar del origin/referer). */
export function getClientIp(request: Request): string {
  return (
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

/**
 * Devuelve true si la petición está permitida (y consume una unidad del
 * límite), false si hay que rechazarla. `scope` identifica el endpoint
 * (p.ej. "chat", "newsletter") para que cada uno tenga su propio contador
 * aunque venga de la misma IP.
 */
export function checkRateLimit(
  scope: string,
  request: Request,
  {limit, windowMs}: {limit: number; windowMs: number},
): boolean {
  const now = Date.now();
  const key = `${scope}:${getClientIp(request)}`;
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    sweep(now);
    buckets.set(key, {count: 1, resetAt: now + windowMs});
    return true;
  }

  if (existing.count >= limit) return false;
  existing.count++;
  return true;
}
