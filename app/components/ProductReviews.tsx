import {useEffect, useRef, useState} from 'react';
import {useFetcher} from 'react-router';
import {useI18n} from '~/lib/i18n';

export type Review = {
  id: string;
  name: string;
  rating: number;
  comment: string;
  createdAt: string;
};

type ReviewResponse = {ok: boolean; error?: string};

function Stars({rating}: {rating: number}) {
  const full = Math.round(rating);
  return (
    <span className="stars" aria-hidden="true">
      {'★'.repeat(full)}
      {'☆'.repeat(5 - full)}
    </span>
  );
}

function average(reviews: Review[]): number {
  if (reviews.length === 0) return 0;
  return reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
}

/** Linea corta de valoracion media, para mostrar junto al titulo del producto. */
export function ReviewsRatingLine({reviews}: {reviews: Review[]}) {
  const {t} = useI18n();
  if (reviews.length === 0) return null;
  const avg = average(reviews);
  return (
    <div className="pdp__rating">
      <Stars rating={avg} /> {avg.toFixed(1)} · {t('reviewsOf', reviews.length)}
    </div>
  );
}

function StarRatingInput({value, onChange}: {value: number; onChange: (n: number) => void}) {
  return (
    <div className="stars stars--input" role="radiogroup">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} / 5`}
          onClick={() => onChange(n)}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            font: 'inherit',
            color: 'inherit',
          }}
        >
          {n <= value ? '★' : '☆'}
        </button>
      ))}
    </div>
  );
}

/** Panel completo de reseñas: resumen + lista + formulario para publicar una nueva. */
export function ProductReviews({
  productId,
  productHandle,
  productTitle,
  reviews,
}: {
  productId: string;
  productHandle: string;
  productTitle: string;
  reviews: Review[];
}) {
  const {t} = useI18n();
  const fetcher = useFetcher<ReviewResponse>();
  const isSubmitting = fetcher.state !== 'idle';
  const success = fetcher.data?.ok;
  const formRef = useRef<HTMLFormElement>(null);
  const [rating, setRating] = useState(0);

  useEffect(() => {
    if (success) {
      formRef.current?.reset();
      setRating(0);
    }
  }, [success]);

  const avg = average(reviews);

  return (
    <div>
      {reviews.length > 0 ? (
        <>
          <div className="reviews-summary">
            <div className="reviews-summary__score">{avg.toFixed(1)}</div>
            <div>
              <Stars rating={avg} />
              <div style={{fontSize: '.8rem', color: 'var(--text-soft)'}}>
                {t('reviewsOf', reviews.length)}
              </div>
            </div>
          </div>
          {reviews.map((r) => (
            <div className="review" key={r.id}>
              <div className="review__head">
                <span className="review__author">{r.name}</span>
                <span className="review__date">
                  {new Date(r.createdAt).toLocaleDateString()}
                </span>
              </div>
              <Stars rating={r.rating} />
              <p>{r.comment}</p>
            </div>
          ))}
        </>
      ) : (
        <p className="pdp__desc">{t('reviewsEmpty')}</p>
      )}

      <div className="review-form">
        <h4>{t('reviewFormTitle')}</h4>
        {success ? (
          <p className="notify-me__success">{t('reviewSuccess')}</p>
        ) : (
          <fetcher.Form method="post" action="/api/reviews" ref={formRef} className="notify-me">
            <input type="hidden" name="productId" value={productId} />
            <input type="hidden" name="productHandle" value={productHandle} />
            <input type="hidden" name="productTitle" value={productTitle} />
            <input type="hidden" name="rating" value={rating} />
            {/* Honeypot anti-spam: invisible para personas, los bots suelen rellenar todos los campos. */}
            <input
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              style={{position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0}}
              aria-hidden="true"
            />
            <label htmlFor="review-name" className="notify-me__label">
              {t('reviewName')}
            </label>
            <input id="review-name" type="text" name="name" required maxLength={60} />

            <label className="notify-me__label">{t('reviewRating')}</label>
            <StarRatingInput value={rating} onChange={setRating} />

            <label htmlFor="review-comment" className="notify-me__label">
              {t('reviewComment')}
            </label>
            <textarea id="review-comment" name="comment" required maxLength={600} rows={3} />

            <button
              type="submit"
              className="btn btn--primary"
              disabled={isSubmitting || rating === 0}
            >
              {isSubmitting ? t('reviewSubmitting') : t('reviewSubmit')}
            </button>
            {fetcher.data?.error && <p className="notify-me__error">{fetcher.data.error}</p>}
          </fetcher.Form>
        )}
      </div>
    </div>
  );
}
