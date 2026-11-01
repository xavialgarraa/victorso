import {useFetcher} from 'react-router';
import {Icon} from '~/lib/icons';
import {useI18n} from '~/lib/i18n';

type NewsletterResponse = {ok: boolean; error?: string};

export function NewsletterForm() {
  const {t} = useI18n();
  const fetcher = useFetcher<NewsletterResponse>();
  const isSubmitting = fetcher.state !== 'idle';
  const success = fetcher.data?.ok;

  return (
    <div className="newsletter-bar">
      <div className="container newsletter-bar__inner">
        <div className="newsletter-bar__text">
          <strong>{t('newsletterTitle')}</strong>
          <span>{t('newsletterSubtitle')}</span>
        </div>

        {success ? (
          <p className="newsletter-bar__success">
            <Icon name="checkCircle" /> {t('newsletterSuccess')}
          </p>
        ) : (
          <fetcher.Form method="post" action="/api/newsletter-signup" className="newsletter-bar__form">
            <input
              type="email"
              name="email"
              required
              placeholder={t('newsletterPlaceholder')}
              aria-label={t('newsletterTitle')}
            />
            <button type="submit" className="btn btn--primary" disabled={isSubmitting}>
              {isSubmitting ? t('newsletterSending') : t('newsletterBtn')}
            </button>
          </fetcher.Form>
        )}
        {fetcher.data?.error && <p className="newsletter-bar__error">{fetcher.data.error}</p>}
      </div>
    </div>
  );
}
