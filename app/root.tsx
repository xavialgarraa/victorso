import {Analytics, getShopAnalytics, useNonce} from '@shopify/hydrogen';
// ShopifyProvider no lo reexporta @shopify/hydrogen en esta versión (solo
// hydrogen-react lo expone) — ver comentario junto a su uso más abajo.
import {ShopifyProvider} from '@shopify/hydrogen-react';
import {
  Outlet,
  useRouteError,
  isRouteErrorResponse,
  type ShouldRevalidateFunction,
  Links,
  Meta,
  Scripts,
  ScrollRestoration,
  useRouteLoaderData,
  useLocation,
} from 'react-router';
import type {Route} from './+types/root';
import {FOOTER_QUERY, HEADER_QUERY} from '~/lib/fragments';
import resetStyles from '~/styles/reset.css?url';
import appStyles from '~/styles/app.css?url';
import {PageLayout} from './components/PageLayout';

export type RootLoader = typeof loader;

/**
 * This is important to avoid re-fetching root queries on sub-navigations
 */
export const shouldRevalidate: ShouldRevalidateFunction = ({
  formMethod,
  currentUrl,
  nextUrl,
}) => {
  // revalidate when a mutation is performed e.g add to cart, login...
  if (formMethod && formMethod !== 'GET') return true;

  // revalidate when manually revalidating via useRevalidator
  if (currentUrl.toString() === nextUrl.toString()) return true;

  // Defaulting to no revalidation for root loader data to improve performance.
  // When using this feature, you risk your UI getting out of sync with your server.
  // Use with caution. If you are uncomfortable with this optimization, update the
  // line below to `return defaultShouldRevalidate` instead.
  // For more details see: https://remix.run/docs/en/main/route/should-revalidate
  return false;
};

/**
 * The main and reset stylesheets are added in the Layout component
 * to prevent a bug in development HMR updates.
 *
 * This avoids the "failed to execute 'insertBefore' on 'Node'" error
 * that occurs after editing and navigating to another page.
 *
 * It's a temporary fix until the issue is resolved.
 * https://github.com/remix-run/remix/issues/9242
 */
export function links() {
  return [
    {
      rel: 'preconnect',
      href: 'https://cdn.shopify.com',
    },
    {
      rel: 'preconnect',
      href: 'https://shop.app',
    },
    {
      rel: 'preconnect',
      href: 'https://fonts.googleapis.com',
    },
    {
      rel: 'preconnect',
      href: 'https://fonts.gstatic.com',
      crossOrigin: 'anonymous',
    },
    {
      rel: 'stylesheet',
      href: 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700;800&display=swap',
    },
    // El favicon (logo pequeño en la pestaña) sigue el modo oscuro/claro
    // del navegador/SO, igual que en el demo — no el tema que se pueda
    // cambiar manualmente en la web con el botón de sol/luna.
    {
      rel: 'icon',
      type: 'image/png',
      media: '(prefers-color-scheme: light)',
      href: '/assets/favicon-light.png',
    },
    {
      rel: 'icon',
      type: 'image/png',
      media: '(prefers-color-scheme: dark)',
      href: '/assets/favicon-dark.png',
    },
  ];
}

export async function loader(args: Route.LoaderArgs) {
  // Start fetching non-critical data without blocking time to first byte
  const deferredData = loadDeferredData(args);

  // Await the critical data required to render initial state of the page
  const criticalData = await loadCriticalData(args);

  const {storefront, env} = args.context;

  return {
    ...deferredData,
    ...criticalData,
    publicStoreDomain: env.PUBLIC_STORE_DOMAIN,
    // Público por diseño (de ahí el nombre) — necesario en el cliente para
    // <ShopifyProvider>, que es quien hace que <Money>/useMoney formateen
    // los precios en es-ES (1.234,56 €) en vez de caer en el locale por
    // defecto de Hydrogen (en-US) cuando no hay ningún <ShopifyProvider>.
    storefrontApiToken: env.PUBLIC_STOREFRONT_API_TOKEN,
    shop: getShopAnalytics({
      storefront,
      publicStorefrontId: env.PUBLIC_STOREFRONT_ID,
    }),
    consent: {
      checkoutDomain: env.PUBLIC_CHECKOUT_DOMAIN,
      storefrontAccessToken: env.PUBLIC_STOREFRONT_API_TOKEN,
      withPrivacyBanner: false,
      // localize the privacy banner
      country: args.context.storefront.i18n.country,
      language: args.context.storefront.i18n.language,
    },
  };
}

/**
 * Load data necessary for rendering content above the fold. This is the critical data
 * needed to render the page. If it's unavailable, the whole page should 400 or 500 error.
 */
async function loadCriticalData({context}: Route.LoaderArgs) {
  const {storefront} = context;

  const [header] = await Promise.all([
    storefront.query(HEADER_QUERY, {
      cache: storefront.CacheLong(),
      variables: {
        headerMenuHandle: 'main-menu', // Adjust to your header menu handle
      },
    }),
    // Add other queries here, so that they are loaded in parallel
  ]);

  return {header};
}

