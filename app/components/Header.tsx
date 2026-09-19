import {Suspense, useEffect, useRef, useState} from 'react';
import {Await, Link, NavLink, useAsyncValue} from 'react-router';
import {Image, Money, type CartViewPayload, useAnalytics, useOptimisticCart} from '@shopify/hydrogen';
import type {HeaderQuery, CartApiQueryFragment} from 'storefrontapi.generated';
import {useAside} from '~/components/Aside';
import {Icon, type IconName} from '~/lib/icons';
import {ThemeToggle} from '~/components/ThemeToggle';
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

type Viewport = 'desktop' | 'mobile';

export function Header({header, isLoggedIn, cart}: HeaderProps) {
  const {shop} = header;

  return (
    <>
      <div className="topbar">
        <div className="topbar__inner container">
          <div className="topbar__ship">
            <Icon name="truck" />
            <span>
              Envío gratis Península desde <strong>149€</strong>
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
            <Link className="theme-toggle" to="/account" aria-label="Iniciar sesión">
              <Icon name="user" />
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </div>

      <header className="header">
        <div className="header__inner container">
          <HeaderMenuMobileToggle />
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

        <HeaderMenu viewport="desktop" collections={header.collections.nodes} />
      </header>
    </>
  );
}

type NavCollection = {
  id: string;
  title: string;
  handle: string;
  products: {nodes: Array<{id: string}>};
};

type NavLink = {href: string; label: string; cls?: string; icon?: IconName};

function buildNavLinks(collections: NavCollection[] = []): NavLink[] {
  const collectionLinks: NavLink[] = collections
    // "frontpage" es la colección automática de Shopify con todos los
    // productos; no es una categoría real, ya existe "Todos los productos".
    .filter((c) => c.handle !== 'frontpage' && c.products.nodes.length > 0)
    .map((c) => ({
      href: `/collections/${c.handle}`,
      label: c.title,
      cls: c.handle === 'outlet' ? 'mainnav__outlet' : undefined,
    }));

  return [
    {href: '/', label: 'Inicio'},
    {href: '/marcas', label: 'Nuestras Marcas', cls: 'mainnav__brands', icon: 'star'},
    ...collectionLinks,
    {href: '/quienes-somos', label: 'Quiénes somos'},
  ];
}

export function HeaderMenu({viewport, collections}: {viewport: Viewport; collections?: NavCollection[]}) {
  const {close} = useAside();
  const navLinks = buildNavLinks(collections);

  if (viewport === 'mobile') {
    return (
      <nav className="mobile-menu" role="navigation">
        {navLinks.map((link) => (
          <NavLink
            className={`mobile-menu__item ${link.cls ?? ''}`}
            end
            key={link.href}
            onClick={close}
            prefetch="intent"
            to={link.href}
          >
            {link.icon && <Icon name={link.icon} />} {link.label}
          </NavLink>
        ))}
      </nav>
    );
  }

  return (
    <nav className="mainnav" role="navigation">
      {navLinks.map((link) => (
        <NavLink className={`mainnav__item ${link.cls ?? ''}`} end key={link.href} prefetch="intent" to={link.href}>
          {link.icon && <Icon name={link.icon} />} {link.label}
        </NavLink>
      ))}
    </nav>
  );
}

function HeaderMenuMobileToggle() {
  const {open} = useAside();
  return (
    <button className="burger" aria-label="Abrir menú" onClick={() => open('mobile')}>
      <span></span>
      <span></span>
      <span></span>
    </button>
  );
}

function HeaderSearch() {
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
              placeholder="Buscar productos, marcas..."
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
                <div className="search-suggest__empty">Sin resultados</div>
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
                  Ver todos los resultados
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
