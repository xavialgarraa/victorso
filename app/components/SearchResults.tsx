import {Link} from 'react-router';
import {Pagination} from '@shopify/hydrogen';
import {urlWithTrackingParams, type RegularSearchReturn} from '~/lib/search';
import {ProductCard} from '~/components/ProductCard';
import {Icon} from '~/lib/icons';
import {useI18n} from '~/lib/i18n';

type SearchItems = RegularSearchReturn['result']['items'];
type PartialSearchResult<ItemType extends keyof SearchItems> = Pick<
  SearchItems,
  ItemType
> &
  Pick<RegularSearchReturn, 'term'>;

type SearchResultsProps = RegularSearchReturn & {
  children: (args: SearchItems & {term: string}) => React.ReactNode;
};

export function SearchResults({
  term,
  result,
  children,
}: Omit<SearchResultsProps, 'error' | 'type'>) {
  if (!result?.total) {
    return null;
  }

  return children({...result.items, term});
}

SearchResults.Articles = SearchResultsArticles;
SearchResults.Pages = SearchResultsPages;
SearchResults.Products = SearchResultsProducts;
SearchResults.Empty = SearchResultsEmpty;

function SearchResultsArticles({
  term,
  articles,
}: PartialSearchResult<'articles'>) {
  if (!articles?.nodes.length) {
    return null;
  }

  return (
    <div className="search-result">
      <div className="section__head">
        <h2>Artículos</h2>
      </div>
      <div className="filter-group">
        {articles?.nodes?.map((article) => {
          const articleUrl = urlWithTrackingParams({
            baseUrl: `/blogs/${article.handle}`,
            trackingParams: article.trackingParameters,
            term,
          });

          return (
            <div key={article.id}>
              <Link prefetch="intent" to={articleUrl}>
                {article.title}
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SearchResultsPages({term, pages}: PartialSearchResult<'pages'>) {
  if (!pages?.nodes.length) {
    return null;
  }

  return (
    <div className="search-result">
      <div className="section__head">
        <h2>Páginas</h2>
      </div>
      <div className="filter-group">
        {pages?.nodes?.map((page) => {
          const pageUrl = urlWithTrackingParams({
            baseUrl: `/pages/${page.handle}`,
            trackingParams: page.trackingParameters,
            term,
          });

          return (
            <div key={page.id}>
              <Link prefetch="intent" to={pageUrl}>
                {page.title}
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SearchResultsProducts({
  products,
}: PartialSearchResult<'products'>) {
  if (!products?.nodes.length) {
    return null;
  }

  return (
    <div className="search-result">
      <Pagination connection={products}>
        {({nodes, isLoading, NextLink, PreviousLink}) => (
          <>
            <div className="pagination pagination--top">
              <PreviousLink className="pagination__nav">
                {isLoading ? '…' : <Icon name="chevronLeft" />}
              </PreviousLink>
            </div>
            <div className="prodgrid">
              {nodes.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
            <div className="pagination">
              <NextLink className="pagination__nav">
                {isLoading ? 'Cargando…' : <Icon name="chevronRight" />}
              </NextLink>
            </div>
          </>
        )}
      </Pagination>
    </div>
  );
}

function SearchResultsEmpty() {
  const {t} = useI18n();
  return (
    <div className="empty-state">
      <p>{t('searchEmptyHint')}</p>
      <div className="empty-state__actions">
        <Link className="btn btn--primary" to="/collections/all">
          {t('searchEmptyAllProducts')}
        </Link>
        <button
          type="button"
          className="btn btn--outline"
          onClick={() => window.dispatchEvent(new CustomEvent('open-chat-assistant'))}
        >
          <Icon name="chat" /> {t('searchEmptyAskAssistant')}
        </button>
      </div>
    </div>
  );
}
