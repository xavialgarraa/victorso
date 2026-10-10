import {Form, data, useActionData, useNavigation} from 'react-router';
import type {Route} from './+types/admin-interno.crear-producto';
import {requireAdminUser} from '~/lib/adminSession.server';
import {AdminShell} from '~/components/admin/AdminShell';
import {findStelOrderProductByReference, type StelOrderProduct} from '~/lib/connectors/stelorder.server';
import {
  applyStockChanges,
  createShopifyProduct,
  getOrCreateCollection,
  getPrimaryLocationId,
} from '~/lib/shopifyProducts.server';
import {uploadImageToShopify} from '~/lib/shopifyFiles.server';

export const meta: Route.MetaFunction = () => {
  return [{title: 'Crear producto — Panel interno'}];
};

export async function loader({request, context}: Route.LoaderArgs) {
  const {user, headers} = await requireAdminUser(request, context.env);
  return data({user}, {headers});
}

type ActionResult =
  | {intent: 'lookup-stelorder'; ok: true; product: StelOrderProduct | null; reference: string}
  | {intent: 'lookup-stelorder'; ok: false; error: string}
  | {intent: 'create-product'; ok: true; productId: string; title: string}
  | {intent: 'create-product'; ok: false; error: string};

function toBodyHtml(desc: string): string {
  if (!desc.trim()) return '';
  if (/<[a-z][\s\S]*>/i.test(desc)) return desc.trim();
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return desc
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
}

export async function action({request, context}: Route.ActionArgs) {
  const {headers} = await requireAdminUser(request, context.env);
  const formData = await request.formData();
  const intent = String(formData.get('intent') || '');

  if (intent === 'lookup-stelorder') {
    const reference = String(formData.get('reference') || '').trim();
    if (!reference) {
      return data<ActionResult>({intent: 'lookup-stelorder', ok: false, error: 'Escribe una referencia.'}, {headers});
    }
    if (!context.env.STELORDER_API_KEY) {
      return data<ActionResult>(
        {intent: 'lookup-stelorder', ok: false, error: 'Falta STELORDER_API_KEY en el entorno.'},
        {headers},
      );
    }
    try {
      const product = await findStelOrderProductByReference(context.env.STELORDER_API_KEY, reference);
      return data<ActionResult>({intent: 'lookup-stelorder', ok: true, product, reference}, {headers});
    } catch (error) {
      console.error('[admin-interno/crear-producto] lookup-stelorder', error);
      return data<ActionResult>(
        {intent: 'lookup-stelorder', ok: false, error: error instanceof Error ? error.message : 'Error desconocido.'},
        {headers},
      );
    }
  }

  if (intent === 'create-product') {
    try {
      const title = String(formData.get('title') || '').trim();
      const vendor = String(formData.get('vendor') || '').trim();
      const productType = String(formData.get('productType') || '').trim();
      const sku = String(formData.get('sku') || '').trim();
      const barcode = String(formData.get('barcode') || '').trim();
      const price = Number(String(formData.get('price') || '0').replace(',', '.'));
      const stock = Math.max(0, Math.round(Number(formData.get('stock') || '0')));
      const descriptionHtml = toBodyHtml(String(formData.get('description') || ''));

      if (!title) throw new Error('Falta el título.');
      if (!sku) throw new Error('Falta el SKU (referencia StelOrder).');
      if (!Number.isFinite(price) || price < 0.01) throw new Error('El precio no es válido.');

      const stelorderImages = formData.getAll('stelorderImages').map(String).filter(Boolean);
      const uploadedFiles = formData.getAll('images').filter((f): f is File => f instanceof File && f.size > 0);
      const uploadedUrls = await Promise.all(uploadedFiles.map((f: File) => uploadImageToShopify(context.env, f)));
      const images = [...stelorderImages, ...uploadedUrls].slice(0, 5);

      const collectionCache = new Map<string, string>();
      const collectionIds = productType ? [await getOrCreateCollection(context.env, productType, collectionCache)] : [];

      const result = await createShopifyProduct(context.env, {
        title,
        descriptionHtml,
        vendor,
        barcode,
        sku,
        price,
        stock,
        images,
        collectionIds,
        productType,
        taxonomyCategoryId: null,
      });

      if (stock > 0) {
        const locationId = await getPrimaryLocationId(context.env);
        await applyStockChanges(context.env, locationId, [{inventoryItemId: result.inventoryItemId, quantity: stock}]);
      }

      return data<ActionResult>({intent: 'create-product', ok: true, productId: result.productId, title}, {headers});
    } catch (error) {
      console.error('[admin-interno/crear-producto] create-product', error);
      return data<ActionResult>(
        {intent: 'create-product', ok: false, error: error instanceof Error ? error.message : 'Error desconocido.'},
        {headers},
      );
    }
  }

  return data<ActionResult>({intent: 'create-product', ok: false, error: 'Acción desconocida.'}, {headers});
}

