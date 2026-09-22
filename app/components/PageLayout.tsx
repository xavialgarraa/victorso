import {Await} from 'react-router';
import {Suspense} from 'react';
import type {
  CartApiQueryFragment,
  FooterQuery,
  HeaderQuery,
} from 'storefrontapi.generated';
import {Aside} from '~/components/Aside';
import {Footer} from '~/components/Footer';
import {Header} from '~/components/Header';
import {CartMain} from '~/components/CartMain';
import {ScrollReveal} from '~/components/ScrollReveal';
import {HeaderOffset} from '~/components/HeaderOffset';
import {ChatAssistant} from '~/components/ChatAssistant';
import {I18nProvider} from '~/lib/i18n';

interface PageLayoutProps {
  cart: Promise<CartApiQueryFragment | null>;
  footer: Promise<FooterQuery | null>;
  header: HeaderQuery;
  isLoggedIn: Promise<boolean>;
  publicStoreDomain: string;
  children?: React.ReactNode;
}

export function PageLayout({
  cart,
  children = null,
  footer,
  header,
  isLoggedIn,
  publicStoreDomain,
}: PageLayoutProps) {
  return (
    <I18nProvider>
      <Aside.Provider>
        <ConstructionBanner />
        <ScrollReveal />
        <HeaderOffset />
        <CartAside cart={cart} />
        {header && (
          <Header
            header={header}
            cart={cart}
            isLoggedIn={isLoggedIn}
            publicStoreDomain={publicStoreDomain}
          />
        )}
        <main>{children}</main>
        <Footer
          footer={footer}
          header={header}
          publicStoreDomain={publicStoreDomain}
        />
        <ChatAssistant />
      </Aside.Provider>
    </I18nProvider>
  );
}

// Aviso temporal a petición de Victor: la web todavía no se ha anunciado
// oficialmente, así que se marca claramente como "en construcción" para
// evitar confusión mientras convive con la tienda anterior. Quitar este
// componente (y su import en PageLayout) cuando se lance oficialmente.
// Se oculta en local (npm run dev) para no estorbar mientras probamos,
// pero sigue en el código para que salga en cada despliegue real.
function ConstructionBanner() {
  if (import.meta.env.DEV) return null;
  return (
    <div className="construction-banner" role="status">
      Página en construcción
    </div>
  );
}

function CartAside({cart}: {cart: PageLayoutProps['cart']}) {
  return (
    <Aside type="cart" heading="Carrito">
      <Suspense fallback={<p>Cargando carrito…</p>}>
        <Await resolve={cart}>
          {(cart) => {
            return <CartMain cart={cart} layout="aside" />;
          }}
        </Await>
      </Suspense>
    </Aside>
  );
}
