/**
 * Genera el HTML de la pestaña "Descripción" de un producto siguiendo el
 * sistema de diseño real de la web (variables CSS ya definidas en
 * app.css), para que se adapte solo al modo claro/oscuro y no duplique el
 * título del producto (que ya se muestra arriba en la ficha).
 *
 * Diseño deliberadamente minimal (nada de tarjetas pastel + emoji grande
 * estilo "generado por IA"): características como lista con acento de
 * marca, vídeo contenido en vez de a todo lo ancho, todo ocupando el
 * 100% del espacio disponible (sin max-width que corte el texto a la
 * mitad del hueco).
 */

export type DescriptionFeature = {icon: string; title: string; text: string};
export type DescriptionSpec = {label: string; value: string};

export type DescriptionInput = {
  intro: string;
  features: DescriptionFeature[];
  videos: string[];
  specs: DescriptionSpec[];
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function unescapeHtml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');
}

/** Acepta youtube.com/watch?v=ID, youtu.be/ID, youtube.com/embed/ID o un ID
 * suelto. Devuelve null si no se reconoce ningún formato. */
export function extractYoutubeId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  if (/^[\w-]{11}$/.test(trimmed)) return trimmed;

  try {
    const url = new URL(trimmed);
    if (url.hostname.includes('youtu.be')) {
      return url.pathname.slice(1) || null;
    }
    if (url.hostname.includes('youtube.com')) {
      if (url.pathname === '/watch') return url.searchParams.get('v');
      const embedMatch = url.pathname.match(/\/embed\/([\w-]{11})/);
      if (embedMatch) return embedMatch[1];
    }
  } catch {
    return null;
  }
  return null;
}

export function buildProductDescriptionHtml(input: DescriptionInput): string {
  const intro = input.intro.trim();
  const features = input.features.filter((f) => f.title.trim() || f.text.trim());
  const specs = input.specs.filter((s) => s.label.trim() || s.value.trim());
  const youtubeIds = input.videos
    .map((v) => extractYoutubeId(v))
    .filter((id): id is string => Boolean(id));

  const parts: string[] = [];
  parts.push('<div class="ps-wrap">');
  parts.push(PRODUCT_DESCRIPTION_STYLE);

  if (intro) {
    parts.push(`  <p class="ps-lead">${escapeHtml(intro)}</p>`);
  }

  if (features.length > 0) {
    parts.push('  <ul class="ps-features">');
    for (const f of features) {
      const icon = f.icon.trim();
      parts.push('    <li class="ps-feature">');
      parts.push(
        `      <div class="ps-feature-mark">${icon ? escapeHtml(icon) : ''}</div>`,
      );
      parts.push('      <div>');
      parts.push(`        <h3>${escapeHtml(f.title)}</h3>`);
      parts.push(`        <p>${escapeHtml(f.text)}</p>`);
      parts.push('      </div>');
      parts.push('    </li>');
    }
    parts.push('  </ul>');
  }

  if (youtubeIds.length > 0) {
    const multi = youtubeIds.length > 1;
    parts.push(`  <div class="ps-videos${multi ? ' ps-videos--multi' : ''}">`);
    for (const id of youtubeIds) {
      parts.push('    <div class="ps-video">');
      parts.push(
        `      <iframe src="https://www.youtube-nocookie.com/embed/${escapeHtml(id)}?rel=0" title="Vídeo del producto" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>`,
      );
      parts.push('    </div>');
    }
    parts.push('  </div>');
  }

  if (specs.length > 0) {
    parts.push('  <section class="ps-specs">');
    parts.push('    <h2>Especificaciones técnicas</h2>');
    parts.push('    <table>');
    for (const s of specs) {
      parts.push(`      <tr><td>${escapeHtml(s.label)}</td><td>${escapeHtml(s.value)}</td></tr>`);
    }
    parts.push('    </table>');
    parts.push('  </section>');
  }

  parts.push('</div>');
  return parts.join('\n');
}

