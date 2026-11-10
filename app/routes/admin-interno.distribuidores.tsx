import {Form, data, useActionData, useLoaderData, useNavigation, useSearchParams} from 'react-router';
import type {Route} from './+types/admin-interno.distribuidores';
import {requireAdminUser} from '~/lib/adminSession.server';
import {AdminShell} from '~/components/admin/AdminShell';
import {
  getDistributorFeedMeta,
  getSelection,
  listDistributorProducts,
  saveSelection,
  type DistributorProduct,
} from '~/lib/connectors/distributorFeed.server';
import {
  applyDistributorCreations,
  buildDistributorSyncSummary,
  type DistributorSyncSummary,
} from '~/lib/connectors/distributorSync.server';
import {applyStockChanges, getPrimaryLocationId} from '~/lib/shopifyProducts.server';

export const meta: Route.MetaFunction = () => {
  return [{title: 'Distribuidores (FTP) — Panel interno'}];
};

// Audio-Technica se queda fuera por ahora: su FTP solo admite IPs ya
// autorizadas por ellos y los runners que usamos no tienen IP fija — ver
// scripts/supplier-feeds/README.md.
const DISTRIBUTORS = [
  {id: 'zentralmedia', name: 'Zentralmedia'},
  {id: 'midwich', name: 'Midwich'},
];

const PAGE_SIZE = 60;

export async function loader({request, context}: Route.LoaderArgs) {
  const {user, headers} = await requireAdminUser(request, context.env);
  const url = new URL(request.url);
  const supplierId = url.searchParams.get('supplier') || 'zentralmedia';
  const q = (url.searchParams.get('q') || '').trim().toLowerCase();
  const onlySelected = url.searchParams.get('onlySelected') === '1';
  const page = Math.max(1, Number(url.searchParams.get('page') || '1') || 1);

  const [metas, allProducts, selection] = await Promise.all([
    Promise.all(DISTRIBUTORS.map(async (d) => ({id: d.id, meta: await getDistributorFeedMeta(context.env, d.id)}))),
    listDistributorProducts(context.env, supplierId),
    getSelection(context.env, supplierId),
  ]);

  const selectedEans = new Set(selection?.selectedEans ?? []);

  let filtered = allProducts;
  if (q) {
    filtered = filtered.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.ean.includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.brand.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q),
    );
  }
  if (onlySelected) {
    filtered = filtered.filter((p) => selectedEans.has(p.ean));
  }

  const totalFiltered = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const pageItems = filtered.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

  return data(
    {
      user,
      metas,
      supplierId,
      q,
      onlySelected,
      page: pageSafe,
      totalPages,
      totalFiltered,
      totalAll: allProducts.length,
      selectedCount: selectedEans.size,
      pageItems,
      selectedEans: Array.from(selectedEans),
    },
    {headers},
  );
}

type ActionResult =
  | {intent: 'save-selection'; ok: true; supplierId: string; selectedCount: number}
  | {intent: 'save-selection'; ok: false; error: string}
  | {intent: 'compare'; ok: true; supplierId: string; summary: DistributorSyncSummary}
  | {intent: 'compare'; ok: false; supplierId: string; error: string}
  | {intent: 'create-batch'; ok: true; supplierId: string; created: number; errors: Array<{name: string; message: string}>; remaining: number}
  | {intent: 'create-batch'; ok: false; error: string}
  | {intent: 'apply-stock'; ok: true; supplierId: string; applied: number; errors: string[]}
  | {intent: 'apply-stock'; ok: false; error: string};

