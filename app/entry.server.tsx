import {ServerRouter} from 'react-router';
import {isbot} from 'isbot';
import {renderToReadableStream} from 'react-dom/server';
import {
  createContentSecurityPolicy,
  type HydrogenRouterContextProvider,
} from '@shopify/hydrogen';
import type {EntryContext} from 'react-router';

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  reactRouterContext: EntryContext,
  context: HydrogenRouterContextProvider,
) {
  const {nonce, header, NonceProvider} = createContentSecurityPolicy({
    shop: {
      checkoutDomain: context.env.PUBLIC_CHECKOUT_DOMAIN,
      storeDomain: context.env.PUBLIC_STORE_DOMAIN,
    },
    // TODO: quitar en cuanto el logo se suba a Shopify Files (cdn.shopify.com)
    // en vez de servirse desde la web antigua de LiveCommerce.
    imgSrc: [
      "'self'",
      'data:',
      'https://cdn.shopify.com',
      'https://www.victorso.com',
      'https://*.tiktokcdn.com',
      'https://*.tiktokcdn-us.com',
      'https://*.ibyteimg.com',
    ],
    // Necesario para el embed de TikTok en /instalaciones (script + iframe)
    // y el mapa de Google Maps en /quienes-somos (iframe).
    scriptSrc: ["'self'", 'https://cdn.shopify.com', 'https://shopify.com', 'https://www.tiktok.com'],
    frameSrc: ["'self'", 'https://www.tiktok.com', 'https://www.google.com'],
    connectSrc: ['https://www.tiktok.com'],
  });

  const body = await renderToReadableStream(
    <NonceProvider>
      <ServerRouter
        context={reactRouterContext}
        url={request.url}
        nonce={nonce}
      />
    </NonceProvider>,
    {
      nonce,
      signal: request.signal,
      onError(error) {
        console.error(error);
        responseStatusCode = 500;
      },
    },
  );

  if (isbot(request.headers.get('user-agent'))) {
    await body.allReady;
  }

  responseHeaders.set('Content-Type', 'text/html');
  responseHeaders.set('Content-Security-Policy', header);

  return new Response(body, {
    headers: responseHeaders,
    status: responseStatusCode,
  });
}
