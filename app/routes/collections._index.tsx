import {useLoaderData, Link} from 'react-router';
import type {Route} from './+types/collections._index';
import {Icon, type IconName} from '~/lib/icons';
import {useI18n} from '~/lib/i18n';
import {listCategoryCovers} from '~/lib/categoryCovers.server';

/** Todas las categorías reales, sin límite — la home solo enseña las 10
 * primeras (2 filas de 5); este es el destino de "Ver todas las
 * categorías" para cuando el catálogo crezca más allá de eso. Mismo
 * filtrado y carátulas que la home, para que se vea igual. */
export async function loader({context}: Route.LoaderArgs) {
  const {storefront} = context;
  const [{collections}, categoryCovers] = await Promise.all([
    storefront.query(ALL_COLLECTIONS_QUERY),
    listCategoryCovers(context.env),
  ]);

  const items = collections.nodes
    .filter(
      (c) =>
        c.handle !== 'frontpage' &&
        c.handle !== 'novedades-destacadas-home' &&
        c.products.nodes.length > 0,
    )
    .map((c) => {
      const override = categoryCovers[c.handle];
      const withPhoto = c.products.nodes.filter((p) => p.featuredImage);
      const firstPhoto = withPhoto.length ? withPhoto[0].featuredImage : null;
      return {
        id: c.id,
        handle: c.handle,
        title: c.title,
        photo: override ? {url: override, altText: c.title} : firstPhoto,
        hasCustomCover: Boolean(override),
      };
    });

  return {items};
}

export const meta: Route.MetaFunction = () => [
  {title: 'Todas las categorías — Victor So Professional'},
];

function categoryIcon(title: string): IconName {
  const t = title.toLowerCase();
  if (t.includes('dj')) return 'sliders';
  if (t.includes('sonido') || t.includes('altavo') || t.includes('acúst') || t.includes('acust')) return 'speaker';
  if (t.includes('auricular')) return 'headphones';
  if (t.includes('cable')) return 'plug';
  if (t.includes('estudio') || t.includes('micro')) return 'mic';
  if (t.includes('flight') || t.includes('case') || t.includes('bolsa') || t.includes('malet')) return 'suitcase';
  if (t.includes('outlet')) return 'tag';
  return 'tag';
}

export default function AllCollections() {
  const {items} = useLoaderData<typeof loader>();
  const {t} = useI18n();

  return (
    <div className="section">
      <div className="container">
        <div className="section__head">
          <h1>{t('allCategoriesTitle')}</h1>
        </div>
        <div className="catgrid-all">
          {items.map((c) => (
            <Link
              key={c.id}
              className={`catrow__card${c.hasCustomCover ? '' : ' catrow__card--plain'}`}
              to={`/collections/${c.handle}`}
            >
              <Icon name={categoryIcon(c.title)} className="catrow__icon" />
              {c.photo && <img src={c.photo.url} alt={c.photo.altText ?? c.title} loading="lazy" />}
              <span className="catrow__label">{c.title}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

const ALL_COLLECTIONS_QUERY = `#graphql
  query AllCollections($country: CountryCode, $language: LanguageCode)
    @inContext(country: $country, language: $language) {
    collections(first: 50, sortKey: TITLE) {
      nodes {
        id
        handle
        title
        products(first: 1) {
          nodes {
            id
            featuredImage {
              url
              altText
            }
          }
        }
      }
    }
  }
` as const;
