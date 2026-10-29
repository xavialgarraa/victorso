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
  parts.push(`<div class="ps-wrap" style="${S.wrap}">`);

  if (intro) {
    parts.push(`  <p class="ps-lead" style="${S.lead}">${escapeHtml(intro)}</p>`);
  }

  if (features.length > 0) {
    parts.push(`  <ul class="ps-features" style="${S.features}">`);
    for (const f of features) {
      const icon = f.icon.trim();
      parts.push(`    <li class="ps-feature" style="${S.feature}">`);
      parts.push(
        `      <div class="ps-feature-mark" style="${icon ? S.featureMarkIcon : S.featureMarkDot}">${icon ? escapeHtml(icon) : ''}</div>`,
      );
      parts.push('      <div>');
      parts.push(`        <h3 style="${S.featureTitle}">${escapeHtml(f.title)}</h3>`);
      parts.push(`        <p style="${S.featureText}">${escapeHtml(f.text)}</p>`);
      parts.push('      </div>');
      parts.push('    </li>');
    }
    parts.push('  </ul>');
  }

  if (youtubeIds.length > 0) {
    const multi = youtubeIds.length > 1;
    parts.push(`  <div class="ps-videos" style="${multi ? S.videosMulti : S.videos}">`);
    for (const id of youtubeIds) {
      parts.push(`    <div class="ps-video" style="${S.video}">`);
      parts.push(
        `      <iframe style="${S.videoIframe}" src="https://www.youtube-nocookie.com/embed/${escapeHtml(id)}?rel=0" title="Vídeo del producto" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>`,
      );
      parts.push('    </div>');
    }
    parts.push('  </div>');
  }

  if (specs.length > 0) {
    parts.push(`  <section class="ps-specs" style="${S.specs}">`);
    parts.push(`    <h2 style="${S.specsTitle}">Especificaciones técnicas</h2>`);
    parts.push(`    <table style="${S.specsTable}">`);
    specs.forEach((s, i) => {
      const rowStyle = i === specs.length - 1 ? S.specsRowLast : S.specsRow;
      parts.push(
        `      <tr style="${rowStyle}"><td style="${S.specsLabel}">${escapeHtml(s.label)}</td><td style="${S.specsValue}">${escapeHtml(s.value)}</td></tr>`,
      );
    });
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

  const intro = html.match(/<p class="ps-lead"[^>]*>([\s\S]*?)<\/p>/)?.[1];

  const features: DescriptionFeature[] = [];
  const featureRe = /<li class="ps-feature"[^>]*>\s*<div class="ps-feature-mark"[^>]*>([\s\S]*?)<\/div>\s*<div>\s*<h3[^>]*>([\s\S]*?)<\/h3>\s*<p[^>]*>([\s\S]*?)<\/p>/g;
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
  const specsBlock = html.match(/<section class="ps-specs"[^>]*>([\s\S]*?)<\/section>/)?.[1] ?? '';
  const specRe = /<tr[^>]*><td[^>]*>([\s\S]*?)<\/td><td[^>]*>([\s\S]*?)<\/td><\/tr>/g;
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

/**
 * Estilos en línea (nada de un `<style>` propio) — Shopify guarda esto tal
 * cual en descriptionHtml, y el campo de texto plano `description` de la
 * Storefront API (usado en tarjetas de producto, snippets de búsqueda,
 * meta tags, y ahora el hero) solo quita las etiquetas HTML, no el
 * contenido de dentro de un `<style>`: con un `<style>` real, ese CSS se
 * colaba como texto visible en cualquier sitio que mostrara la descripción
 * en plano. En línea, no hay contenido de texto que filtrar.
 */
const S = {
  wrap: 'font-family: inherit; color: var(--text-muted); line-height: 1.65;',
  lead: 'font-size: 1.02rem; color: var(--text-muted); margin: 0 0 32px;',
  features:
    'list-style: none; margin: 0 0 36px; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 22px 28px;',
  feature: 'display: flex; gap: 14px; align-items: flex-start;',
  featureMarkDot:
    'flex-shrink: 0; width: 6px; height: 6px; margin-top: 9px; border-radius: 50%; background: var(--red);',
  featureMarkIcon: 'flex-shrink: 0; font-size: 20px; line-height: 1; margin-top: 1px;',
  featureTitle: 'font-family: var(--font-display); color: var(--text); font-size: .98rem; margin: 0 0 4px; font-weight: 700;',
  featureText: 'font-size: .88rem; color: var(--text-soft); margin: 0; line-height: 1.55;',
  videos: 'margin: 0 0 36px; max-width: 520px;',
  videosMulti: 'margin: 0 0 36px; display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 16px;',
  video: 'aspect-ratio: 16 / 9; border-radius: var(--radius); overflow: hidden; box-shadow: var(--shadow); background: #000;',
  videoIframe: 'width: 100%; height: 100%; border: 0; display: block;',
  specs: 'margin: 0;',
  specsTitle: 'font-family: var(--font-display); color: var(--text); font-size: 1.05rem; margin: 0 0 14px;',
  specsTable: 'width: 100%; border-collapse: collapse; font-size: .88rem;',
  specsRow: 'border-bottom: 1px solid var(--border);',
  specsRowLast: '',
  specsLabel: 'font-weight: 700; color: var(--text); width: 30%; padding: 11px 4px; vertical-align: top;',
  specsValue: 'color: var(--text-muted); padding: 11px 4px; vertical-align: top;',
};
