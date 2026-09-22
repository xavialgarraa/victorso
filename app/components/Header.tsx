import {Suspense, useEffect, useRef, useState} from 'react';
import {Await, Link, NavLink, useAsyncValue, useNavigate} from 'react-router';
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
              <Icon name="chat" />
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
            <span className="lang-select__hint">{l.urlHint}</span>
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

function useNavLinks(collections: NavCollection[] = []): NavLinkData[] {
  const {t} = useI18n();
  const collectionLinks: NavLinkData[] = collections
    // "frontpage" es la colección automática de Shopify con todos los
    // productos; no es una categoría real, ya existe "Todos los productos".
    // "novedades-destacadas-home" es de uso interno (elige qué sale en el
    // hero de la home) y no debe aparecer como categoría navegable.
    // El nombre de estas colecciones viene de Shopify tal cual está en el
    // admin, así que no se traduce con este sistema de idiomas de interfaz.
    .filter(
      (c) =>
        c.handle !== 'frontpage' &&
        c.handle !== 'novedades-destacadas-home' &&
        c.products.nodes.length > 0,
    )
    .map((c) => ({
      href: `/collections/${c.handle}`,
      label: c.title,
      cls: c.handle === 'outlet' ? 'mainnav__outlet' : undefined,
    }));

  return [
    {href: '/', label: t('navHome')},
    {href: '/marcas', label: t('navBrands'), cls: 'mainnav__brands', icon: 'star'},
    ...collectionLinks,
    {href: '/servicio-tecnico', label: t('navServicio'), icon: 'wrench'},
    {href: '/quienes-somos', label: t('navAbout')},
  ];
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
    // si se abre nada mas cargar, con la topbar aun visible).
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
      {navLinks.map((link) => (
        <NavLink
          className={`mainnav__item ${link.cls ?? ''}`}
          end
          key={link.href}
          prefetch="intent"
          to={link.href}
          onClick={(e) => handleLinkClick(e, link.href)}
        >
          {link.icon && <Icon name={link.icon} />} {link.label}
        </NavLink>
      ))}
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

  return (
    <div className="search-wrap" onBlur={(e) => {
      if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
    }}>
      <SearchFormPredictive className="search">
        {({fetchResults, goToSearch, inputRef}) => (
          <>
            <input
              name="q"
              type="search"
              placeholder={t('searchPlaceholder')}
              aria-label="Buscar"
              ref={inputRef}
              onChange={(e) => {
                setOpen(Boolean(e.target.value));
                fetchResults(e);
              }}
              onFocus={(e) => setOpen(Boolean(e.target.value))}
            />
            <button type="submit" aria-label="Buscar" onClick={goToSearch}>
              <Icon name="search" />
            </button>
          </>
        )}
      </SearchFormPredictive>

      <div className={`search-suggest${open ? ' open' : ''}`}>
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
                {items.products.slice(0, 6).map((product) => {
                  const price = product.selectedOrFirstAvailableVariant?.price;
                  const image = product.selectedOrFirstAvailableVariant?.image;
                  return (
                    <Link
                      key={product.id}
                      to={`/products/${product.handle}`}
                      className="search-suggest__item"
                      onClick={() => {
                        closeSearch();
                        setOpen(false);
                      }}
                    >
                      {image && <Image data={image} width={34} height={34} />}
                      <span className="search-suggest__title">{product.title}</span>
                      {price && <span className="search-suggest__price"><Money data={price} /></span>}
                    </Link>
                  );
                })}
                <Link
                  className="search-suggest__all"
                  to={`${SEARCH_ENDPOINT}?q=${term.current}`}
                  onClick={() => {
                    closeSearch();
                    setOpen(false);
                  }}
                >
                  {t('searchSeeAll')}
                </Link>
              </>
            );
          }}
        </SearchResultsPredictive>
      </div>
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