export async function action({request, context}: Route.ActionArgs) {
  const {user, headers} = await requireAdminUser(request, context.env);
  const formData = await request.formData();
  const intent = String(formData.get('intent') || 'save-selection');
  const supplierId = String(formData.get('supplierId') || '');
  if (!supplierId) {
    return data<ActionResult>({intent: 'save-selection', ok: false, error: 'Falta el proveedor.'}, {headers});
  }

  if (intent === 'compare') {
    try {
      const summary = await buildDistributorSyncSummary(context.env, supplierId);
      return data<ActionResult>({intent: 'compare', ok: true, supplierId, summary}, {headers});
    } catch (error) {
      return data<ActionResult>(
        {intent: 'compare', ok: false, supplierId, error: error instanceof Error ? error.message : 'Error desconocido.'},
        {headers},
      );
    }
  }

  if (intent === 'create-batch') {
    try {
      const summary = await buildDistributorSyncSummary(context.env, supplierId);
      const result = await applyDistributorCreations(context.env, summary.toCreate);
      return data<ActionResult>(
        {
          intent: 'create-batch',
          ok: true,
          supplierId,
          created: result.created,
          errors: result.errors,
          remaining: Math.max(0, summary.toCreate.length - result.created),
        },
        {headers},
      );
    } catch (error) {
      return data<ActionResult>(
        {intent: 'create-batch', ok: false, error: error instanceof Error ? error.message : 'Error desconocido.'},
        {headers},
      );
    }
  }

  if (intent === 'apply-stock') {
    try {
      const summary = await buildDistributorSyncSummary(context.env, supplierId);
      const locationId = await getPrimaryLocationId(context.env);
      const changes = summary.toUpdateStock.map((r) => ({
        inventoryItemId: r.catalogVariant.inventoryItemId,
        quantity: r.stockTo,
      }));
      const result = await applyStockChanges(context.env, locationId, changes);
      return data<ActionResult>(
        {intent: 'apply-stock', ok: true, supplierId, applied: result.applied, errors: result.errors},
        {headers},
      );
    } catch (error) {
      return data<ActionResult>(
        {intent: 'apply-stock', ok: false, error: error instanceof Error ? error.message : 'Error desconocido.'},
        {headers},
      );
    }
  }

  try {
    // El formulario solo incluye los productos de la página actual — para
    // no perder la selección hecha en otras páginas, se parte de la
    // selección previa completa y solo se actualiza el estado de los EANs
    // que estaban visibles en esta página (ver "pageEans" más abajo).
    const existing = await getSelection(context.env, supplierId);
    const prevSelected = new Set(existing?.selectedEans ?? []);
    const pageEans = formData.getAll('pageEans').map(String);
    const checkedEans = new Set(formData.getAll('ean').map(String));

    for (const ean of pageEans) {
      if (checkedEans.has(ean)) prevSelected.add(ean);
      else prevSelected.delete(ean);
    }

    await saveSelection(context.env, supplierId, Array.from(prevSelected), user.email);
    return data<ActionResult>(
      {intent: 'save-selection', ok: true, supplierId, selectedCount: prevSelected.size},
      {headers},
    );
  } catch (error) {
    return data<ActionResult>(
      {intent: 'save-selection', ok: false, error: error instanceof Error ? error.message : 'Error desconocido.'},
      {headers},
    );
  }
}

