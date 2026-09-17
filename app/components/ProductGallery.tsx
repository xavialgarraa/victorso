import {useEffect, useState} from 'react';
import {Image} from '@shopify/hydrogen';
import type {ProductVariantFragment, ProductFragment} from 'storefrontapi.generated';

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

  // Si al cambiar de variante su imagen no es la que se esta mostrando,
  // saltamos a ella (si esta en la galeria) para mantenerlas sincronizadas.
  useEffect(() => {
    if (!selectedVariantImage) return;
    const i = list.findIndex((img) => img.id === selectedVariantImage.id);
    if (i >= 0) setIndex(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVariantImage?.id]);

  const current = list[index] ?? selectedVariantImage;

  if (!current) {
    return <div className="pdp__gallery-main" />;
  }

  return (
    <div className="pdp__gallery">
      <div className="pdp__gallery-main">
        <Image data={current} aspectRatio="1/1" sizes="(min-width: 900px) 500px, 100vw" />
      </div>
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
    </div>
  );
}
