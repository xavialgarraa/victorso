import {Link} from 'react-router';

// Rutas propias de la web: si un enlace del asistente apunta a una de estas
// (con o sin dominio inventado delante, p.ej. "https://victorso.com/products/x"),
// se trata como navegación interna usando solo la ruta, ignorando el dominio.
const INTERNAL_PATH_PREFIXES = [
  '/products/',
  '/collections/',
  '/brand/',
  '/blogs/',
  '/search',
  '/quienes-somos',
  '/instalaciones',
  '/marcas',
  '/cart',
];

function resolveLinkHref(url: string): {to: string; internal: true} | {href: string; internal: false} {
  let pathname = url;
  if (/^https?:\/\//i.test(url)) {
    try {
      pathname = new URL(url).pathname;
    } catch {
      return {href: url, internal: false};
    }
  }

  const isInternal = INTERNAL_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  return isInternal ? {to: pathname, internal: true} : {href: url, internal: false};
}

/**
 * Renderiza un subconjunto mínimo de markdown para los mensajes del
 * asistente: **negrita** y [texto](url) como enlaces reales (internos
 * con <Link>, externos con <a target="_blank">). Suficiente para que
 * las respuestas de Claude se vean bien sin arrastrar una librería de
 * markdown completa.
 */
export function renderChatMarkdown(content: string): React.ReactNode {
  const tokenRe = /(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g;
  const parts = content.split(tokenRe).filter((part) => part !== '');

  return parts.map((part, i) => {
    const boldMatch = /^\*\*([^*]+)\*\*$/.exec(part);
    if (boldMatch) {
      return <strong key={i}>{boldMatch[1]}</strong>;
    }

    const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    if (linkMatch) {
      const [, text, url] = linkMatch;
      const resolved = resolveLinkHref(url);
      return resolved.internal ? (
        <Link key={i} to={resolved.to} className="chat-msg__link">
          {text}
        </Link>
      ) : (
        <a key={i} href={resolved.href} target="_blank" rel="noopener noreferrer" className="chat-msg__link">
          {text}
        </a>
      );
    }

    return part;
  });
}
