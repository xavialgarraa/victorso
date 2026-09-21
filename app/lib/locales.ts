import type {LanguageCode} from '@shopify/hydrogen/storefront-api-types';

/** Nombre de la cookie que guarda el idioma elegido, legible tanto en el
 * cliente (selector) como en el servidor (para pedir el catalogo de
 * Shopify ya traducido via @inContext). */
export const LOCALE_COOKIE = 'vs_locale';

export const LOCALES = {
  es: {label: 'Español', flag: '/assets/flag-es.svg', urlHint: 'victorso.com/es'},
  en: {label: 'English', flag: '/assets/flag-en.svg', urlHint: 'victorso.com/en'},
  fr: {label: 'Français', flag: '/assets/flag-fr.svg', urlHint: 'victorso.com/fr'},
  pt: {label: 'Português', flag: '/assets/flag-pt.svg', urlHint: 'victorso.com/pt'},
  ca: {label: 'Català', flag: '/assets/flag-catalonia.webp', urlHint: 'victorso.com/ca'},
} as const;

export type LocaleCode = keyof typeof LOCALES;

/** Nuestro codigo de idioma -> LanguageCode que espera la Storefront API. */
export const LOCALE_TO_SHOPIFY_LANGUAGE: Record<LocaleCode, LanguageCode> = {
  es: 'ES',
  en: 'EN',
  fr: 'FR',
  pt: 'PT',
  ca: 'CA',
};

/** Lee el idioma elegido de la cookie de la petición (server-side). Si no
 * hay cookie o el valor no es uno de los idiomas soportados, cae a 'es'. */
export function getLocaleFromRequest(request: Request): LocaleCode {
  const cookieHeader = request.headers.get('Cookie') || '';
  const match = cookieHeader.match(new RegExp(`${LOCALE_COOKIE}=([a-z]+)`));
  const code = match?.[1];
  return code && code in LOCALES ? (code as LocaleCode) : 'es';
}
