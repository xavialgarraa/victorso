import type {CollectionBannerFeature} from '~/lib/collectionBanners.server';
import {Icon} from '~/lib/icons';
import {useI18n} from '~/lib/i18n';

type Banner = {
  title: string;
  lede: string;
  features: CollectionBannerFeature[];
  logos: string[];
  backgroundImage?: string;
};

/** Banner editorial opcional para la cabecera de una colección — ver
 * /admin-interno/colecciones. El texto (título, lede, features) es
 * siempre texto real — nunca va quemado en la imagen — para que funcione
 * con la traducción automática a los 5 idiomas de la web. La imagen de
 * fondo es opcional y puramente decorativa (con overlay oscuro detrás del
 * texto para que siga siendo legible encima de cualquier foto). */
export function CollectionBanner({banner, resultCount}: {banner: Banner; resultCount: number}) {
  const {t} = useI18n();

  return (
    <div className="container">
      <div
        className="collection-hero"
        style={banner.backgroundImage ? {backgroundImage: `url(${banner.backgroundImage})`} : undefined}
      >
        <div className="collection-hero__overlay" />
        <div className="collection-hero__left">
          {banner.logos.length > 0 && (
            <div className="collection-hero__logos">
              {banner.logos.map((logo) => (
                <img key={logo} src={logo} alt="" loading="eager" />
              ))}
            </div>
          )}
          <h2 className="collection-hero__title">{banner.title}</h2>
          <p className="collection-hero__lede">{banner.lede}</p>
          {resultCount > 0 && (
            <a href="#collection-products" className="collection-hero__cta">
              {t('collectionBannerCta', resultCount)}
            </a>
          )}
        </div>
        {banner.features.length > 0 && (
          <div className="collection-hero__right">
            {banner.features.map((f, i) => (
              <div className="collection-hero__row" key={i}>
                <div className="collection-hero__row-ic">
                  <Icon name={f.icon} />
                </div>
                <div>
                  <strong>{f.title}</strong>
                  <span>{f.text}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
