import {useEffect, useRef, useState} from 'react';
import {Link} from 'react-router';
import {AddToCartButton} from '~/components/AddToCartButton';
import {useAside} from '~/components/Aside';
import {Icon} from '~/lib/icons';
import {useI18n} from '~/lib/i18n';

export type HeroSlide = {
  key: string;
  href: string;
  external?: boolean;
  image: string;
  badge: string;
  badgeClass: 'storehero__badge--new' | 'storehero__badge--offer' | 'storehero__badge--brand';
  eyebrow: string;
  title: string;
  description?: string;
  /** Logo de marca (del vendor del producto vinculado), arriba a la
   * derecha del slide — null si no hay marca reconocida con logo. */
  brandLogo?: string | null;
  priceNode?: React.ReactNode;
  cta: string;
  ctaClass: 'btn--outline' | 'btn--primary';
  /** Si el slide está vinculado a un producto en stock, mostramos un botón
   * "Añadir al carrito" directo en vez del cta de "Descúbrelo". */
  addToCart?: {merchandiseId: string};
  /** Solo la imagen, sin badge/texto/botón encima — sigue llevando a
   * "href" al clicar. */
  hideOverlay?: boolean;
  /** "banner" (panorámico) o "caratula" (menos panorámico, para fotos de
   * producto/contacto). Si no se pone explícitamente, se detecta solo:
   * cualquier slide con precio o botón de añadir al carrito se trata como
   * carátula (ver className más abajo). */
  cardSize?: 'banner' | 'caratula';
};