/**
 * Load data for rendering content below the fold. This data is deferred and will be
 * fetched after the initial page load. If it's unavailable, the page should still 200.
 * Make sure to not throw any errors here, as it will cause the page to 500.
 */
function loadDeferredData({context}: Route.LoaderArgs) {
  const {storefront, customerAccount, cart} = context;

  // defer the footer query (below the fold)
  const footer = storefront
    .query(FOOTER_QUERY, {
      cache: storefront.CacheLong(),
      variables: {
        footerMenuHandle: 'footer', // Adjust to your footer menu handle
      },
    })
    .catch((error: Error) => {
      // Log query errors, but don't throw them so the page can still render
      console.error(error);
      return null;
    });
  return {
    cart: cart.get(),
    isLoggedIn: customerAccount.isLoggedIn(),
    footer,
  };
}

export function Layout({children}: {children?: React.ReactNode}) {
  const nonce = useNonce();

  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="stylesheet" href={resetStyles}></link>
        <link rel="stylesheet" href={appStyles}></link>
        <script
          nonce={nonce}
          suppressHydrationWarning
          // Aplica el tema guardado antes del primer render para evitar parpadeos.
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var saved=localStorage.getItem("vs_theme");if(saved)document.documentElement.setAttribute("data-theme",saved);}catch(e){}})();`,
          }}
        />
        <Meta />
        <Links />
      </head>
      <body>
        {children}
        <ScrollRestoration nonce={nonce} />
        <Scripts nonce={nonce} />
      </body>
    </html>
  );
}

export default function App() {
  const data = useRouteLoaderData<RootLoader>('root');
  const location = useLocation();
  // El panel interno tiene su propio layout (AdminShell) — no lleva la
  // cabecera/pie/carrito/chat de la tienda pública. "/opina" (tarjetas NFC
  // de reseñas) tampoco: es una página de aterrizaje sola, sin distraer.
  const isAdminInterno = location.pathname.startsWith('/admin-interno');
  const isBareLayout = isAdminInterno || location.pathname === '/opina';

  if (!data) {
    return <Outlet />;
  }

  // countryIsoCode/languageIsoCode fijos a España (no al idioma elegido en
  // el selector) a propósito: la moneda es siempre EUR y los clientes son
  // de España pase lo que pase en qué idioma estén leyendo la web — fijarlo
  // así garantiza el formato 1.234,56 € siempre, incluso en inglés (donde
  // Intl usaría coma de miles si se le diera "en" como idioma del locale).
  const shopifyProviderProps = {
    storeDomain: `https://${data.publicStoreDomain}`,
    storefrontToken: data.storefrontApiToken,
    storefrontApiVersion: '2026-04',
    countryIsoCode: 'ES' as const,
    languageIsoCode: 'ES' as const,
  };

  if (isBareLayout) {
    return (
      <ShopifyProvider {...shopifyProviderProps}>
        <Analytics.Provider cart={data.cart} shop={data.shop} consent={data.consent}>
          <Outlet />
        </Analytics.Provider>
      </ShopifyProvider>
    );
  }

  // LocalBusiness en vez de solo Organization porque hay tienda física real
  // con dirección — ayuda a la ficha de Google Maps / paquete local, no
  // solo a la búsqueda de marca. Va en el layout público (no en el panel
  // interno) para que esté en todas las páginas de la tienda.
  const localBusinessJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ElectronicsStore',
    name: 'Victor So Professional',
    url: 'https://www.victorso.es/',
    image: 'https://www.victorso.com/victorso/uploads/imagenes/logos/Logo_WEB_Blanco2.png',
    telephone: '+34972364114',
    priceRange: '€€',
    address: {
      '@type': 'PostalAddress',
      streetAddress: 'Avda. Vila de Tossa, 50-52',
      addressLocality: 'Lloret de Mar',
      addressRegion: 'Girona',
      postalCode: '17310',
      addressCountry: 'ES',
    },
    openingHoursSpecification: [
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
        opens: '09:00',
        closes: '13:00',
      },
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
        opens: '15:00',
        closes: '19:00',
      },
    ],
  };

  return (
    <ShopifyProvider {...shopifyProviderProps}>
      <Analytics.Provider
        cart={data.cart}
        shop={data.shop}
        consent={data.consent}
      >
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{__html: JSON.stringify(localBusinessJsonLd)}}
        />
        <PageLayout {...data}>
          <Outlet />
        </PageLayout>
      </Analytics.Provider>
    </ShopifyProvider>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  let errorMessage = 'Unknown error';
  let errorStatus = 500;

  if (isRouteErrorResponse(error)) {
    errorMessage = error?.data?.message ?? error.data;
    errorStatus = error.status;
  } else if (error instanceof Error) {
    errorMessage = error.message;
  }

  return (
    <div className="route-error">
      <h1>Oops</h1>
      <h2>{errorStatus}</h2>
      {errorMessage && (
        <fieldset>
          <pre>{errorMessage}</pre>
        </fieldset>
      )}
    </div>
  );
}
