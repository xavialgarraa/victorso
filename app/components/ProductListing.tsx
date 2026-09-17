import {useState} from 'react';
import {useSearchParams} from 'react-router';
import {Pagination} from '@shopify/hydrogen';
import type {ProductCardFragment} from 'storefrontapi.generated';
import {ProductCard} from '~/components/ProductCard';
import {Icon} from '~/lib/icons';

export type ListingFilter = {
  id: string;
  label: string;
  values: Array<{id: string; label: string; count: number; input: string}>;
};

type PaginationConnection = React.ComponentProps<typeof Pagination<ProductCardFragment>>['connection'];

const PER_PAGE_OPTIONS = [12, 24, 48];

export function ProductListing({
  title,
  products,
  filters,
  sortOptions,
  resultCount,
}: {
  title: string;
  products: PaginationConnection;
  filters: ListingFilter[];
  sortOptions: Array<{value: string; label: string}>;
  resultCount: number;
}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [filtersOpen, setFiltersOpen] = useState(false);

  const view = searchParams.get('view') === 'list' ? 'list' : 'grid';
  const sort = searchParams.get('sort') || sortOptions[0]?.value || '';
  const selectedFilters = new Set(searchParams.getAll('filter'));
  const perPage = PER_PAGE_OPTIONS.includes(Number(searchParams.get('perPage')))
    ? Number(searchParams.get('perPage'))
    : PER_PAGE_OPTIONS[0];

  function updateParam(key: string, value: string | null) {
    const next = new URLSearchParams(searchParams);
    if (value === null) next.delete(key);
    else next.set(key, value);
    setSearchParams(next, {preventScrollReset: true});
  }

  function toggleFilter(input: string) {
    const next = new URLSearchParams(searchParams);
    const current = next.getAll('filter');
    next.delete('filter');
    if (current.includes(input)) {
      current.filter((f) => f !== input).forEach((f) => next.append('filter', f));
    } else {
      [...current, input].forEach((f) => next.append('filter', f));
    }
    setSearchParams(next, {preventScrollReset: true});
  }

  return (
    <section className="section listing">
      <div className="container">
        <div className="section__head">
          <h2>{title}</h2>
        </div>
        <div className="listing__toolbar">
          <button
            type="button"
            className="btn btn--outline filter-toggle"
            onClick={() => setFiltersOpen(true)}
          >
            <Icon name="filter" />
            <span>Filtros</span>
          </button>
          <span className="listing__count">
            {resultCount} producto{resultCount === 1 ? '' : 's'}
          </span>
          <div className="view-toggle" role="group">
            <button
              type="button"
              className={`view-toggle__btn${view === 'grid' ? ' active' : ''}`}
              aria-label="Vista cuadrícula"
              onClick={() => updateParam('view', null)}
            >
              <Icon name="gridView" />
            </button>
            <button
              type="button"
              className={`view-toggle__btn${view === 'list' ? ' active' : ''}`}
              aria-label="Vista lista"
              onClick={() => updateParam('view', 'list')}
            >
              <Icon name="listView" />
            </button>
          </div>
          {sortOptions.length > 0 && (
            <select
              className="sort-select"
              value={sort}
              onChange={(e) => updateParam('sort', e.target.value)}
            >
              {sortOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="listing__body">
          <aside className={`filters${filtersOpen ? ' open' : ''}`}>
            <div className="filters__head">
              <h3 className="mt-0">Filtros</h3>
              <button className="filters__close" onClick={() => setFiltersOpen(false)}>
                <Icon name="close" />
              </button>
            </div>
            {filters
              .filter((f) => f.values.length > 0)
              .map((f) => (
                <div className="filter-group" key={f.id}>
                  <h4>{f.label}</h4>
                  {f.values.map((v) => (
                    <label key={v.id}>
                      <input
                        type="checkbox"
                        checked={selectedFilters.has(v.input)}
                        onChange={() => toggleFilter(v.input)}
                      />
                      {v.label} ({v.count})
                    </label>
                  ))}
                </div>
              ))}
            <div className="filter-group">
              <h4>Por página</h4>
              <select
                value={perPage}
                onChange={(e) => updateParam('perPage', e.target.value)}
              >
                {PER_PAGE_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="btn btn--primary btn--block"
              onClick={() => setFiltersOpen(false)}
            >
              Ver resultados
            </button>
          </aside>

          <div>
            <Pagination connection={products}>
              {({nodes, isLoading, PreviousLink, NextLink}) =>
                nodes.length === 0 ? (
                  <div className="empty-state">
                    <p>No se han encontrado productos con estos filtros.</p>
                  </div>
                ) : (
                  <>
                    <div className="pagination pagination--top">
                      <PreviousLink className="pagination__nav">
                        {isLoading ? '…' : <Icon name="chevronLeft" />}
                      </PreviousLink>
                    </div>
                    <div className={`prodgrid${view === 'list' ? ' prodgrid--list' : ''}`}>
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
                )
              }
            </Pagination>
          </div>
        </div>
      </div>
    </section>
  );
}