function HeroPanel({id, slides, intervalMs = 6000}: {id: string; slides: HeroSlide[]; intervalMs?: number}) {
  const {t} = useI18n();
  const {open} = useAside();
  const [index, setIndex] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const touchStartX = useRef(0);
  const swiped = useRef(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const slideRefs = useRef<Array<HTMLElement | null>>([]);
  // En móvil no hay ":hover" — los puntos/flechas solo se enseñan mientras
  // se está tocando el carrusel (y un momento después, para que dé tiempo
  // a ver dónde ha quedado), luego se ocultan solos.
  const [touching, setTouching] = useState(false);
  const touchHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cada slide se posiciona de forma independiente (position:absolute) en
  // vez de ir todos en fila empujando el alto del contenedor — si no, un
  // banner fino (ratio muy panorámico) se estira a la altura del slide más
  // alto del carrusel en vez de quedarse fino de verdad. El panel copia
  // aquí el aspect-ratio ya resuelto (por CSS, según el punto de corte) del
  // slide activo, así su alto siempre es el correcto para ESE slide.
  useEffect(() => {
    function syncHeight() {
      const el = slideRefs.current[index];
      if (!el || !panelRef.current) return;
      const style = getComputedStyle(el);
      if (style.aspectRatio && style.aspectRatio !== 'auto') panelRef.current.style.aspectRatio = style.aspectRatio;
      // maxHeight también se copia del slide activo — las carátulas
      // (--caratula) usan un ratio menos panorámico que necesita más alto
      // para no recortarse, así que llevan su propio tope (ver app.css)
      // en vez del del banner.
      if (style.maxHeight && style.maxHeight !== 'none') panelRef.current.style.maxHeight = style.maxHeight;
    }
    syncHeight();
    window.addEventListener('resize', syncHeight);
    return () => window.removeEventListener('resize', syncHeight);
  }, [index]);

  function show(i: number) {
    setIndex(((i % slides.length) + slides.length) % slides.length);
  }

  function restart() {
    if (timerRef.current) clearInterval(timerRef.current);
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }
    timerRef.current = setInterval(() => show(index + 1), intervalMs);
  }

  useEffect(() => {
    restart();
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  useEffect(() => {
    return () => {
      if (touchHideTimer.current) clearTimeout(touchHideTimer.current);
    };
  }, []);

  if (!slides.length) return null;

  return (
    <div
      ref={panelRef}
      className={`storehero__panel${touching ? ' storehero__panel--touching' : ''}`}
      onMouseEnter={() => timerRef.current && clearInterval(timerRef.current)}
      onMouseLeave={restart}
    >
      <div
        className="storehero__track"
        onTouchStart={(e) => {
          touchStartX.current = e.touches[0].clientX;
          swiped.current = false;
          if (timerRef.current) clearInterval(timerRef.current);
          if (touchHideTimer.current) clearTimeout(touchHideTimer.current);
          setTouching(true);
        }}
        onTouchEnd={(e) => {
          const delta = e.changedTouches[0].clientX - touchStartX.current;
          if (Math.abs(delta) > 40) {
            swiped.current = true;
            show(index + (delta < 0 ? 1 : -1));
          }
          restart();
          if (touchHideTimer.current) clearTimeout(touchHideTimer.current);
          touchHideTimer.current = setTimeout(() => setTouching(false), 1600);
        }}
      >
        {slides.map((s, i) => {
          const onClickCapture = (e: React.MouseEvent) => {
            if (swiped.current) {
              e.preventDefault();
              swiped.current = false;
            }
          };
          // "Carátula" (vinculado a mano con esa proporción elegida, o
          // puesto por el relleno automático de novedad/más vendido/
          // contacto/visítanos) — si no viene marcado explícitamente, se
          // detecta solo: cualquier slide con precio o botón de añadir al
          // carrito se trata igual. Sus fotos suelen ser de producto (o
          // de la tienda), no panorámicas como un banner diseñado, así
          // que usan su propio ratio fijo (ver --caratula en app.css).
          const isCaratula = s.cardSize ? s.cardSize === 'caratula' : Boolean(s.priceNode) || Boolean(s.addToCart);
          const className = `storehero__slide${i === index ? ' active' : ''}${s.hideOverlay ? ' storehero__slide--plain' : ''}${isCaratula ? ' storehero__slide--caratula' : ''}`;
          const slideStyle = {transform: `translateX(${(i - index) * 100}%)`};
          const setRef = (el: HTMLElement | null) => {
            slideRefs.current[i] = el;
          };

          if (s.hideOverlay) {
            // Sin texto ni botón: el slide entero es un único enlace.
            return s.external ? (
              <a key={s.key} ref={setRef} className={className} style={slideStyle} href={s.href} target="_blank" rel="noopener noreferrer" onClickCapture={onClickCapture}>
                <img className="storehero__slide-img" src={s.image} alt="" loading="lazy" />
              </a>
            ) : (
              <Link key={s.key} ref={setRef} className={className} style={slideStyle} to={s.href} onClickCapture={onClickCapture}>
                <img className="storehero__slide-img" src={s.image} alt="" loading="lazy" />
              </Link>
            );
          }

          // Con texto y botón: el fondo es un enlace a pantalla completa y
          // el título lleva su propio enlace — así el botón "Añadir al
          // carrito" puede ser un <button>/<form> real sin quedar anidado
          // dentro de un <a> (HTML inválido y conflictos de click).
          const bgProps = {className: 'storehero__bglink', onClickCapture, 'aria-label': s.title};
          const titleProps = {className: 'storehero__titleLink', onClickCapture};
          return (
            <div key={s.key} ref={setRef} className={className} style={slideStyle}>
              {s.external ? (
                <a {...bgProps} href={s.href} target="_blank" rel="noopener noreferrer" />
              ) : (
                <Link {...bgProps} to={s.href} />
              )}
              <img className="storehero__slide-img" src={s.image} alt="" loading="lazy" />
              {s.badge && <span className={`storehero__badge ${s.badgeClass}`}>{s.badge}</span>}
              {s.brandLogo && (
                <span className="storehero__brandlogo">
                  <img src={s.brandLogo} alt="" loading="lazy" />
                </span>
              )}
              <div className="storehero__info">
                <div className="storehero__eyebrow">{s.eyebrow}</div>
                <h2 className="storehero__title">
                  {s.external ? (
                    <a {...titleProps} href={s.href} target="_blank" rel="noopener noreferrer">{s.title}</a>
                  ) : (
                    <Link {...titleProps} to={s.href}>{s.title}</Link>
                  )}
                </h2>
                {s.description && <p className="storehero__desc">{s.description}</p>}
                {s.priceNode}
                <div className="storehero__ctaRow">
                  {s.addToCart ? (
                    <AddToCartButton
                      className="btn btn--primary storehero__addbtn"
                      lines={[{merchandiseId: s.addToCart.merchandiseId, quantity: 1}]}
                      onClick={() => open('cart')}
                    >
                      <Icon name="cart" /> {t('storeHeroAddToCart')}
                    </AddToCartButton>
                  ) : s.external ? (
                    <a className={`btn ${s.ctaClass}`} href={s.href} target="_blank" rel="noopener noreferrer">{s.cta}</a>
                  ) : (
                    <Link className={`btn ${s.ctaClass}`} to={s.href}>{s.cta}</Link>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {slides.length > 1 && (
        <>
          <button
            type="button"
            className="storehero__arrow storehero__arrow--prev"
            aria-label={t('storeHeroPrevSlide')}
            onClick={() => {
              show(index - 1);
              restart();
            }}
          >
            <Icon name="chevronLeft" />
          </button>
          <button
            type="button"
            className="storehero__arrow storehero__arrow--next"
            aria-label={t('storeHeroNextSlide')}
            onClick={() => {
              show(index + 1);
              restart();
            }}
          >
            <Icon name="chevronRight" />
          </button>
        </>
      )}
      {slides.length > 1 && (
        <div className="storehero__dots">
          {slides.map((s, i) => (
            <button
              key={s.key}
              className={`storehero__dot${i === index ? ' active' : ''}`}
              aria-label={`${i + 1}`}
              onClick={() => {
                show(i);
                restart();
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function StoreHero({leftSlides, rightSlides}: {leftSlides: HeroSlide[]; rightSlides: HeroSlide[]}) {
  // Un único banner apaisado con todas las slides (antes eran dos paneles
  // lado a lado) — el panel admin sigue distinguiendo "izquierda/derecha"
  // al configurar el hero, pero aquí se combinan en un solo carrusel.
  const allSlides = [...leftSlides, ...rightSlides];

  const {t} = useI18n();

  if (!allSlides.length) return null;

  return (
    <section className="storehero">
      <HeroPanel id="storeHeroMain" slides={allSlides} />
      <div className="storehero__trustbar" aria-label={t('storeHeroTrustbarLabel')}>
        <div className="storehero__trustitem">
          <Icon name="truck" />
          <span className="storehero__trustcopy">
            <strong>{t('storeHeroPerkShip')}</strong>
            <small>{t('storeHeroPerkShipText')}</small>
          </span>
        </div>
        <div className="storehero__trustitem">
          <Icon name="shield" />
          <span className="storehero__trustcopy">
            <strong>{t('storeHeroPerkWarranty')}</strong>
            <small>{t('storeHeroPerkWarrantyText')}</small>
          </span>
        </div>
        <div className="storehero__trustitem">
          <Icon name="headphones" />
          <span className="storehero__trustcopy">
            <strong>{t('storeHeroPerkSupport')}</strong>
            <small>{t('storeHeroPerkSupportText')}</small>
          </span>
        </div>
        <div className="storehero__trustitem">
          <Icon name="card" />
          <span className="storehero__trustcopy">
            <strong>{t('storeHeroPerkPay')}</strong>
            <small>{t('storeHeroPerkPayText')}</small>
          </span>
        </div>
      </div>
    </section>
  );
}
