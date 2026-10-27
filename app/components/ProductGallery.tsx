import {useEffect, useState} from 'react';
import {Image} from '@shopify/hydrogen';
import type {ProductVariantFragment, ProductFragment} from 'storefrontapi.generated';
import {Icon} from '~/lib/icons';

type GalleryImage = ProductFragment['images']['nodes'][number];

export function ProductGallery({
  images,
  selectedVariantImage,
}: {
  images: GalleryImage[];
  selectedVariantImage?: ProductVariantFragment['image'];
}) {
  const list = images.length ? images : selectedVariantImage ? [selectedVariantImage] : [];
  const [index, setIndex] = useState(0);
  const [zoomOpen, setZoomOpen] = useState(false);

  // Si al cambiar de variante su imagen no es la que se esta mostrando,
  // saltamos a ella (si esta en la galeria) para mantenerlas sincronizadas.
  useEffect(() => {
    if (!selectedVariantImage) return;
    const i = list.findIndex((img) => img.id === selectedVariantImage.id);
    if (i >= 0) setIndex(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVariantImage?.id]);

  useEffect(() => {
    if (!zoomOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setZoomOpen(false);
      if (e.key === 'ArrowLeft') setIndex((i) => (i - 1 + list.length) % list.length);
      if (e.key === 'ArrowRight') setIndex((i) => (i + 1) % list.length);
    }
    document.addEventListener('keydown', onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomOpen, list.length]);

  const current = list[index] ?? selectedVariantImage;

  if (!current) {
    return <div className="pdp__gallery-main" />;
  }

  return (
    <div className="pdp__gallery">
      <button
        type="button"
        className="pdp__gallery-main pdp__gallery-main--zoomable"
        onClick={() => setZoomOpen(true)}
        aria-label="Ampliar imagen"
      >
        <Image data={current} aspectRatio="1/1" sizes="(min-width: 900px) 500px, 100vw" />
        <span className="pdp__gallery-zoom-hint">
          <Icon name="search" />
        </span>
      </button>
      {list.length > 1 && (
        <div className="pdp__thumbs">
          {list.map((img, i) => (
            <button
              key={img.id}
              type="button"
              className={i === index ? 'active' : ''}
              onClick={() => setIndex(i)}
            >
              <Image data={img} aspectRatio="1/1" sizes="66px" />
            </button>
          ))}
        </div>
      )}

      {zoomOpen && (
        <div className="pdp__lightbox" onClick={() => setZoomOpen(false)}>
          <button
            type="button"
            className="pdp__lightbox-close"
            aria-label="Cerrar"
            onClick={() => setZoomOpen(false)}
          >
            <Icon name="close" />
          </button>
          {list.length > 1 && (
            <button
              type="button"
              className="pdp__lightbox-nav pdp__lightbox-nav--prev"
              aria-label="Anterior"
              onClick={(e) => {
                e.stopPropagation();
                setIndex((i) => (i - 1 + list.length) % list.length);
              }}
            >
              <Icon name="chevronLeft" />
            </button>
          )}
          <img
            className="pdp__lightbox-img"
            src={current.url}
            alt={current.altText ?? ''}
            onClick={(e) => e.stopPropagation()}
          />
          {list.length > 1 && (
            <button
              type="button"
              className="pdp__lightbox-nav pdp__lightbox-nav--next"
              aria-label="Siguiente"
              onClick={(e) => {
                e.stopPropagation();
                setIndex((i) => (i + 1) % list.length);
              }}
            >
              <Icon name="chevronRight" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
