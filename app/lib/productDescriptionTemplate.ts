/**
 * Genera el HTML de la pestaña "Descripción" de un producto siguiendo el
 * sistema de diseño real de la web (variables CSS ya definidas en
 * app.css), para que se adapte solo al modo claro/oscuro y no duplique el
 * título del producto (que ya se muestra arriba en la ficha).
 */

export type DescriptionFeature = {icon: string; title: string; text: string};
export type DescriptionSpec = {label: string; value: string};

export type DescriptionInput = {
  intro: string;
  features: DescriptionFeature[];
  videoUrl: string;
  specs: DescriptionSpec[];
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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
  const youtubeId = extractYoutubeId(input.videoUrl);

  const parts: string[] = [];
  parts.push('<div class="ps-wrap">');
  parts.push(PRODUCT_DESCRIPTION_STYLE);

  if (intro) {
    parts.push(`  <p class="ps-lead">${escapeHtml(intro)}</p>`);
  }

  if (features.length > 0) {
    parts.push('  <div class="ps-features">');
    for (const f of features) {
      parts.push('    <div class="ps-card">');
      if (f.icon.trim()) parts.push(`      <span class="ps-card-icon">${escapeHtml(f.icon.trim())}</span>`);
      parts.push(`      <h3>${escapeHtml(f.title)}</h3>`);
      parts.push(`      <p>${escapeHtml(f.text)}</p>`);
      parts.push('    </div>');
    }
    parts.push('  </div>');
  }

  if (youtubeId) {
    parts.push('  <section class="ps-video-section">');
    parts.push('    <div class="ps-video-container">');
    parts.push(
      `      <iframe src="https://www.youtube-nocookie.com/embed/${escapeHtml(youtubeId)}?rel=0" title="Vídeo del producto" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>`,
    );
    parts.push('    </div>');
    parts.push('  </section>');
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

const PRODUCT_DESCRIPTION_STYLE = `  <style>
    .ps-wrap { font-family: inherit; color: var(--text-muted); line-height: 1.65; }
    .ps-wrap h2, .ps-wrap h3 { font-family: var(--font-display); color: var(--text); }
    .ps-lead { font-size: 1rem; color: var(--text-muted); max-width: 70ch; margin: 0 0 32px; }
    .ps-features { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 16px; margin: 0 0 40px; }
    .ps-card { background: var(--surface-alt); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; }
    .ps-card-icon { font-size: 22px; margin-bottom: 10px; display: block; }
    .ps-card h3 { font-size: 1rem; margin: 0 0 6px; font-weight: 700; }
    .ps-card p { font-size: .88rem; color: var(--text-soft); margin: 0; line-height: 1.55; }
    .ps-video-section { margin: 40px 0; }
    .ps-video-container { width: 100%; aspect-ratio: 16 / 9; border-radius: var(--radius); overflow: hidden; box-shadow: var(--shadow-lg); background: #000; }
    .ps-video-container iframe { width: 100%; height: 100%; border: 0; display: block; }
    .ps-specs { margin: 40px 0 0; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 24px; }
    .ps-specs h2 { font-size: 1.2rem; margin: 0 0 16px; border-bottom: 1px solid var(--border); padding-bottom: 12px; }
    .ps-specs table { width: 100%; border-collapse: collapse; font-size: .88rem; }
    .ps-specs tr { border-bottom: 1px solid var(--border); }
    .ps-specs tr:last-child { border-bottom: none; }
    .ps-specs td { padding: 12px 8px; vertical-align: top; }
    .ps-specs td:first-child { font-weight: 700; color: var(--text); width: 32%; }
    .ps-specs td:last-child { color: var(--text-muted); }
    @media (max-width: 640px) {
      .ps-specs tr { display: flex; flex-direction: column; padding: 8px 0; }
      .ps-specs td:first-child { width: 100%; padding-bottom: 2px; }
      .ps-specs td:last-child { width: 100%; padding-top: 0; }
    }
  </style>`;
