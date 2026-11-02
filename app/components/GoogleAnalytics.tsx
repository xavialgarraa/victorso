import {useEffect, useRef} from 'react';
import {useCustomerPrivacy, type CustomerPrivacyApiProps} from '@shopify/hydrogen';

declare global {
  interface Window {
    dataLayer?: unknown[];
  }
}

type ConsentConfig = Pick<
  CustomerPrivacyApiProps,
  'checkoutDomain' | 'storefrontAccessToken' | 'withPrivacyBanner' | 'country' | 'locale'
>;

function loadGtm(containerId: string) {
  if (document.getElementById('gtm-script')) return;

  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({'gtm.start': Date.now(), event: 'gtm.js'});

  const script = document.createElement('script');
  script.id = 'gtm-script';
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtm.js?id=${containerId}`;
  document.head.appendChild(script);
}

/**
 * Carga Google Tag Manager solo cuando el visitante ha dado consentimiento
 * de analítica en el banner de privacidad de Shopify (ver `withPrivacyBanner`
 * en root.tsx) — nunca antes. GA4, Meta Pixel, etc. se configuran dentro
 * del propio contenedor en tagmanager.google.com, no aquí. Si no hay
 * containerId configurado (PUBLIC_GTM_CONTAINER_ID), no hace nada.
 */
export function GoogleAnalytics({
  containerId,
  consent,
}: {
  containerId?: string;
  consent: ConsentConfig;
}) {
  const loadedRef = useRef(false);

  const {customerPrivacy} = useCustomerPrivacy({
    ...consent,
    checkoutDomain: consent.checkoutDomain ?? '',
    storefrontAccessToken: consent.storefrontAccessToken ?? '',
    onVisitorConsentCollected: (collected) => {
      if (containerId && collected.analyticsAllowed && !loadedRef.current) {
        loadedRef.current = true;
        loadGtm(containerId);
      }
    },
  });

  useEffect(() => {
    if (!containerId || !customerPrivacy || loadedRef.current) return;
    // Si el visitante ya había dado su consentimiento en una visita
    // anterior (la API de privacidad lo recuerda), no hace falta esperar
    // a un evento nuevo — se carga ya en esta visita.
    if (customerPrivacy.analyticsProcessingAllowed()) {
      loadedRef.current = true;
      loadGtm(containerId);
    }
  }, [containerId, customerPrivacy]);

  return null;
}
