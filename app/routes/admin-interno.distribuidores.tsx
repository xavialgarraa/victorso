import {useState} from 'react';
import {Form, data, useActionData, useFetcher, useLoaderData, useNavigation, useSearchParams} from 'react-router';
import type {Route} from './+types/admin-interno.distribuidores';
import {requireAdminUser} from '~/lib/adminSession.server';
import {AdminShell} from '~/components/admin/AdminShell';
import {
  getDistributorFeedMeta,
  getDistributorProducts,
  getSelection,
  saveSelection,
  listDistributorSyncHistory,
  type DistributorProduct,
} from '~/lib/connectors/distributorFeed.server';
import {
  applyDistributorCreations,
  buildDistributorSyncSummary,
  type DistributorSyncSummary,
} from '~/lib/connectors/distributorSync.server';
import {
  applyPriceChanges,
  applyStockChanges,
  draftProducts,
  getPrimaryLocationId,
  getShopifyCatalogByBarcode,
} from '~/lib/shopifyProducts.server';

export const meta: Route.MetaFunction = () => {
  return [{title: 'Distribuidores — Panel interno'}];
};

// "ftp": el catálogo lo deja un script externo en Firestore (GitHub Action,
// cada noche) porque Oxygen no puede hablar FTP — ver distributorFeed.server.ts.
// "live": Walkasse ya habla HTTP, así que Oxygen lee su feed directo, sin caché.
const SUPPLIERS = [
  {id: 'zentralmedia', name: 'Zentralmedia', mode: 'ftp' as const},
  {id: 'midwich', name: 'Midwich', mode: 'ftp' as const},
  {id: 'walkasse', name: 'Walkasse', mode: 'live' as const},
];

const PAGE_SIZE = 60;

export async function loader({request, context}: Route.LoaderArgs) {
  const {user, headers} = await requireAdminUser(request, context.env);
  const url = new URL(request.url);
  const supplierId = url.searchParams.get('supplier') || SUPPLIERS[0].id;
  const q = (url.searchParams.get('q') || '').trim().toLowerCase();
  const onlySelected = url.searchParams.get('onlySelected') === '1';
  const page = Math.max(1, Number(url.searchParams.get('page') || '1') || 1);

  const ftpSuppliers = SUPPLIERS.filter((s) => s.mode === 'ftp');

  const [ftpMetas, allProducts, selection, catalog] = await Promise.all([
    // El historial completo (14 ejecuciones) solo hace falta del
    // proveedor que se está viendo — de los demás basta la última, para
    // el punto de estado de la fila de arriba ("conectado"/"falló").
    Promise.all(
      ftpSuppliers.map(async (s) => {
        const [meta, history] = await Promise.all([
          getDistributorFeedMeta(context.env, s.id),
          listDistributorSyncHistory(context.env, s.id, s.id === supplierId ? 14 : 1),
        ]);
        return {id: s.id, meta, history};
      }),
    ),
    getDistributorProducts(context.env, supplierId),
    getSelection(context.env, supplierId),
    getShopifyCatalogByBarcode(context.env),
  ]);

  const savedEans = new Set(selection?.selectedEans ?? []);
  // Productos cuyo EAN ya existe en Shopify — para Walkasse esto es "ya se
  // sincroniza" por el mecanismo de siempre (ver /admin-interno/proveedores),
  // así que no hace falta marcarlos aquí: se muestran ya conectados en vez
  // de pedir que se seleccionen.
  const connectedEans = new Set(allProducts.filter((p) => catalog.has(p.ean)).map((p) => p.ean));
  // Antes de guardar nada para este proveedor, un producto ya conectado
  // sale marcado por defecto (tiene sentido: ya está en la tienda). Pero
  // en cuanto se ha guardado una vez, esa elección manual es la que
  // manda — si alguien desmarca uno conectado y guarda, tiene que
  // quedarse desmarcado, no volver a aparecer marcado solo porque sigue
  // existiendo en Shopify (eso pasaba antes: el checkbox hacía
  // selected || connected siempre, ignorando lo guardado).
  const selectedEans = selection ? savedEans : new Set([...savedEans, ...connectedEans]);

  // Cuántos productos hay "marcados para la web" de CADA proveedor (no
  // solo el que se está viendo), para la fila de estado de arriba.
  // Walkasse no usa esta selección manual en absoluto (se conecta solo
  // por EAN existente, ver más arriba) — ahí lo que importa es cuántos
  // de sus productos ya están de verdad en la tienda, reutilizando el
  // mismo catálogo de Shopify que ya se ha pedido para éste proveedor,
  // no una selección guardada que para Walkasse nunca se rellena.
  const overviewSelection = await Promise.all(
    SUPPLIERS.map(async (s) => {
      if (s.mode === 'live') {
        if (s.id === supplierId) {
          return {id: s.id, selectedCount: connectedEans.size};
        }
        const products = await getDistributorProducts(context.env, s.id);
        return {id: s.id, selectedCount: products.filter((p) => catalog.has(p.ean)).length};
      }
      if (s.id === supplierId) return {id: s.id, selectedCount: selectedEans.size};
      const sel = await getSelection(context.env, s.id);
      return {id: s.id, selectedCount: sel?.selectedEans.length ?? 0};
    }),
  );

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
      ftpMetas,
      overviewSelection,
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
      connectedEans: Array.from(connectedEans),
      // Solo para los productos de esta página — así el botón "pasar a
      // borrador" sabe a qué producto de Shopify apuntar sin tener que
      // volver a cruzar por EAN en el cliente.
      connectedProductIds: Object.fromEntries(
        pageItems.filter((p) => connectedEans.has(p.ean)).map((p) => [p.ean, catalog.get(p.ean)!.productId]),
      ),
    },
    {headers},
  );
}