/**
 * Lee de vuelta una descripción ya generada con esta plantilla (reconocible
 * por la clase "ps-wrap") para precargar el formulario al editar un
 * producto que ya tiene descripción. Si el HTML no viene de esta plantilla
 * (ej. escrito a mano, u otra herramienta) devuelve null — no se intenta
 * adivinar su estructura.
 */
export function parseProductDescriptionHtml(html: string): DescriptionInput | null {
  if (!html || !html.includes('class="ps-wrap"')) return null;

  const intro = html.match(/<p class="ps-lead">([\s\S]*?)<\/p>/)?.[1];

  const features: DescriptionFeature[] = [];
  const featureRe = /<li class="ps-feature">\s*<div class="ps-feature-mark">([\s\S]*?)<\/div>\s*<div>\s*<h3>([\s\S]*?)<\/h3>\s*<p>([\s\S]*?)<\/p>/g;
  let m: RegExpExecArray | null;
  while ((m = featureRe.exec(html))) {
    features.push({icon: unescapeHtml(m[1]), title: unescapeHtml(m[2]), text: unescapeHtml(m[3])});
  }

  const videos: string[] = [];
  const videoRe = /youtube-nocookie\.com\/embed\/([\w-]{11})/g;
  while ((m = videoRe.exec(html))) {
    videos.push(`https://www.youtube.com/watch?v=${m[1]}`);
  }

  const specs: DescriptionSpec[] = [];
  const specsBlock = html.match(/<section class="ps-specs">([\s\S]*?)<\/section>/)?.[1] ?? '';
  const specRe = /<tr><td>([\s\S]*?)<\/td><td>([\s\S]*?)<\/td><\/tr>/g;
  while ((m = specRe.exec(specsBlock))) {
    specs.push({label: unescapeHtml(m[1]), value: unescapeHtml(m[2])});
  }

  return {
    intro: intro ? unescapeHtml(intro) : '',
    features,
    videos,
    specs,
  };
}

const PRODUCT_DESCRIPTION_STYLE = `  <style>
    .ps-wrap { font-family: inherit; color: var(--text-muted); line-height: 1.65; }
    .ps-wrap h2, .ps-wrap h3 { font-family: var(--font-display); color: var(--text); }
    .ps-lead { font-size: 1.02rem; color: var(--text-muted); margin: 0 0 32px; }

    .ps-features { list-style: none; margin: 0 0 36px; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 22px 28px; }
    .ps-feature { display: flex; gap: 14px; align-items: flex-start; }
    .ps-feature-mark { flex-shrink: 0; width: 6px; height: 6px; margin-top: 9px; border-radius: 50%; background: var(--red); }
    .ps-feature-mark:not(:empty) { width: auto; height: auto; border-radius: 0; background: none; font-size: 20px; line-height: 1; margin-top: 1px; }
    .ps-feature h3 { font-size: .98rem; margin: 0 0 4px; font-weight: 700; }
    .ps-feature p { font-size: .88rem; color: var(--text-soft); margin: 0; line-height: 1.55; }

    .ps-videos { margin: 0 0 36px; max-width: 520px; }
    .ps-videos--multi { max-width: none; display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px; }
    .ps-video { aspect-ratio: 16 / 9; border-radius: var(--radius); overflow: hidden; box-shadow: var(--shadow); background: #000; }
    .ps-video iframe { width: 100%; height: 100%; border: 0; display: block; }

    .ps-specs { margin: 0; }
    .ps-specs h2 { font-size: 1.05rem; margin: 0 0 14px; }
    .ps-specs table { width: 100%; border-collapse: collapse; font-size: .88rem; }
    .ps-specs tr { border-bottom: 1px solid var(--border); }
    .ps-specs tr:last-child { border-bottom: none; }
    .ps-specs td { padding: 11px 4px; vertical-align: top; }
    .ps-specs td:first-child { font-weight: 700; color: var(--text); width: 30%; }
    .ps-specs td:last-child { color: var(--text-muted); }
    @media (max-width: 640px) {
      .ps-specs tr { display: flex; flex-direction: column; padding: 8px 0; }
      .ps-specs td:first-child { width: 100%; padding-bottom: 2px; }
      .ps-specs td:last-child { width: 100%; padding-top: 0; }
    }
  </style>`;
