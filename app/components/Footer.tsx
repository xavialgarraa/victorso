import {Suspense} from 'react';
import {Await, NavLink} from 'react-router';
import type {FooterQuery, HeaderQuery} from 'storefrontapi.generated';
import {Icon} from '~/lib/icons';

interface FooterProps {
  footer: Promise<FooterQuery | null>;
  header: HeaderQuery;
  publicStoreDomain: string;
}

export function Footer({footer: footerPromise, header, publicStoreDomain}: FooterProps) {
  return (
    <footer className="footer">
      <div className="container footer__grid">
        <div className="footer__col">
          <div className="logo logo--footer">
            <img
              src="https://www.victorso.com/victorso/uploads/imagenes/logos/Logo_WEB_Blanco2.png"
              alt={header.shop.name}
              width={176}
              height={42}
            />
          </div>
          <p>
            Empresa especializada en equipos de sonido, DJ, iluminación y material
            audiovisual de calidad profesional.
          </p>
          <div className="footer__social">
            {/* TODO: sustituir por las URLs reales de Instagram/Facebook/YouTube cuando se tengan */}
            <span aria-hidden="true"><Icon name="instagram" /></span>
            <span aria-hidden="true"><Icon name="facebook" /></span>
            <span aria-hidden="true"><Icon name="youtube" /></span>
            <a
              href="https://www.tiktok.com/@emilio.victorso"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="TikTok"
            >
              <Icon name="tiktok" />
            </a>
          </div>
        </div>

        <div className="footer__col">
          <h4>Tienda</h4>
          <NavLink to="/collections/all">Todos los productos</NavLink>
          <NavLink to="/marcas">Nuestras Marcas</NavLink>
          <NavLink to="/collections/outlet">Outlet</NavLink>
          <Suspense>
            <Await resolve={footerPromise}>
              {(footer) => (
                <FooterMenu
                  menu={footer?.menu ?? null}
                  primaryDomainUrl={header.shop.primaryDomain?.url}
                  publicStoreDomain={publicStoreDomain}
                />
              )}
            </Await>
          </Suspense>
        </div>

        <div className="footer__col">
          <h4>Atención al cliente</h4>
          <NavLink to="/quienes-somos">Quiénes somos</NavLink>
          <NavLink to="/instalaciones">Instalaciones</NavLink>
          <NavLink to="/policies/shipping-policy">Envíos y plazos de entrega</NavLink>
          <NavLink to="/policies/refund-policy">Devoluciones y garantía</NavLink>
          <NavLink to="/policies/terms-of-service">Términos de servicio</NavLink>
          <NavLink to="/policies/privacy-policy">Privacidad</NavLink>
        </div>

        <div className="footer__col">
          <h4>Contacto directo</h4>
          <a href="tel:+34972364114">
            <Icon name="phone" />
            972 364 114
          </a>
          <a href="https://wa.me/34619406443" target="_blank" rel="noopener noreferrer">
            <Icon name="chat" />
            WhatsApp Ventas
          </a>
          <a href="mailto:info@victorso.com">
            <Icon name="mail" />
            info@victorso.com
          </a>
          <p className="footer__hours">Lunes a viernes de 9:00 a 13:00 y de 15:00 a 19:00</p>
        </div>
      </div>

      <div className="footer__bottom container">
        <p>© {new Date().getFullYear()} {header.shop.name}. Todos los derechos reservados.</p>
      </div>
    </footer>
  );
}

function FooterMenu({
  menu,
  primaryDomainUrl,
  publicStoreDomain,
}: {
  menu: FooterQuery['menu'] | null;
  primaryDomainUrl?: string;
  publicStoreDomain: string;
}) {
  if (!menu) return null;
  const items = menu.items;
  return (
    <>
      {items.map((item) => {
        if (!item.url) return null;
        const url =
          primaryDomainUrl &&
          (item.url.includes('myshopify.com') ||
            item.url.includes(publicStoreDomain) ||
            item.url.includes(primaryDomainUrl))
            ? new URL(item.url).pathname
            : item.url;
        const isExternal = !url.startsWith('/');
        return isExternal ? (
          <a href={url} key={item.id} target="_blank" rel="noopener noreferrer">
            {item.title}
          </a>
        ) : (
          <NavLink key={item.id} to={url}>
            {item.title}
          </NavLink>
        );
      })}
    </>
  );
}
