import {useFetcher} from 'react-router';
import {Icon} from '~/lib/icons';
import {useI18n} from '~/lib/i18n';

type QuoteFormResponse = {ok: boolean; error?: string};

export function QuoteForm({compact}: {compact?: boolean}) {
  const {t} = useI18n();
  const fetcher = useFetcher<QuoteFormResponse>();
  const isSubmitting = fetcher.state !== 'idle';
  const success = fetcher.data?.ok;

  if (success) {
    return (
      <p className="quote-form__success">
        <Icon name="checkCircle" /> {t('quoteFormSuccess')}
      </p>
    );
  }

  return (
    <fetcher.Form
      method="post"
      action="/api/service-request"
      className={`quote-form${compact ? ' quote-form--compact' : ''}`}
    >
      <div className="quote-form__row">
        <div className="quote-form__field">
          <label htmlFor="quote-name">{t('quoteFormName')}</label>
          <input id="quote-name" type="text" name="name" required maxLength={100} />
        </div>
        <div className="quote-form__field">
          <label htmlFor="quote-contact">{t('quoteFormContact')}</label>
          <input id="quote-contact" type="text" name="contact" required maxLength={150} />
        </div>
      </div>

      <div className="quote-form__field">
        <label htmlFor="quote-type">{t('quoteFormType')}</label>
        <select id="quote-type" name="type" defaultValue="reparacion">
          <option value="reparacion">{t('quoteFormTypeRepair')}</option>
          <option value="instalacion">{t('quoteFormTypeInstall')}</option>
          <option value="otro">{t('quoteFormTypeOther')}</option>
        </select>
      </div>

      <div className="quote-form__field">
        <label htmlFor="quote-message">{t('quoteFormMessage')}</label>
        <textarea id="quote-message" name="message" rows={compact ? 3 : 4} required maxLength={1000} />
      </div>

      <button type="submit" className="btn btn--primary" disabled={isSubmitting}>
        {isSubmitting ? t('quoteFormSending') : t('quoteFormSubmit')}
      </button>
      {fetcher.data?.error && <p className="quote-form__error">{fetcher.data.error}</p>}
    </fetcher.Form>
  );
}