type ActionResult =
  | {intent: 'save-selection'; ok: true; supplierId: string; selectedCount: number}
  | {intent: 'save-selection'; ok: false; error: string}
  | {intent: 'compare'; ok: true; supplierId: string; summary: DistributorSyncSummary}
  | {intent: 'compare'; ok: false; supplierId: string; error: string}
  | {
      intent: 'create-batch';
      ok: true;
      supplierId: string;
      created: number;
      errors: Array<{name: string; message: string}>;
      remaining: number;
      summary: DistributorSyncSummary;
    }
  | {intent: 'create-batch'; ok: false; error: string}
  | {intent: 'apply-stock'; ok: true; supplierId: string; applied: number; errors: string[]; summary: DistributorSyncSummary}
  | {intent: 'apply-stock'; ok: false; error: string}
  | {intent: 'apply-price'; ok: true; supplierId: string; applied: number; errors: string[]; summary: DistributorSyncSummary}
  | {intent: 'apply-price'; ok: false; error: string}
  | {intent: 'draft-connected'; ok: true; ean: string}
  | {intent: 'draft-connected'; ok: false; ean: string; error: string};

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
      const products = await getDistributorProducts(context.env, supplierId);
      const summary = await buildDistributorSyncSummary(context.env, supplierId, products);
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
      const products = await getDistributorProducts(context.env, supplierId);
      const summary = await buildDistributorSyncSummary(context.env, supplierId, products);
      const result = await applyDistributorCreations(context.env, summary.toCreate);
      // Se recalcula tras crear para que la tabla de la pantalla refleje lo
      // que queda de verdad (y no obligue a pulsar "Comparar" otra vez).
      const freshSummary = await buildDistributorSyncSummary(context.env, supplierId, products);
      return data<ActionResult>(
        {
          intent: 'create-batch',
          ok: true,
          supplierId,
          created: result.created,
          errors: result.errors,
          remaining: Math.max(0, summary.toCreate.length - result.created),
          summary: freshSummary,
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
      const products = await getDistributorProducts(context.env, supplierId);
      const summary = await buildDistributorSyncSummary(context.env, supplierId, products);
      const locationId = await getPrimaryLocationId(context.env);
      const changes = summary.toUpdateStock.map((r) => ({
        inventoryItemId: r.catalogVariant.inventoryItemId,
        quantity: r.stockTo,
      }));
      const result = await applyStockChanges(context.env, locationId, changes);
      const freshSummary = await buildDistributorSyncSummary(context.env, supplierId, products);
      return data<ActionResult>(
        {intent: 'apply-stock', ok: true, supplierId, applied: result.applied, errors: result.errors, summary: freshSummary},
        {headers},
      );
    } catch (error) {
      return data<ActionResult>(
        {intent: 'apply-stock', ok: false, error: error instanceof Error ? error.message : 'Error desconocido.'},
        {headers},
      );
    }
  }

  if (intent === 'apply-price') {
    try {
      const products = await getDistributorProducts(context.env, supplierId);
      const summary = await buildDistributorSyncSummary(context.env, supplierId, products);
      const changes = summary.toUpdatePrice.map((r) => ({
        productId: r.catalogVariant.productId,
        variantId: r.catalogVariant.variantId,
        price: r.priceTo,
      }));
      const result = await applyPriceChanges(context.env, changes);
      const freshSummary = await buildDistributorSyncSummary(context.env, supplierId, products);
      return data<ActionResult>(
        {intent: 'apply-price', ok: true, supplierId, applied: result.applied, errors: result.errors, summary: freshSummary},
        {headers},
      );
    } catch (error) {
      return data<ActionResult>(
        {intent: 'apply-price', ok: false, error: error instanceof Error ? error.message : 'Error desconocido.'},
        {headers},
      );
    }
  }

  if (intent === 'draft-connected') {
    const ean = String(formData.get('ean') || '');
    const productId = String(formData.get('productId') || '');
    try {
      const result = await draftProducts(context.env, [productId]);
      if (result.errors.length > 0) {
        return data<ActionResult>({intent: 'draft-connected', ok: false, ean, error: result.errors[0]}, {headers});
      }
      return data<ActionResult>({intent: 'draft-connected', ok: true, ean}, {headers});
    } catch (error) {
      return data<ActionResult>(
        {intent: 'draft-connected', ok: false, ean, error: error instanceof Error ? error.message : 'Error desconocido.'},
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
    let prevSelected: Set<string>;
    if (existing) {
      prevSelected = new Set(existing.selectedEans);
    } else {
      // Primer guardado de este proveedor: antes de esto, un producto ya
      // conectado a Shopify salía marcado "de oficio" en pantalla (ver el
      // loader) sin que esa elección estuviera guardada en ningún sitio.
      // Si aquí se partiera de un set vacío, guardar solo esta página
      // "olvidaría" los conectados de las demás páginas que nadie ha
      // tocado todavía — se parte del conjunto completo de conectados
      // como base, y encima se aplican los cambios de esta página.
      const [products, catalog] = await Promise.all([
        getDistributorProducts(context.env, supplierId),
        getShopifyCatalogByBarcode(context.env),
      ]);
      prevSelected = new Set(products.filter((p) => catalog.has(p.ean)).map((p) => p.ean));
    }
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

function ProductCard({
  product,
  checked,
  connected,
  connectedProductId,
  supplierId,
}: {
  product: DistributorProduct;
  checked: boolean;
  connected: boolean;
  connectedProductId?: string;
  supplierId: string;
}) {
  // Botón propio con su fetcher — no puede ser un <Form> normal porque la
  // tarjeta ya vive dentro del <Form> grande de guardar selección, y un
  // <form> no puede anidar otro <form> (HTML inválido).
  const draftFetcher = useFetcher<ActionResult>();
  const isDrafting = draftFetcher.state !== 'idle';
  const draftError =
    draftFetcher.data?.intent === 'draft-connected' && !draftFetcher.data.ok ? draftFetcher.data.error : null;
  const draftDone = draftFetcher.data?.intent === 'draft-connected' && draftFetcher.data.ok;
  const checkboxId = `ean-${product.ean}`;
  // Zentralmedia y Midwich dan, para parte del catálogo, URLs de foto que ya
  // no existen en su servidor (404 — no es cosa nuestra). Sin esto el
  // navegador muestra el icono feo de "imagen rota" en vez del aviso
  // "Sin foto" que ya usamos cuando el distribuidor no manda URL.
  const [imgFailed, setImgFailed] = useState(false);
  return (
    <div className={`dist-card${checked ? ' dist-card--checked' : ''}`}>
      <input
        id={checkboxId}
        type="checkbox"
        name="ean"
        value={product.ean}
        defaultChecked={checked}
        className="admin-check dist-card__checkbox"
        title={connected ? 'Ya existe en Shopify — puedes desmarcarlo si no quieres que siga así' : undefined}
      />
      <label htmlFor={checkboxId} className="dist-card__clickarea">
        <div className="dist-card__img">
          {product.imageUrl && !imgFailed ? (
            <img src={product.imageUrl} alt="" loading="lazy" onError={() => setImgFailed(true)} />
          ) : (
            <span>Sin foto</span>
          )}
        </div>
        <div className="dist-card__body">
          <div className="dist-card__title">{product.title || product.sku}</div>
          <div className="dist-card__sub">
            {product.brand && <>{product.brand} · </>}
            {product.category}
          </div>
          <div className="dist-card__footer">
            <span className="dist-card__price">{product.price.toFixed(2)}€</span>
            <span className={`dist-card__stock ${product.stock > 0 ? 'dist-card__stock--in' : 'dist-card__stock--out'}`}>
              {product.stock > 0 ? `Stock ${product.stock}` : 'Sin stock'}
            </span>
            {connected ? (
              <span className="dist-card__shopify-state dist-card__shopify-state--connected">
                <span className="dist-card__shopify-state-dot" aria-hidden="true" />
                En Shopify
              </span>
            ) : checked ? (
              <span className="dist-card__shopify-state dist-card__shopify-state--pending">
                <span className="dist-card__shopify-state-dot" aria-hidden="true" />
                Pendiente de crear
              </span>
            ) : null}
          </div>
          <div className="dist-card__ean">EAN {product.ean}</div>
        </div>
      </label>
      {connected && connectedProductId && !draftDone && (
        <button
          type="button"
          className="admin-btn admin-btn--danger dist-card__draft-btn"
          disabled={isDrafting}
          onClick={() => {
            if (!confirm(`¿Pasar "${product.title || product.sku}" a borrador en Shopify? Dejará de verse en la tienda.`)) {
              return;
            }
            draftFetcher.submit(
              {intent: 'draft-connected', supplierId, ean: product.ean, productId: connectedProductId},
              {method: 'post'},
            );
          }}
        >
          {isDrafting && <span className="admin-spinner" aria-hidden="true" />}
          {isDrafting ? 'Pasando a borrador…' : 'Pasar a borrador'}
        </button>
      )}
      {draftDone && <p className="admin-hint" style={{margin: '4px 12px'}}>Pasado a borrador.</p>}
      {draftError && <p className="admin-msg--error" style={{margin: '4px 12px'}}>{draftError}</p>}
    </div>
  );
}

export default function AdminDistribuidores() {
  const {
    user,
    ftpMetas,
    overviewSelection,
    supplierId,
    q,
    onlySelected,
    page,
    totalPages,
    totalFiltered,
    totalAll,
    selectedCount,
    pageItems,
    selectedEans,
    connectedEans,
    connectedProductIds,
  } = useLoaderData<typeof loader>();
  const [searchParams] = useSearchParams();
  const navigation = useNavigation();
  const actionData = useActionData<typeof action>();
  const isBusy = navigation.state !== 'idle';
  const busyIntent = navigation.formData?.get('intent');
  // "loading" (sin formData) = cambiar de pestaña, página o filtro — una
  // navegación GET normal, no una acción. Ahí es donde antes no se veía
  // ningún indicador de que la pantalla se estaba actualizando.
  const isLoadingList = navigation.state === 'loading' && !navigation.formData;
  const selectedSet = new Set(selectedEans);
  const connectedSet = new Set(connectedEans);

  const createResult = actionData?.intent === 'create-batch' ? actionData : null;
  const applyStockResult = actionData?.intent === 'apply-stock' ? actionData : null;
  const applyPriceResult = actionData?.intent === 'apply-price' ? actionData : null;
  // "Comparar", "crear lote" y "actualizar stock/precio" devuelven todos un
  // resumen actualizado — se usa el último que haya llegado, para el
  // proveedor que se está viendo, así la tabla no desaparece después de
  // aplicar un cambio y hace falta pulsar "Comparar" otra vez.
  const summary =
    actionData?.ok && 'summary' in actionData && actionData.supplierId === supplierId ? actionData.summary : null;
  const compareError = actionData?.intent === 'compare' && !actionData.ok ? actionData.error : null;

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
      <h1>Distribuidores</h1>
      <p className="admin-hint" style={{maxWidth: 680}}>
        Marca qué productos de cada distribuidor quieres que existan en la web — solo esos se crean/actualizan, el
        resto del catálogo se ignora. Zentralmedia y Midwich solo hablan FTP, así que su catálogo lo refresca un
        proceso aparte cada noche; Walkasse se lee en vivo cada vez que entras aquí. El precio que ves aquí es el
        del distribuidor, no el de Shopify — nunca se aplica solo, hace falta pulsar "Actualizar precio" más abajo.
      </p>

      <div className="dist-tabs">
        {SUPPLIERS.map((s) => {
          const active = s.id === supplierId;
          const info = s.mode === 'ftp' ? ftpMetas.find((m) => m.id === s.id) : null;
          const meta = info?.meta ?? null;
          const lastRun = info?.history[0] ?? null;
          const selectedForSupplier = overviewSelection.find((o) => o.id === s.id)?.selectedCount ?? 0;
          // Punto de estado: rojo si la última sincronización falló (lo
          // anota el propio script, ver sync-ftp-feeds.mjs), ámbar si
          // nunca ha sincronizado, verde si hay un catálogo al día —
          // para verlo de un vistazo sin entrar en cada pestaña.
          const dotClass =
            s.mode === 'live'
              ? 'dist-tab__dot--ok'
              : lastRun && !lastRun.ok
                ? 'dist-tab__dot--error'
                : meta
                  ? 'dist-tab__dot--ok'
                  : 'dist-tab__dot--pending';
          return (
            <a key={s.id} href={`?supplier=${s.id}`} className={`dist-tab${active ? ' dist-tab--active' : ''}`}>
              <span className="dist-tab__name">
                <span className={`dist-tab__dot ${dotClass}`} aria-hidden="true" />
                {s.name}
              </span>
              {s.mode === 'live' ? (
                <span className="dist-tab__badge">En vivo</span>
              ) : meta ? (
                <span className="dist-tab__meta">
                  {meta.totalCount} productos · act. {new Date(meta.updatedAt).toLocaleString('es-ES', {day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'})}
                  {lastRun && !lastRun.ok && <> · ⚠ falló la última sync</>}
                </span>
              ) : (
                <span className="dist-tab__meta">Sin sincronizar</span>
              )}
              <span className="dist-tab__meta">{selectedForSupplier} marcados para la web</span>
            </a>
          );
        })}
        <div className="dist-tab dist-tab--disabled">
          <span className="dist-tab__name">
            <span className="dist-tab__dot dist-tab__dot--pending" aria-hidden="true" />
            Audio-Technica
          </span>
          <span className="dist-tab__meta">Pendiente — esperando que autoricen nuestra IP fija</span>
        </div>
      </div>

      {(() => {
        const activeInfo = ftpMetas.find((m) => m.id === supplierId);
        if (!activeInfo) return null;
        return (
          <div className="admin-card" style={{marginBottom: 18}}>
            <strong>Historial de sincronización — {SUPPLIERS.find((s) => s.id === supplierId)?.name}</strong>
            <p className="admin-hint" style={{marginTop: 4}}>
              Una fila por cada vez que se ha ejecutado el proceso nocturno (sobre las 4-5h de España). "Altas" y
              "bajas" son productos que han aparecido o desaparecido del feed del distribuidor; "precio"/"stock" son
              cuántos productos ya existentes cambiaron de precio o de stock ese día.
            </p>
            {activeInfo.history.length === 0 ? (
              <p className="admin-hint">Todavía no hay ninguna ejecución registrada para este distribuidor.</p>
            ) : (
              <div className="admin-scroll" style={{maxHeight: 260, marginTop: 8}}>
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Resultado</th>
                      <th>Productos</th>
                      <th>Altas</th>
                      <th>Bajas</th>
                      <th>Precio</th>
                      <th>Stock</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeInfo.history.map((h) => (
                      <tr key={h.ranAt}>
                        <td>
                          {new Date(h.ranAt).toLocaleString('es-ES', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </td>
                        <td>
                          {h.ok ? (
                            <span style={{color: '#1a9c53', fontWeight: 600}}>OK</span>
                          ) : (
                            <span className="admin-msg--error" title={h.error}>
                              Falló{h.error ? `: ${h.error.slice(0, 80)}` : ''}
                            </span>
                          )}
                        </td>
                        <td>{h.ok ? h.totalCount : '—'}</td>
                        <td>{h.ok ? `+${h.added}` : '—'}</td>
                        <td>{h.ok ? `-${h.removed}` : '—'}</td>
                        <td>{h.ok ? h.priceChanged : '—'}</td>
                        <td>{h.ok ? h.stockChanged : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })()}

      <Form method="get" className="dist-toolbar">
        <input type="hidden" name="supplier" value={supplierId} />
        <input type="text" name="q" defaultValue={q} placeholder="Buscar por nombre, marca, EAN..." />
        <label className="dist-toolbar__check">
          <input type="checkbox" name="onlySelected" value="1" defaultChecked={onlySelected} className="admin-check" />
          Solo seleccionados
        </label>
        <button type="submit" className="admin-btn admin-btn--outline">
          Filtrar
        </button>
        <span className="dist-toolbar__count">
          {totalFiltered} de {totalAll} · {selectedCount} seleccionados en total
        </span>
      </Form>

      <Form method="post">
        <input type="hidden" name="intent" value="save-selection" />
        <input type="hidden" name="supplierId" value={supplierId} />
        {pageItems.map((p) => (
          <input key={`page-${p.ean}`} type="hidden" name="pageEans" value={p.ean} />
        ))}

        <div className="dist-grid-wrap">
          {isLoadingList && (
            <div className="dist-grid-overlay">
              <span className="admin-spinner" aria-hidden="true" />
              Actualizando catálogo…
            </div>
          )}
          <div className="dist-grid">
            {pageItems.map((p) => (
              <ProductCard
                key={p.ean}
                product={p}
                checked={selectedSet.has(p.ean)}
                connected={connectedSet.has(p.ean)}
                connectedProductId={connectedProductIds[p.ean]}
                supplierId={supplierId}
              />
            ))}
          </div>
        </div>

        {pageItems.length === 0 && <p className="admin-hint">No hay productos que coincidan con el filtro.</p>}

        <div className="dist-selectbar">
          <button type="submit" className="admin-btn admin-btn--primary" disabled={isBusy}>
            {isBusy && busyIntent === 'save-selection' && <span className="admin-spinner" aria-hidden="true" />}
            {isBusy && busyIntent === 'save-selection' ? 'Guardando…' : 'Guardar selección de esta página'}
          </button>

          <div className="dist-pagination">
            {page > 1 && (
              <a className="admin-btn admin-btn--outline" href={pageHref({page: String(page - 1)})}>
                ← Anterior
              </a>
            )}
            <span>
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
          publicarlos a mano en Shopify, no salen solos a la tienda); a los que ya existen se les compara stock y
          precio por separado, y cada uno se actualiza con su propio botón. La categoría de cada producto nuevo la
          decide la IA con las categorías reales de la web.
        </p>
        <Form method="post">
          <input type="hidden" name="intent" value="compare" />
          <input type="hidden" name="supplierId" value={supplierId} />
          <button type="submit" className="admin-btn admin-btn--primary" disabled={isBusy}>
            {isBusy && busyIntent === 'compare' && <span className="admin-spinner" aria-hidden="true" />}
            {isBusy && busyIntent === 'compare' ? 'Comparando…' : 'Comparar con Shopify'}
          </button>
        </Form>

        {compareError && <p className="admin-msg--error">{compareError}</p>}

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
                <span className="admin-stat__value">{summary.toUpdatePrice.length}</span>
                <span className="admin-stat__label">Ya existen, precio distinto</span>
              </div>
              <div className="admin-stat">
                <span className="admin-stat__value">{summary.unchanged}</span>
                <span className="admin-stat__label">Sin cambios</span>
              </div>
            </div>

            {summary.toUpdateStock.length > 0 ? (
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
                    {isBusy && busyIntent === 'apply-stock' && <span className="admin-spinner" aria-hidden="true" />}
                    {isBusy && busyIntent === 'apply-stock'
                      ? 'Actualizando…'
                      : `Actualizar stock de ${summary.toUpdateStock.length} productos`}
                  </button>
                </Form>
              </>
            ) : null}
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

            {summary.toUpdatePrice.length > 0 ? (
              <>
                <h3 style={{marginTop: 24}}>Actualizar precio ({summary.toUpdatePrice.length})</h3>
                <p className="dist-price-note">
                  <span aria-hidden="true">💶</span>
                  <span>
                    <strong>El precio de Shopify nunca cambia solo.</strong> Si lo tocas a mano en Shopify, se
                    queda como lo pongas — el precio del distribuidor de aquí abajo es solo informativo, nada lo
                    aplica automáticamente. La única forma de que el precio de un producto cambie es pulsando el
                    botón de abajo, y solo afecta a los productos listados en ese momento.
                  </span>
                </p>
                <div className="admin-scroll" style={{maxHeight: 240}}>
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>Producto</th>
                        <th>Shopify → Distribuidor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.toUpdatePrice.slice(0, 200).map((r) => (
                        <tr key={r.product.ean}>
                          <td>{r.catalogVariant.title}</td>
                          <td>
                            {r.priceFrom.toFixed(2)}€ → {r.priceTo.toFixed(2)}€
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Form method="post" style={{marginTop: 12}}>
                  <input type="hidden" name="intent" value="apply-price" />
                  <input type="hidden" name="supplierId" value={supplierId} />
                  <button type="submit" className="admin-btn admin-btn--outline" disabled={isBusy}>
                    {isBusy && busyIntent === 'apply-price' && <span className="admin-spinner" aria-hidden="true" />}
                    {isBusy && busyIntent === 'apply-price'
                      ? 'Actualizando…'
                      : `Actualizar precio de ${summary.toUpdatePrice.length} productos`}
                  </button>
                </Form>
              </>
            ) : null}
            {applyPriceResult && (
              applyPriceResult.ok ? (
                <p className="admin-msg--ok">
                  Precio actualizado en {applyPriceResult.applied} productos.
                  {applyPriceResult.errors.length > 0 && ` ${applyPriceResult.errors.length} errores.`}
                </p>
              ) : (
                <p className="admin-msg--error">{applyPriceResult.error}</p>
              )
            )}

            {summary.toCreate.length > 0 ? (
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
                    {isBusy && busyIntent === 'create-batch' && <span className="admin-spinner" aria-hidden="true" />}
                    {isBusy && busyIntent === 'create-batch' ? 'Creando…' : 'Crear siguiente lote (borrador)'}
                  </button>
                </Form>
              </>
            ) : null}
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
          </div>
        )}
      </div>
    </AdminShell>
  );
}
