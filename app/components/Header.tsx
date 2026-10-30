import {Suspense, useEffect, useRef, useState} from 'react';
import {Await, Link, NavLink, useAsyncValue, useFetcher, useLocation, useNavigate} from 'react-router';
import {Image, Money, type CartViewPayload, useAnalytics, useOptimisticCart} from '@shopify/hydrogen';
import type {HeaderQuery, CartApiQueryFragment} from 'storefrontapi.generated';
import {useAside} from '~/components/Aside';
import {Icon, type IconName} from '~/lib/icons';
import {ThemeToggle} from '~/components/ThemeToggle';
import {LOCALES, useI18n, type LocaleCode} from '~/lib/i18n';
import {
  SEARCH_ENDPOINT,
  SearchFormPredictive,
} from '~/components/SearchFormPredictive';
import {SearchResultsPredictive} from '~/components/SearchResultsPredictive';
import type {PopularProduct} from '~/routes/api.popular-products';

interface HeaderProps {
  header: HeaderQuery;
  cart: Promise<CartApiQueryFragment | null>;
  isLoggedIn: Promise<boolean>;
  publicStoreDomain: string;
}

export function Header({header, isLoggedIn, cart}: HeaderProps) {
  const {shop} = header;
  const {t} = useI18n();
  const mainNav = useMainNav();

  return (
    <>
      <div className="topbar">
        <div className="topbar__inner container">
          <div className="topbar__ship">
            <Icon name="truck" />
            <span>
              {t('shipBar')} <strong>149€</strong>
            </span>
          </div>
          <div className="topbar__contact">
            <a href="tel:+34972364114">
              <Icon name="phone" />
              972 364 114
            </a>
            <a href="https://wa.me/34619406443" target="_blank" rel="noopener noreferrer">
              <Icon name="whatsapp" />
              WhatsApp
            </a>
            <LangSelect />
            <Link className="theme-toggle" to="/account" aria-label={t('loginCta')}>
              <Icon name="user" />
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </div>

      <header className="header">
        <div className="header__inner container">
          <Burger state={mainNav.state} toggleBurger={mainNav.toggleBurger} />
          <Link to="/" className="logo" prefetch="intent">
            <img
              className="logo__full"
              src="https://www.victorso.com/victorso/uploads/imagenes/logos/Logo_WEB_Blanco2.png"
              alt={shop.name}
              width={186}
              height={44}
            />
            <img
              className="logo__compact"
              src="/assets/logo-icon.png"
              alt={shop.name}
              width={36}
              height={30}
            />
          </Link>

          <div className="header__right">
            <HeaderSearch />
            <nav className="header__actions">
              <CartToggle cart={cart} />
            </nav>
          </div>
        </div>
        <MainNavPanel
          collections={header.collections.nodes}
          state={mainNav.state}
          top={mainNav.top}
          closeNav={mainNav.closeNav}
          handleLinkClick={mainNav.handleLinkClick}
        />
      </header>
    </>
  );
}

