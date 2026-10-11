import {Link} from 'react-router';

export type ChatProduct = {
  title: string;
  vendor: string;
  price: string;
  currency: string;
  available: boolean;
  url: string;
  image: string | null;
};

function formatPrice(price: string, currency: string): string {
  const amount = Number(price);
  const formatted = Number.isFinite(amount) ? amount.toFixed(2).replace('.', ',') : price;
  return currency === 'EUR' ? `${formatted}€` : `${formatted} ${currency}`;
}

function ProductCard({product}: {product: ChatProduct}) {
  return (
    <Link to={product.url} className="chat-product-card">
      <span className="chat-product-card__thumb">
        {product.image ? <img src={product.image} alt="" loading="lazy" /> : null}
      </span>
      <span className="chat-product-card__info">
        <span className="chat-product-card__title">{product.title}</span>
        <span className="chat-product-card__row">
          <span className="chat-product-card__price">{formatPrice(product.price, product.currency)}</span>
          {!product.available && <span className="chat-product-card__badge">Agotado</span>}
        </span>
      </span>
      <span className="chat-product-card__arrow" aria-hidden="true">
        →
      </span>
    </Link>
  );
}

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
export function renderChatMarkdown(content: string, products: ChatProduct[] = []): React.ReactNode {
  const productByUrl = new Map(products.map((p) => [p.url, p]));
  // A veces el modelo envuelve el enlace entero en negrita, ej.
  // "**[nombre](url)**" — sin esto, el regex de negrita (que no entiende
  // de corchetes) se lo come primero y los corchetes salen literales en
  // pantalla en vez de convertirse en enlace/tarjeta.
  const unwrapped = content.replace(/\*\*(\[[^\]]+\]\([^)]+\))\*\*/g, '$1');
  const tokenRe = /(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g;
  const parts = unwrapped.split(tokenRe).filter((part) => part !== '');

  return parts.map((part, i) => {
    const boldMatch = /^\*\*([^*]+)\*\*$/.exec(part);
    if (boldMatch) {
      return <strong key={i}>{boldMatch[1]}</strong>;
    }

    const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    if (linkMatch) {
      const [, text, url] = linkMatch;
      const product = productByUrl.get(url);
      if (product) {
        return <ProductCard key={i} product={product} />;
      }

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
