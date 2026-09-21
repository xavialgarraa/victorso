import {useFetcher} from 'react-router';
import {Icon} from '~/lib/icons';
import {useI18n} from '~/lib/i18n';

type NotifyMeResponse = {ok: boolean; error?: string};

export function NotifyMeForm({productId}: {productId: string}) {
  const {t} = useI18n();
  const fetcher = useFetcher<NotifyMeResponse>();
  const isSubmitting = fetcher.state !== 'idle';
  const success = fetcher.data?.ok;

  if (success) {
    return (
      <p className="notify-me__success">
        <Icon name="checkCircle" /> {t('notifyMeSuccess')}
      </p>
    );
  }

  return (
    <fetcher.Form method="post" action="/api/notify-me" className="notify-me">
      <input type="hidden" name="productId" value={productId} />
      <label htmlFor="notify-me-email" className="notify-me__label">
        {t('notifyMeLabel')}
      </label>
      <div className="notify-me__row">
        <input
          id="notify-me-email"
          type="email"
          name="email"
          required
          placeholder={t('notifyMePlaceholder')}
        />
        <button type="submit" className="btn btn--primary" disabled={isSubmitting}>
          {isSubmitting ? t('notifyMeSending') : t('notifyMeBtn')}
        </button>
      </div>
      {fetcher.data?.error && <p className="notify-me__error">{fetcher.data.error}</p>}
    </fetcher.Form>
  );
}
