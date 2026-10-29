import {Link, useLocation} from 'react-router';
import {useAside} from '~/components/Aside';
import {Icon} from '~/lib/icons';
import {useI18n} from '~/lib/i18n';

/** Barra de navegación fija abajo, solo en móvil — accesos directos a lo
 * que más se usa (home, categorías, buscador, cuenta, carrito) sin tener
 * que abrir el menú hamburguesa. */
export function BottomNav() {
  const {t} = useI18n();
  const {open} = useAside();
  const {pathname} = useLocation();

  const isHome = pathname === '/';
  const isOutlet = pathname.startsWith('/collections/outlet');

  return (
    <nav className="bottomnav" aria-label={t('bottomNavLabel')}>
      <Link to="/" className={`bottomnav__item${isHome ? ' active' : ''}`}>
        <Icon name="home" />
        {t('bottomNavHome')}
      </Link>
      {/* /collections (el índice genérico) no se usa en el sitio — el
          desplegable "Categorías" del header enlaza directo a cada
          colección. Aquí llevamos a la fila "Encuentra tu equipo" de la
          home, que es la navegación de categorías real. */}
      <Link to="/#categorySection" className="bottomnav__item">
        <Icon name="grid" />
        {t('bottomNavCategories')}
      </Link>
      <button
        type="button"
        className="bottomnav__item"
        onClick={() => window.dispatchEvent(new CustomEvent('open-search-overlay'))}
      >
        <Icon name="search" />
        {t('bottomNavSearch')}
      </button>
      <Link to="/collections/outlet" className={`bottomnav__item${isOutlet ? ' active' : ''}`}>
        <Icon name="tag" />
        {t('bottomNavOutlet')}
      </Link>
      <button type="button" className="bottomnav__item" onClick={() => open('cart')}>
        <Icon name="cart" />
        {t('bottomNavCart')}
      </button>
    </nav>
  );
}