function LangSelect() {
  const {locale, setLocale} = useI18n();
  const [open, setOpen] = useState(false);

  return (
    <div className="lang-select" onBlur={(e) => {
      if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
    }}>
      <button
        type="button"
        className="lang-select__btn"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="lang-select__flag"><img src={LOCALES[locale].flag} alt="" width={18} height={18} /></span>
        <span>{locale.toUpperCase()}</span>
        <span className="icon"><Icon name="chevronDown" /></span>
      </button>
      <ul className={`lang-select__menu${open ? ' open' : ''}`} role="listbox">
        {Object.entries(LOCALES).map(([code, l]) => (
          <li
            key={code}
            role="option"
            aria-selected={code === locale}
            className={code === locale ? 'active' : ''}
            onMouseDown={(e) => {
              // mousedown se dispara antes que el blur del boton, que si no
              // cerraria el menu (desmontando el <li>) antes de que llegue
              // el click.
              e.preventDefault();
              setLocale(code as LocaleCode);
              setOpen(false);
            }}
          >
            <span className="lang-select__flag"><img src={l.flag} alt="" width={18} height={18} /></span>
            <span className="lang-select__name">{l.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

type NavCollection = {
  id: string;
  title: string;
  handle: string;
  products: {nodes: Array<{id: string}>};
};

type NavLinkData = {href: string; label: string; cls?: string; icon?: IconName};
type NavEntry =
  | ({type: 'link'} & NavLinkData)
  | {type: 'dropdown'; label: string; items: Array<{href: string; label: string}>};

// Handles que se quedan como item propio en la barra, fuera del
// desplegable "Categorías" — no son una categoría de producto más, son
// secciones especiales (ofertas, marca insignia de la tienda).
const NAV_STANDALONE_HANDLES = ['outlet', 'pioneer-dj-alphatheta'];

function useNavLinks(collections: NavCollection[] = []): NavEntry[] {
  const {t} = useI18n();
  // "frontpage" es la colección automática de Shopify con todos los
  // productos; no es una categoría real, ya existe "Todos los productos".
  // "novedades-destacadas-home" es de uso interno (elige qué sale en el
  // hero de la home) y no debe aparecer como categoría navegable.
  // El nombre de estas colecciones viene de Shopify tal cual está en el
  // admin, así que no se traduce con este sistema de idiomas de interfaz.
  const realCollections = collections.filter(
    (c) =>
      c.handle !== 'frontpage' &&
      c.handle !== 'novedades-destacadas-home' &&
      c.products.nodes.length > 0,
  );

  const standalone = NAV_STANDALONE_HANDLES.map((handle) =>
    realCollections.find((c) => c.handle === handle),
  ).filter((c): c is NavCollection => Boolean(c));

  // El resto de categorías se agrupan bajo "Categorías" para que la barra
  // no se alargue sin control cuando se añaden colecciones nuevas.
  const categoryItems = realCollections
    .filter((c) => !NAV_STANDALONE_HANDLES.includes(c.handle))
    .map((c) => ({href: `/collections/${c.handle}`, label: c.title}));

  const entries: NavEntry[] = [
    {type: 'link', href: '/', label: t('navHome')},
    {type: 'link', href: '/marcas', label: t('navBrands'), cls: 'mainnav__brands', icon: 'star'},
  ];
  if (categoryItems.length > 0) {
    entries.push({type: 'dropdown', label: t('navCategories'), items: categoryItems});
  }
  for (const c of standalone) {
    entries.push({
      type: 'link',
      href: `/collections/${c.handle}`,
      label: c.title,
      cls: c.handle === 'outlet' ? 'mainnav__outlet' : undefined,
    });
  }
  entries.push({type: 'link', href: '/servicio-tecnico', label: t('navServicio'), icon: 'wrench'});
  entries.push({type: 'link', href: '/quienes-somos', label: t('navAbout')});

  return entries;
}

type NavState = 'closed' | 'open' | 'closing';

/** Estado compartido del menu unificado: fila horizontal en desktop, panel a
 * pantalla completa en movil (misma etiqueta #mainNav/.mainnav que en el
 * demo), sin usar el patron de Aside/cajon lateral. El burger vive dentro de
 * header__inner y el panel <nav> como fila propia debajo, igual que en el
 * demo — por eso el estado se comparte via hook en vez de anidar uno dentro
 * del otro. */
function useMainNav() {
  const navigate = useNavigate();
  const [state, setState] = useState<NavState>('closed');
  const [top, setTop] = useState<string>();
  const headerElRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    headerElRef.current = document.querySelector('.header');
  }, []);

  useEffect(() => {
    document.body.classList.toggle('nav-open', state === 'open');
  }, [state]);

  function closeNav() {
    setState((s) => (s === 'open' ? 'closing' : s));
    setTimeout(() => setState((s) => (s === 'closing' ? 'closed' : s)), 220);
  }

  function toggleBurger() {
    if (state === 'open') {
      closeNav();
      return;
    }
    // Usa la posicion real del header (puede no estar aun "pegado" arriba
    // si se abre nada mas cargar, con la topbar aun visible) — el menú
    // vuelve a quedarse por debajo del header en vez de a pantalla
    // completa (eso hacía que el botón de cerrar, que vive en el propio
    // header, se solapara con "Inicio"). El scroll de la página detrás
    // sigue bloqueado mientras está abierto (body.nav-open).
    const rect = headerElRef.current?.getBoundingClientRect();
    if (rect) setTop(`${rect.bottom}px`);
    setState('open');
  }

  function handleLinkClick(e: React.MouseEvent<HTMLAnchorElement>, href: string) {
    if (state !== 'open') return;
    e.preventDefault();
    closeNav();
    setTimeout(() => navigate(href), 220);
  }

  return {state, top, toggleBurger, closeNav, handleLinkClick};
}

function Burger({state, toggleBurger}: {state: NavState; toggleBurger: () => void}) {
  return (
    <button
      type="button"
      className={`burger${state === 'open' ? ' open' : ''}`}
      aria-label={state === 'open' ? 'Cerrar menú' : 'Abrir menú'}
      onClick={toggleBurger}
    >
      <span></span>
      <span></span>
      <span></span>
    </button>
  );
}

/** Agrupa categorías bajo un solo item de la barra ("Categorías ▾") en vez
 * de una por una — en desktop se abre al pasar el ratón o al hacer click
 * (para que funcione también con teclado/touch), en el panel móvil a
 * pantalla completa se abre/cierra igual pero en línea, como un acordeón. */
function NavDropdown({
  label,
  items,
  handleLinkClick,
}: {
  label: string;
  items: Array<{href: string; label: string}>;
  handleLinkClick: (e: React.MouseEvent<HTMLAnchorElement>, href: string) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="mainnav__dropdown"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <button
        type="button"
        className="mainnav__item mainnav__dropdown-trigger"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {label} <Icon name="chevronDown" />
      </button>
      <div className={`mainnav__dropdown-panel${open ? ' open' : ''}`}>
        {items.map((item) => (
          <NavLink
            key={item.href}
            className="mainnav__dropdown-link"
            end
            prefetch="intent"
            to={item.href}
            onClick={(e) => {
              setOpen(false);
              handleLinkClick(e, item.href);
            }}
          >
            {item.label}
          </NavLink>
        ))}
      </div>
    </div>
  );
}

function MainNavPanel({
  collections,
  state,
  top,
  closeNav,
  handleLinkClick,
}: {
  collections?: NavCollection[];
  state: NavState;
  top?: string;
  closeNav: () => void;
  handleLinkClick: (e: React.MouseEvent<HTMLAnchorElement>, href: string) => void;
}) {
  const navLinks = useNavLinks(collections);
  const {locale, setLocale} = useI18n();
  const isOpenish = state === 'open' || state === 'closing';

  return (
    <nav
      className={`mainnav${state === 'open' ? ' open' : ''}${state === 'closing' ? ' closing' : ''}`}
      role="navigation"
      style={isOpenish ? {top} : undefined}
      onClick={(e) => {
        if (e.target === e.currentTarget) closeNav();
      }}
    >
      {navLinks.map((entry) =>
        entry.type === 'dropdown' ? (
          <NavDropdown key={entry.label} label={entry.label} items={entry.items} handleLinkClick={handleLinkClick} />
        ) : (
          <NavLink
            className={`mainnav__item ${entry.cls ?? ''}`}
            end
            key={entry.href}
            prefetch="intent"
            to={entry.href}
            onClick={(e) => handleLinkClick(e, entry.href)}
          >
            {entry.icon && <Icon name={entry.icon} />} {entry.label}
          </NavLink>
        ),
      )}
      <div className="mainnav__utils">
        <select
          className="mainnav__lang-select"
          aria-label="Idioma"
          value={locale}
          onChange={(e) => setLocale(e.target.value as LocaleCode)}
        >
          {Object.entries(LOCALES).map(([code, l]) => (
            <option key={code} value={code}>
              {l.label}
            </option>
          ))}
        </select>
        <ThemeToggle className="mainnav__theme" showLabel />
      </div>
    </nav>
  );
}

function HeaderSearch() {
  const {t} = useI18n();
  const [open, setOpen] = useState(false);
  // "active" = overlay de pantalla completa abierto, en cualquier tamaño
  // de pantalla (antes solo pasaba en móvil; ahora también en escritorio,
  // con "Productos populares" sugeridos antes de escribir nada).
  const [active, setActive] = useState(false);
  const location = useLocation();
  const popularFetcher = useFetcher<{products: PopularProduct[]}>();

  useEffect(() => {
    document.body.classList.toggle('search-open', active);
    return () => document.body.classList.remove('search-open');
  }, [active]);

  // Cierra el buscador al navegar (buscar con Enter, tocar una sugerencia,
  // una popular, o "ver todos los resultados").
  useEffect(() => {
    setActive(false);
    setOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname, location.search]);

  function openOverlay() {
    setActive(true);
    if (popularFetcher.state === 'idle' && !popularFetcher.data) {
      popularFetcher.load('/api/popular-products');
    }
  }

  function closeOverlay() {
    setActive(false);
    setOpen(false);
  }

  // Para abrir el buscador desde fuera (ej. el botón "Buscar" de la barra
  // inferior en móvil), sin tener que levantar este estado más arriba.
  useEffect(() => {
    function onOpenSearch() {
      openOverlay();
    }
    window.addEventListener('open-search-overlay', onOpenSearch);
    return () => window.removeEventListener('open-search-overlay', onOpenSearch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!active) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') closeOverlay();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const popularProducts = popularFetcher.data?.products ?? [];

  return (
    <div className="search-wrap">
      {/* Botón, no input: el input de verdad solo existe dentro del modal,
          para no duplicar el mismo campo en dos sitios a la vez. */}
      <button type="button" className="search search-trigger" onClick={openOverlay} aria-label="Buscar">
        <Icon name="search" />
        <span className="search-trigger__placeholder">{t('searchPlaceholder')}</span>
      </button>

      {active && (
        <div className="search-backdrop" onClick={closeOverlay}>
          <div className="search-modal" onClick={(e) => e.stopPropagation()}>
            <div className="search-modal__topbar">
              <SearchFormPredictive className="search search-modal__form">
                {({fetchResults, inputRef}) => (
                  <>
                    <Icon name="search" className="search-modal__lead-icon" />
                    <input
                      name="q"
                      type="search"
                      placeholder={t('searchPlaceholder')}
                      aria-label="Buscar"
                      autoComplete="off"
                      autoFocus
                      ref={inputRef}
                      onChange={(e) => {
                        setOpen(Boolean(e.target.value));
                        fetchResults(e);
                      }}
                    />
                    {/* type="submit": el Enter del teclado y este botón
                        hacen lo mismo (envían el <form>, que ya navega a
                        /search — ver SearchFormPredictive). */}
                    <button type="submit" aria-label="Buscar" onClick={closeOverlay}>
                      <Icon name="search" />
                    </button>
                    {/* Abre el asistente de IA ya existente (burbuja de
                        chat), pasándole lo que haya escrito como primera
                        pregunta — no es un buscador aparte, es el mismo. */}
                    <button
                      type="button"
                      className="search-ai-btn"
                      onClick={() => {
                        const query = inputRef.current?.value ?? '';
                        window.dispatchEvent(new CustomEvent('open-chat-assistant', {detail: {query}}));
                        closeOverlay();
                      }}
                    >
                      <Icon name="sparkle" />
                      <span>{t('searchAiMode')}</span>
                    </button>
                  </>
                )}
              </SearchFormPredictive>
              <button type="button" className="search-modal__close" aria-label="Cerrar buscador" onClick={closeOverlay}>
                <Icon name="close" />
              </button>
            </div>
            <p className="search-ai-hint">{t('searchAiHint')}</p>

            <div className="search-overlay-body">
          {open ? (
            <SearchResultsPredictive>
              {({items, total, term, state, closeSearch}) => {
                if (!total) {
                  if (state === 'loading' && term.current) {
                    return <div className="search-suggest__empty">Buscando…</div>;
                  }
                  return term.current ? (
                    <div className="search-suggest__empty">{t('searchNoMatches')}</div>
                  ) : null;
                }
                return (
                  <>
                    <div className="search-cards">
                      {items.products.slice(0, 10).map((product) => {
                        const price = product.selectedOrFirstAvailableVariant?.price;
                        const image = product.selectedOrFirstAvailableVariant?.image;
                        return (
                          <Link
                            key={product.id}
                            to={`/products/${product.handle}`}
                            className="search-card"
                            onClick={() => {
                              closeSearch();
                              closeOverlay();
                            }}
                          >
                            <div className="search-card__imgwrap">
                              {image && <Image data={image} width={160} height={160} />}
                            </div>
                            <span className="search-card__title">{product.title}</span>
                            {price && (
                              <span className="search-card__price">
                                <Money data={price} />
                              </span>
                            )}
                          </Link>
                        );
                      })}
                    </div>
                    <Link
                      className="search-suggest__all"
                      to={`${SEARCH_ENDPOINT}?q=${term.current}`}
                      onClick={() => {
                        closeSearch();
                        closeOverlay();
                      }}
                    >
                      {t('searchSeeAll')}
                    </Link>
                  </>
                );
              }}
            </SearchResultsPredictive>
          ) : (
            popularProducts.length > 0 && (
              <div className="search-popular">
                <h4>{t('searchPopularTitle')}</h4>
                <div className="search-cards search-cards--scroll">
                  {popularProducts.map((product) => (
                    <Link
                      key={product.handle}
                      to={`/products/${product.handle}`}
                      className="search-card"
                      onClick={closeOverlay}
                    >
                      <div className="search-card__imgwrap">
                        {product.image && <img src={product.image} alt="" width={160} height={160} />}
                      </div>
                      <span className="search-card__title">{product.title}</span>
                      <span className="search-card__price">
                        {new Intl.NumberFormat('es-ES', {style: 'currency', currency: product.currency}).format(
                          product.price,
                        )}
                      </span>
                    </Link>
                  ))}
                </div>
              </div>
            )
          )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CartBadge({count}: {count: number}) {
  const {open} = useAside();
  const {publish, shop, cart, prevCart} = useAnalytics();
  const [bump, setBump] = useState(false);
  const prevCountRef = useRef(count);

  useEffect(() => {
    if (count > prevCountRef.current) {
      setBump(true);
      const timeout = setTimeout(() => setBump(false), 400);
      prevCountRef.current = count;
      return () => clearTimeout(timeout);
    }
    prevCountRef.current = count;
  }, [count]);

  return (
    <a
      href="/cart"
      className={`cart-btn${bump ? ' bump' : ''}`}
      onClick={(e) => {
        e.preventDefault();
        open('cart');
        publish('cart_viewed', {
          cart,
          prevCart,
          shop,
          url: window.location.href || '',
        } as CartViewPayload);
      }}
    >
      <Icon name="cart" />
      <span className={`cart-btn__count${bump ? ' bump' : ''}`}>{count}</span>
    </a>
  );
}

function CartToggle({cart}: Pick<HeaderProps, 'cart'>) {
  return (
    <Suspense fallback={<CartBadge count={0} />}>
      <Await resolve={cart}>
        <CartBanner />
      </Await>
    </Suspense>
  );
}

function CartBanner() {
  const originalCart = useAsyncValue() as CartApiQueryFragment | null;
  const cart = useOptimisticCart(originalCart);
  return <CartBadge count={cart?.totalQuantity ?? 0} />;
}
