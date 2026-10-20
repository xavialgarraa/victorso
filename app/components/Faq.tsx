import type {FaqItem} from '~/lib/faq.server';
import {useI18n} from '~/lib/i18n';
import {jsonLdHtml} from '~/lib/jsonLd';

/**
 * Acordeón de preguntas frecuentes + datos estructurados FAQPage (JSON-LD)
 * para que Google pueda sacarlas directamente en el resultado de
 * búsqueda. Si no hay preguntas cargadas (panel vacío) no se renderiza
 * nada — ni la sección ni el script, para no mandar un FAQPage vacío.
 */
export function Faq({items}: {items: FaqItem[]}) {
  const {t} = useI18n();
  if (items.length === 0) return null;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.answer,
      },
    })),
  };

  return (
    <section className="section faq reveal">
      <div className="container">
        <div className="section__head">
          <h2>{t('faqTitle')}</h2>
        </div>
        <div className="faq__list">
          {items.map((item, i) => (
            <details key={i} className="faq__item">
              <summary className="faq__question">
                {item.question}
                <span className="faq__chevron" aria-hidden="true">
                  ⌄
                </span>
              </summary>
              <p className="faq__answer">{item.answer}</p>
            </details>
          ))}
        </div>
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{__html: jsonLdHtml(jsonLd)}} />
    </section>
  );
}