function ProductCard({product, checked}: {product: DistributorProduct; checked: boolean}) {
  return (
    <label
      className="admin-card"
      style={{
        display: 'flex',
        gap: 12,
        padding: 12,
        alignItems: 'flex-start',
        cursor: 'pointer',
        border: checked ? '2px solid var(--red)' : undefined,
      }}
    >
      <input type="checkbox" name="ean" value={product.ean} defaultChecked={checked} style={{width: 'auto', marginTop: 4}} />
      <div
        style={{
          width: 64,
          height: 64,
          flexShrink: 0,
          borderRadius: 8,
          background: 'var(--img-bg)',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {product.imageUrl ? (
          <img src={product.imageUrl} alt="" style={{width: '100%', height: '100%', objectFit: 'contain'}} loading="lazy" />
        ) : (
          <span style={{fontSize: '.7rem', color: '#9a9aa2'}}>Sin foto</span>
        )}
      </div>
      <div style={{flex: 1, minWidth: 0}}>
        <div style={{fontWeight: 600, fontSize: '.88rem'}}>{product.title || product.sku}</div>
        <div style={{fontSize: '.76rem', color: '#6b6b73', marginTop: 2}}>
          {product.brand && <>{product.brand} · </>}
          {product.category}
        </div>
        <div style={{fontSize: '.78rem', marginTop: 4}}>
          <strong>{product.price.toFixed(2)}€</strong>{' '}
          <span style={{color: product.stock > 0 ? '#1a7a3c' : '#a15c00'}}>
            {product.stock > 0 ? `Stock: ${product.stock}` : 'Sin stock'}
          </span>
        </div>
        <div style={{fontSize: '.74rem', color: '#9a9aa2', marginTop: 2}}>EAN {product.ean}</div>
      </div>
    </label>
  );
}

export default function AdminDistribuidores() {
  const {user, metas, supplierId, q, onlySelected, page, totalPages, totalFiltered, totalAll, selectedCount, pageItems, selectedEans} =
    useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const navigation = useNavigation();
  const actionData = useActionData<typeof action>();
  const isBusy = navigation.state !== 'idle';
  const busyIntent = navigation.formData?.get('intent');
  const selectedSet = new Set(selectedEans);

  const compareResult = actionData?.intent === 'compare' && actionData.supplierId === supplierId ? actionData : null;
  const summary = compareResult?.ok ? compareResult.summary : null;
  const createResult = actionData?.intent === 'create-batch' ? actionData : null;
  const applyStockResult = actionData?.intent === 'apply-stock' ? actionData : null;

  function pageHref(overrides: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams);
    for (const [key, value] of Object.entries(overrides)) {
      if (value === null) params.delete(key);
      else params.set(key, value);
    }
    return `?${params.toString()}`;
  }

  return (
    <AdminShell user={user} wide>
      <h1>Distribuidores (FTP)</h1>
      <p style={{color: '#6b6b73', fontSize: '.9rem', maxWidth: 680}}>
        Estos proveedores solo hablan FTP, así que un proceso aparte (GitHub Action, cada noche) descarga su
        catálogo y lo deja aquí. Marca qué productos quieres que existan en la web — solo esos se crearán/
        actualizarán, el resto del catálogo del distribuidor se ignora.
      </p>

      <div style={{display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap'}}>
        {DISTRIBUTORS.map((d) => {
          const meta = metas.find((m) => m.id === d.id)?.meta;
          const active = d.id === supplierId;
          return (
            <a
              key={d.id}
              href={`?supplier=${d.id}`}
              className="admin-card"
              style={{
                textDecoration: 'none',
                color: 'inherit',
                padding: '10px 16px',
                border: active ? '2px solid var(--red)' : undefined,
              }}
            >
              <strong>{d.name}</strong>
              <div style={{fontSize: '.78rem', color: '#6b6b73', marginTop: 2}}>
                {meta ? (
                  <>
                    {meta.totalCount} productos · actualizado {new Date(meta.updatedAt).toLocaleString()}
                  </>
                ) : (
                  'Todavía sin sincronizar'
                )}
              </div>
            </a>
          );
        })}
        <div className="admin-card" style={{padding: '10px 16px', opacity: 0.6}}>
          <strong>Audio-Technica</strong>
          <div style={{fontSize: '.78rem', color: '#6b6b73', marginTop: 2}}>
            Pendiente — su FTP bloquea nuestra conexión, hay que arreglar el acceso primero.
          </div>
        </div>
      </div>

      <Form method="get" style={{display: 'flex', gap: 10, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap'}}>
        <input type="hidden" name="supplier" value={supplierId} />
        <input
          type="text"
          name="q"
          defaultValue={q}
          placeholder="Buscar por nombre, marca, EAN..."
          style={{maxWidth: 280}}
        />
        <label style={{display: 'flex', alignItems: 'center', gap: 6, fontSize: '.85rem'}}>
          <input type="checkbox" name="onlySelected" value="1" defaultChecked={onlySelected} style={{width: 'auto'}} />
          Solo seleccionados
        </label>
        <button type="submit" className="admin-btn admin-btn--outline">
          Filtrar
        </button>
        <span style={{fontSize: '.85rem', color: '#6b6b73'}}>
          {totalFiltered} de {totalAll} · {selectedCount} seleccionados en total
        </span>
      </Form>

      <Form method="post">
        <input type="hidden" name="supplierId" value={supplierId} />
        {pageItems.map((p) => (
          <input key={`page-${p.ean}`} type="hidden" name="pageEans" value={p.ean} />
        ))}

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 10,
            marginBottom: 16,
          }}
        >
          {pageItems.map((p) => (
            <ProductCard key={p.ean} product={p} checked={selectedSet.has(p.ean)} />
          ))}
        </div>

        {pageItems.length === 0 && <p className="admin-hint">No hay productos que coincidan con el filtro.</p>}

        <div style={{display: 'flex', gap: 10, alignItems: 'center'}}>
          <button type="submit" className="admin-btn admin-btn--primary" disabled={isBusy}>
            {isBusy ? 'Guardando…' : 'Guardar selección de esta página'}
          </button>

          <div style={{display: 'flex', gap: 6, marginLeft: 'auto'}}>
            {page > 1 && (
              <a className="admin-btn admin-btn--outline" href={pageHref({page: String(page - 1)})}>
                ← Anterior
              </a>
            )}
            <span style={{fontSize: '.85rem', alignSelf: 'center'}}>
              Página {page} de {totalPages}
            </span>
            {page < totalPages && (
              <a className="admin-btn admin-btn--outline" href={pageHref({page: String(page + 1)})}>
                Siguiente →
              </a>
            )}
          </div>
        </div>
      </Form>

      <div className="admin-card" style={{marginTop: 24}}>
        <div>
          <strong>Crear/actualizar en Shopify</strong>
        </div>
        <p className="admin-hint" style={{maxWidth: 640}}>
          Compara los {selectedCount} productos marcados de este distribuidor contra el catálogo real de Shopify
          (por EAN). Los que no existen se proponen para <strong>crear como borrador</strong> (hay que revisarlos y
          publicarlos a mano en Shopify, no salen solos a la tienda); los que ya existen solo se les actualiza el
          stock. La categoría de cada producto nuevo la decide la IA con las categorías reales de la web.
        </p>
        <Form method="post">
          <input type="hidden" name="intent" value="compare" />
          <input type="hidden" name="supplierId" value={supplierId} />
          <button type="submit" className="admin-btn admin-btn--primary" disabled={isBusy}>
            {isBusy && busyIntent === 'compare' ? 'Comparando…' : 'Comparar con Shopify'}
          </button>
        </Form>

        {compareResult && !compareResult.ok && <p className="admin-msg--error">{compareResult.error}</p>}

        {summary && (
          <div style={{marginTop: 20}}>
            <div className="admin-stats">
              <div className="admin-stat">
                <span className="admin-stat__value">{summary.totalSelected}</span>
                <span className="admin-stat__label">Marcados para esta web</span>
              </div>
              <div className="admin-stat">
                <span className="admin-stat__value">{summary.toCreate.length}</span>
                <span className="admin-stat__label">Por crear (borrador)</span>
              </div>
              <div className="admin-stat">
                <span className="admin-stat__value">{summary.toUpdateStock.length}</span>
                <span className="admin-stat__label">Ya existen, stock distinto</span>
              </div>
              <div className="admin-stat">
                <span className="admin-stat__value">{summary.unchanged}</span>
                <span className="admin-stat__label">Sin cambios</span>
              </div>
            </div>

            {summary.toUpdateStock.length > 0 && (
              <>
                <h3 style={{marginTop: 20}}>Actualizar stock ({summary.toUpdateStock.length})</h3>
                <div className="admin-scroll" style={{maxHeight: 240}}>
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Producto</th>
                        <th>Stock</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.toUpdateStock.slice(0, 200).map((r) => (
                        <tr key={r.product.ean}>
                          <td>{r.catalogVariant.title}</td>
                          <td>
                            {r.stockFrom} → {r.stockTo}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Form method="post" style={{marginTop: 12}}>
                  <input type="hidden" name="intent" value="apply-stock" />
                  <input type="hidden" name="supplierId" value={supplierId} />
                  <button type="submit" className="admin-btn admin-btn--outline" disabled={isBusy}>
                    {isBusy && busyIntent === 'apply-stock'
                      ? 'Actualizando…'
                      : `Actualizar stock de ${summary.toUpdateStock.length} productos`}
                  </button>
                </Form>
                {applyStockResult && (
                  applyStockResult.ok ? (
                    <p className="admin-msg--ok">
                      Stock actualizado en {applyStockResult.applied} productos.
                      {applyStockResult.errors.length > 0 && ` ${applyStockResult.errors.length} errores.`}
                    </p>
                  ) : (
                    <p className="admin-msg--error">{applyStockResult.error}</p>
                  )
                )}
              </>
            )}

            {summary.toCreate.length > 0 && (
              <>
                <h3 style={{marginTop: 24}}>Crear productos nuevos ({summary.toCreate.length})</h3>
                <div className="admin-scroll" style={{maxHeight: 280}}>
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Producto</th>
                        <th>Categoría (IA)</th>
                        <th>Marca</th>
                        <th>Precio</th>
                        <th>Stock</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.toCreate.slice(0, 200).map((r) => (
                        <tr key={r.product.ean}>
                          <td>{r.product.title}</td>
                          <td>{r.category}</td>
                          <td>{r.product.brand || '—'}</td>
                          <td>{r.product.price.toFixed(2)}€</td>
                          <td>{r.product.stock}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Form method="post" style={{marginTop: 12}}>
                  <input type="hidden" name="intent" value="create-batch" />
                  <input type="hidden" name="supplierId" value={supplierId} />
                  <button type="submit" className="admin-btn admin-btn--primary" disabled={isBusy}>
                    {isBusy && busyIntent === 'create-batch' ? 'Creando…' : 'Crear siguiente lote (borrador)'}
                  </button>
                </Form>
                {createResult && (
                  createResult.ok ? (
                    <p className="admin-msg--ok">
                      Creados: {createResult.created}. Quedan {createResult.remaining} por crear.
                      {createResult.errors.length > 0 && (
                        <span> {createResult.errors.length} errores: {createResult.errors.slice(0, 5).map((e) => `${e.name}: ${e.message}`).join(' · ')}</span>
                      )}
                    </p>
                  ) : (
                    <p className="admin-msg--error">{createResult.error}</p>
                  )
                )}
              </>
            )}
          </div>
        )}
      </div>
    </AdminShell>
  );
}
