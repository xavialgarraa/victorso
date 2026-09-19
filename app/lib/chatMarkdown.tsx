import {Link} from 'react-router';

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
      const isInternal = url.startsWith('/');
      return isInternal ? (
        <Link key={i} to={url} className="chat-msg__link">
          {text}
        </Link>
      ) : (
        <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="chat-msg__link">
          {text}
        </a>
      );
    }

    return part;
  });
}
