import {useEffect, useState} from 'react';
import {useCustomerPrivacy, type CustomerPrivacyApiProps} from '@shopify/hydrogen';
import {Icon} from '~/lib/icons';
import {useI18n} from '~/lib/i18n';

type ConsentConfig = Pick<
  CustomerPrivacyApiProps,
  'checkoutDomain' | 'storefrontAccessToken' | 'country' | 'locale'
>;

type Prefs = {analytics: boolean; marketing: boolean; preferences: boolean};

/**
 * Banner de cookies propio (en vez del widget por defecto de Shopify) —
 * mismo look & animación que el panel del chat, apareciendo desde la
 * misma esquina. Usa la API de privacidad de Shopify por debajo
 * (customerPrivacy.setTrackingConsent) para que el consentimiento se
 * registre exactamente igual que con el banner nativo — solo cambia la
 * interfaz, no la lógica legal.
 */
export function CookieConsent({consent}: {consent: ConsentConfig}) {
  const {t} = useI18n();
  const [visible, setVisible] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [prefs, setPrefs] = useState<Prefs>({analytics: true, marketing: true, preferences: true});

  const {customerPrivacy} = useCustomerPrivacy({
    ...consent,
    checkoutDomain: consent.checkoutDomain ?? '',
    storefrontAccessToken: consent.storefrontAccessToken ?? '',
    withPrivacyBanner: false,
  });

  useEffect(() => {
    if (!customerPrivacy) return;
    // shouldShowBanner() solo dice si la región del visitante exige mostrar
    // un aviso (p.ej. siempre true en la UE) — NO si ya ha decidido antes.
    // Para no mostrarlo en cada visita, hay que comprobar además si ya hay
    // una decisión guardada en currentVisitorConsent() (todo vendría
    // "undefined" si el visitante no ha elegido nunca).
    const current = customerPrivacy.currentVisitorConsent();
    const alreadyDecided = Object.values(current).some((v) => v !== undefined);
    setVisible(customerPrivacy.shouldShowBanner() && !alreadyDecided);
  }, [customerPrivacy]);

  function save(next: Prefs) {
    if (!customerPrivacy) return;
    customerPrivacy.setTrackingConsent(
      {analytics: next.analytics, marketing: next.marketing, preferences: next.preferences, sale_of_data: next.marketing},
      () => setVisible(false),
    );
  }

  if (!visible) return null;

  return (
    <div className="cookie-consent" role="dialog" aria-label={t('cookieTitle')}>
      <div className="cookie-consent__head">
        <Icon name="chat" />
        <strong>{t('cookieTitle')}</strong>
      </div>
      <p className="cookie-consent__text">
        {t('cookieText')} <a href="/policies/privacy-policy">{t('cookiePolicyLink')}</a>
      </p>

      {expanded && (
        <div className="cookie-consent__prefs">
          <label className="cookie-consent__pref">
            <span>{t('cookieNecessary')}</span>
            <input type="checkbox" checked disabled />
          </label>
          <label className="cookie-consent__pref">
            <span>{t('cookieAnalytics')}</span>
            <input
              type="checkbox"
              checked={prefs.analytics}
              onChange={(e) => setPrefs((p) => ({...p, analytics: e.target.checked}))}
            />
          </label>
          <label className="cookie-consent__pref">
            <span>{t('cookieMarketing')}</span>
            <input
              type="checkbox"
              checked={prefs.marketing}
              onChange={(e) => setPrefs((p) => ({...p, marketing: e.target.checked}))}
            />
          </label>
        </div>
      )}

      <div className="cookie-consent__actions">
        {expanded ? (
          <button type="button" className="btn btn--primary" onClick={() => save(prefs)}>
            {t('cookieSavePrefs')}
          </button>
        ) : (
          <>
            <button
              type="button"
              className="btn btn--outline"
              onClick={() => save({analytics: false, marketing: false, preferences: false})}
            >
              {t('cookieReject')}
            </button>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => save({analytics: true, marketing: true, preferences: true})}
            >
              {t('cookieAccept')}
            </button>
          </>
        )}
      </div>
      {!expanded && (
        <button type="button" className="cookie-consent__manage" onClick={() => setExpanded(true)}>
          {t('cookieManage')}
        </button>
      )}
    </div>
  );
}