export default function AdminCrearProducto({loaderData}: Route.ComponentProps) {
  const {user} = loaderData;
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isBusy = navigation.state !== 'idle';

  const lookup = actionData?.intent === 'lookup-stelorder' ? actionData : null;
  const found = lookup?.ok ? lookup.product : null;
  const createResult = actionData?.intent === 'create-product' ? actionData : null;

  return (
    <AdminShell user={user}>
      <h1>Crear producto</h1>
      <p style={{color: 'var(--text-muted)', fontSize: '.9rem', maxWidth: 640}}>
        Crea un producto nuevo y enlázalo a una referencia de StelOrder (su <code>full-reference</code>) para que, a
        partir de ahora, el stock se sincronice solo desde ahí — igual que el resto del catálogo migrado. El
        producto se crea en borrador: revísalo en Shopify antes de publicarlo.
      </p>

      <div className="admin-card">
        <h2 style={{marginTop: 0}}>1. Buscar en StelOrder (opcional)</h2>
        <p style={{color: 'var(--text-muted)', fontSize: '.85rem'}}>
          Si el producto ya existe en StelOrder, busca su referencia para rellenar precio, stock, código de barras e
          imágenes automáticamente. Si es un producto que no está en StelOrder, sáltate este paso y rellena el
          formulario de abajo a mano (el SKU puede ser cualquier referencia interna).
        </p>
        <Form method="post" className="admin-form" style={{flexDirection: 'row', alignItems: 'flex-end', gap: 8}}>
          <input type="hidden" name="intent" value="lookup-stelorder" />
          <div style={{flex: 1}}>
            <label>Referencia StelOrder (full-reference)</label>
            <input
              type="text"
              name="reference"
              defaultValue={lookup?.ok ? lookup.reference : ''}
              placeholder="Ej. RMX-IGNITE"
            />
          </div>
          <button type="submit" className="admin-btn admin-btn--outline" disabled={isBusy}>
            Buscar
          </button>
        </Form>
        {lookup && !lookup.ok && <p className="admin-msg--error">{lookup.error}</p>}
        {lookup?.ok && !found && <p className="admin-msg--error">No se encontró ningún producto con esa referencia en StelOrder.</p>}
        {found && (
          <div className="admin-msg--ok" style={{marginTop: 8}}>
            Encontrado: <strong>{found.name}</strong> — precio {found.salesPrice.toFixed(2)}€, stock {found.realStock},
            EAN {found.barcode || '(sin EAN)'}, {found.images.length} imagen(es). Se ha rellenado el formulario de
            abajo.
          </div>
        )}
      </div>

      <div className="admin-card">
        <h2 style={{marginTop: 0}}>2. Datos del producto</h2>
        <Form method="post" encType="multipart/form-data" className="admin-form">
          <input type="hidden" name="intent" value="create-product" />
          {found?.images.map((url) => (
            <input key={url} type="hidden" name="stelorderImages" value={url} />
          ))}
          <div className="hero-admin__field-grid">
            <div className="hero-admin__field-grid--full">
              <label>Título</label>
              <input type="text" name="title" defaultValue={found?.name ?? ''} required />
            </div>
            <div>
              <label>Marca (Vendor)</label>
              <input type="text" name="vendor" placeholder="Ej. Pioneer DJ" />
            </div>
            <div>
              <label>Tipo / Categoría</label>
              <input type="text" name="productType" placeholder="Ej. Controladoras DJ" />
            </div>
            <div>
              <label>SKU (referencia StelOrder)</label>
              <input type="text" name="sku" defaultValue={lookup?.ok ? lookup.reference : ''} required />
            </div>
            <div>
              <label>Código de barras (EAN)</label>
              <input type="text" name="barcode" defaultValue={found?.barcode ?? ''} />
            </div>
            <div>
              <label>Precio (€)</label>
              <input type="text" name="price" defaultValue={found ? found.salesPrice.toFixed(2) : ''} required />
            </div>
            <div>
              <label>Stock</label>
              <input type="number" name="stock" defaultValue={found?.realStock ?? 0} />
            </div>
            <div className="hero-admin__field-grid--full">
              <label>Descripción</label>
              <textarea name="description" rows={5} defaultValue={found?.description ?? ''} />
            </div>
            <div className="hero-admin__field-grid--full">
              <label>Imágenes adicionales (si no vienen de StelOrder)</label>
              <input type="file" name="images" accept="image/*" multiple />
            </div>
          </div>
          <button type="submit" className="admin-btn admin-btn--primary" style={{marginTop: 8}} disabled={isBusy}>
            {isBusy ? 'Creando…' : 'Crear producto (borrador)'}
          </button>
        </Form>
        {createResult && !createResult.ok && <p className="admin-msg--error">{createResult.error}</p>}
        {createResult?.ok && (
          <p className="admin-msg--ok">
            Creado "{createResult.title}" — revísalo y publícalo desde el panel de Shopify cuando esté listo.
          </p>
        )}
      </div>
    </AdminShell>
  );
}
