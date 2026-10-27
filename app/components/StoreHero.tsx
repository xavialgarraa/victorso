import {Fragment, useEffect, useRef, useState} from 'react';
import {Link} from 'react-router';
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
  priceNode?: React.ReactNode;
  cta: string;
  ctaClass: 'btn--outline' | 'btn--primary';
  /** Solo la imagen, sin badge/texto/botón encima — sigue llevando a
   * "href" al clicar. */
  hideOverlay?: boolean;
};

function HeroPanel({id, slides, intervalMs = 6000}: {id: string; slides: HeroSlide[]; intervalMs?: number}) {
  const [index, setIndex] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const touchStartX = useRef(0);
  const swiped = useRef(false);

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

  if (!slides.length) return null;

  return (
    <div
      className="storehero__panel"
      onMouseEnter={() => timerRef.current && clearInterval(timerRef.current)}
      onMouseLeave={restart}
    >
      <div
        className="storehero__track"
        style={{transform: `translateX(-${index * 100}%)`}}
        onTouchStart={(e) => {
          touchStartX.current = e.touches[0].clientX;
          swiped.current = false;
          if (timerRef.current) clearInterval(timerRef.current);
        }}
        onTouchEnd={(e) => {
          const delta = e.changedTouches[0].clientX - touchStartX.current;
          if (Math.abs(delta) > 40) {
            swiped.current = true;
            show(index + (delta < 0 ? 1 : -1));
          }
          restart();
        }}
      >
        {slides.map((s, i) => {
          const onClickCapture = (e: React.MouseEvent) => {
            if (swiped.current) {
              e.preventDefault();
              swiped.current = false;
            }
          };
          const content = s.hideOverlay ? (
            <img className="storehero__slide-img" src={s.image} alt="" loading="lazy" />
          ) : (
            <>
              <img className="storehero__slide-img" src={s.image} alt="" loading="lazy" />
              {s.badge && <span className={`storehero__badge ${s.badgeClass}`}>{s.badge}</span>}
              <div className="storehero__info">
                <div className="storehero__eyebrow">{s.eyebrow}</div>
                <h2 className="storehero__title">{s.title}</h2>
                {s.priceNode}
                <span className={`btn ${s.ctaClass}`}>{s.cta}</span>
              </div>
            </>
          );
          const className = `storehero__slide${i === index ? ' active' : ''}${s.hideOverlay ? ' storehero__slide--plain' : ''}`;
          return s.external ? (
            <a
              key={s.key}
              className={className}
              href={s.href}
              target="_blank"
              rel="noopener noreferrer"
              onClickCapture={onClickCapture}
            >
              {content}
            </a>
          ) : (
            <Link key={s.key} className={className} to={s.href} onClickCapture={onClickCapture}>
              {content}
            </Link>
          );
        })}
      </div>
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

export type HeroCategory = {id: string; handle: string; title: string; photo: string | null};

export function StoreHero({
  leftSlides,
  rightSlides,
  categories = [],
}: {
  leftSlides: HeroSlide[];
  rightSlides: HeroSlide[];
  categories?: HeroCategory[];
}) {
  const {t} = useI18n();
  // Un único banner apaisado con todas las slides (antes eran dos paneles
  // lado a lado) — el panel admin sigue distinguiendo "izquierda/derecha"
  // al configurar el hero, pero aquí se combinan en un solo carrusel.
  const allSlides = [...leftSlides, ...rightSlides];

  return (
    <section className="storehero">
      {/* Todo menos "sigue bajando" va agrupado en un solo bloque: el
          espacio sobrante del alto mínimo de .storehero se reparte entre
          este bloque y el aviso de abajo (justify-content: space-between
          en .storehero), así "sigue bajando" queda pegado al final de
          verdad en vez de dejar un hueco suelto después de él. */}
      <div className="storehero__content">
        <div className="storehero__grid">
          <HeroPanel id="storeHeroMain" slides={allSlides} />
        </div>

        <div className="storehero__ctaWrap">
          <Link className="storehero__ctaBtn" to="/collections/all">
            <span className="storehero__ctaBtn-text">{t('storeHeroCtaBtn')}</span>
            <span className="storehero__ctaBtn-arrow"><Icon name="arrowRight" /></span>
          </Link>
          <button
            type="button"
            className="storehero__ctaBtn storehero__ctaBtn--outline"
            onClick={() =>
              document.getElementById('categorySection')?.scrollIntoView({behavior: 'smooth', block: 'start'})
            }
          >
            <span className="storehero__ctaBtn-text">{t('storeHeroCatBtn')}</span>
            <span className="storehero__ctaBtn-arrow"><Icon name="arrowRight" /></span>
          </button>
        </div>

        {categories.length > 0 && (
          <div className="storehero__categories">
            <div className="ticker">
              <div className="ticker__track">
                {[0, 1].map((rep) => (
                  <Fragment key={rep}>
                    {categories.map((c) => (
                      <Link key={`${rep}-${c.id}`} className="ticker__cat" to={`/collections/${c.handle}`}>
                        {c.photo && <img src={c.photo} alt="" loading="lazy" />}
                        <span className="ticker__cat-label">{c.title}</span>
                      </Link>
                    ))}
                  </Fragment>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="storehero__scrollhint">
        <span className="storehero__scrollhint-circle"><Icon name="chevronDown" /></span>
        <span className="storehero__scrollhint-text">{t('scrollHint')}</span>
      </div>
    </section>
  );
}
