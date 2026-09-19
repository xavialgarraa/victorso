import {useState} from 'react';
import {Link, useSearchParams} from 'react-router';
import {Pagination} from '@shopify/hydrogen';
import type {ProductCardFragment} from 'storefrontapi.generated';
import {ProductCard} from '~/components/ProductCard';
import {Icon} from '~/lib/icons';

export type ListingFilter = {
  id: string;
  label: string;
  type?: string;
  values: Array<{id: string; label: string; count: number; input: string}>;
};

export type CategoryLink = {handle: string; title: string};

type PaginationConnection = React.ComponentProps<typeof Pagination<ProductCardFragment>>['connection'];

const PER_PAGE_OPTIONS = [12, 24, 48];

export function ProductListing({
  title,
  products,
  filters,
  sortOptions,
  resultCount,
  categoryLinks,
}: {
  title: string;
  products: PaginationConnection;
  filters: ListingFilter[];
  sortOptions: Array<{value: string; label: string}>;
  resultCount: number;
  categoryLinks?: CategoryLink[];
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

  function applyPriceFilter(input: string | null) {
    const next = new URLSearchParams(searchParams);
    const current = next.getAll('filter').filter((f) => !f.includes('"price"'));
    next.delete('filter');
    current.forEach((f) => next.append('filter', f));
    if (input) next.append('filter', input);
    setSearchParams(next, {preventScrollReset: true});
  }

  const priceFilter = filters.find((f) => f.type === 'PRICE_RANGE');
  const otherFilters = filters.filter((f) => f.type !== 'PRICE_RANGE' && f.values.length > 0);
  const selectedPriceInput = [...selectedFilters].find((f) => f.includes('"price"')) ?? null;

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
            {categoryLinks && categoryLinks.length > 0 && (
              <div className="filter-group">
                <h4>Categoría</h4>
                <div className="filter-group__pills">
                  {categoryLinks.map((c) => (
                    <Link key={c.handle} className="filter-pill" to={`/collections/${c.handle}`}>
                      {c.title}
                    </Link>
                  ))}
                </div>
              </div>
            )}
            {priceFilter && priceFilter.values[0] && (
              <PriceRangeFilter
                boundsInput={priceFilter.values[0].input}
                selectedInput={selectedPriceInput}
                onApply={applyPriceFilter}
              />
            )}
            {otherFilters.map((f) => (
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

function parsePriceInput(input: string): {min: number; max: number} | null {
  try {
    const parsed = JSON.parse(input) as {price?: {min?: number; max?: number}};
    if (!parsed.price) return null;
    return {min: parsed.price.min ?? 0, max: parsed.price.max ?? 0};
  } catch {
    return null;
  }
}

function PriceRangeFilter({
  boundsInput,
  selectedInput,
  onApply,
}: {
  boundsInput: string;
  selectedInput: string | null;
  onApply: (input: string | null) => void;
}) {
  const bounds = parsePriceInput(boundsInput);
  const selected = selectedInput ? parsePriceInput(selectedInput) : null;
  const floor = bounds ? Math.floor(bounds.min) : 0;
  const ceiling = bounds ? Math.ceil(bounds.max) : 0;

  const [min, setMin] = useState(selected?.min ?? floor);
  const [max, setMax] = useState(selected?.max ?? ceiling);

  if (!bounds || floor >= ceiling) return null;

  function commit(nextMin: number, nextMax: number) {
    if (nextMin <= floor && nextMax >= ceiling) {
      onApply(null);
    } else {
      onApply(JSON.stringify({price: {min: nextMin, max: nextMax}}));
    }
  }

  return (
    <div className="filter-group">
      <h4>Precio</h4>
      <div className="price-slider">
        <div className="price-slider__track">
          <div
            className="price-slider__range"
            style={{
              left: `${((min - floor) / (ceiling - floor)) * 100}%`,
              right: `${100 - ((max - floor) / (ceiling - floor)) * 100}%`,
            }}
          />
        </div>
        <input
          type="range"
          min={floor}
          max={ceiling}
          value={min}
          onChange={(e) => setMin(Math.min(Number(e.target.value), max))}
          onMouseUp={() => commit(min, max)}
          onTouchEnd={() => commit(min, max)}
        />
        <input
          type="range"
          min={floor}
          max={ceiling}
          value={max}
          onChange={(e) => setMax(Math.max(Number(e.target.value), min))}
          onMouseUp={() => commit(min, max)}
          onTouchEnd={() => commit(min, max)}
        />
      </div>
      <div className="price-inputs">
        <span>{min} €</span>
        <span>—</span>
        <span>{max} €</span>
      </div>
    </div>
  );
}
