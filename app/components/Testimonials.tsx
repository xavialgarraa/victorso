import {Icon} from '~/lib/icons';

// Reseñas reales de Google (perfil de Victor So Professional), elegidas a
// mano. Actualizar aquí si se quieren cambiar/añadir más — no hay ninguna
// conexión automática con Google todavía.
export const GOOGLE_RATING = 4.9;
export const GOOGLE_REVIEW_COUNT = 70;
export const GOOGLE_REVIEWS_URL =
  'https://www.google.com/maps/place/Victor+So+Professional+S.L.+-+DJ+Equipment,+Studio,+Lights+%26+More/@41.7040314,2.8498659,17z/data=!4m8!3m7!1s0x12bb1737b5042867:0xa951a550aceaff14!8m2!3d41.7040314!4d2.8498659!9m1!1b1!16s%2Fg%2F1tcw0hfj';

const TESTIMONIALS = [
  {
    name: 'Paula Cansado Carlos',
    text: 'Me fui a comprar una mesa de DJ y estaba indecisa, pero los trabajadores de allí fueron muy amables y me ayudaron a escogerla! Muy buen servicio y amabilidad.',
  },
  {
    name: 'Joan Obiols Garriga',
    text: 'He llevado mi controladora a reparar y me la han dejado como nueva, muy contento con el servicio y la atención de Josep e Ivan.',
  },
  {
    name: 'Elvis Stancu',
    text: 'Buenos profesionales y rápido todo el servicio que ofrece.',
  },
  {
    name: 'Lemonde Ross',
    text: 'Buen trato, distribución de la marca Pioneer.',
  },
];

function Stars({count = 5}: {count?: number}) {
  return (
    <span className="testimonials__stars" aria-hidden="true">
      {Array.from({length: count}).map((_, i) => (
        <Icon key={i} name="star" />
      ))}
    </span>
  );
}

export function RatingBadge({compact}: {compact?: boolean}) {
  return (
    <a
      className={`rating-badge${compact ? ' rating-badge--compact' : ''}`}
      href={GOOGLE_REVIEWS_URL}
      target="_blank"
      rel="noopener noreferrer"
    >
      <Stars />
      <span className="rating-badge__text">
        <strong>{GOOGLE_RATING}</strong> · {GOOGLE_REVIEW_COUNT} reseñas en Google
      </span>
    </a>
  );
}

export function Testimonials() {
  return (
    <div className="testimonials">
      <div className="testimonials__grid">
        {TESTIMONIALS.map((r) => (
          <div className="testimonial-card" key={r.name}>
            <Stars />
            <p>&ldquo;{r.text}&rdquo;</p>
            <span className="testimonial-card__name">{r.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
