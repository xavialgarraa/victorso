import {useState} from 'react';
import {Form, data, useActionData, useLoaderData, useNavigation} from 'react-router';
import type {Route} from './+types/admin-interno.descripcion';
import {requireAdminUser} from '~/lib/adminSession.server';
import {AdminShell} from '~/components/admin/AdminShell';
import {adminQuery} from '~/lib/shopifyAdmin.server';
import {
  buildProductDescriptionHtml,
  type DescriptionFeature,
  type DescriptionSpec,
} from '~/lib/productDescriptionTemplate';

export const meta: Route.MetaFunction = () => {
  return [{title: 'Descripción de producto — Panel interno'}];
};

type PickerProduct = {
  id: string;
  handle: string;
  title: string;
  image: string;
};

// Lista plana para el selector (mismo patrón que el buscador del hero) —
// se trae entera de una vez para que el autocompletar vaya al instante.
const ADMIN_DESCRIPTION_PRODUCTS_QUERY = `#graphql
  query AdminDescriptionProducts {
    products(first: 250, sortKey: TITLE) {
      nodes {
        id
        handle
        title
        featuredImage { url altText }
      }
    }
  }
` as const;

export async function loader({request, context}: Route.LoaderArgs) {
  const {user, headers} = await requireAdminUser(request, context.env);
  const productsData = await context.storefront.query(ADMIN_DESCRIPTION_PRODUCTS_QUERY);

  const products: PickerProduct[] = productsData.products.nodes.map((p) => ({
    id: p.id,
    handle: p.handle,
    title: p.title,
    image: p.featuredImage?.url ?? '',
  }));

  return data({user, products}, {headers});
}

type ActionResult =
  | {ok: true; title: string; handle: string}
  | {ok: false; error: string};

function parseJsonArray<T>(formData: FormData, key: string): T[] {
  try {
    const raw = String(formData.get(key) || '[]');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

export async function action({request, context}: Route.ActionArgs) {
  const {headers} = await requireAdminUser(request, context.env);
  const formData = await request.formData();

  const productId = String(formData.get('productId') || '');
  const productHandle = String(formData.get('productHandle') || '');
  const productTitle = String(formData.get('productTitle') || '');

  if (!productId) {
    return data<ActionResult>({ok: false, error: 'Elige un producto de la lista.'}, {headers});
  }

  const intro = String(formData.get('intro') || '');
  const videoUrl = String(formData.get('videoUrl') || '');
  const features = parseJsonArray<DescriptionFeature>(formData, 'featuresJson');
  const specs = parseJsonArray<DescriptionSpec>(formData, 'specsJson');

  const html = buildProductDescriptionHtml({intro, features, specs, videoUrl});

  try {
    // Sin el comentario "#graphql" a propósito — va contra la Admin API, no
    // la Storefront, y el generador de tipos validaría mal el esquema.
    const result = await adminQuery<{
      productUpdate: {product: {id: string} | null; userErrors: Array<{message: string}>};
    }>(
      context.env,
      `
        mutation UpdateProductDescription($input: ProductInput!) {
          productUpdate(input: $input) {
            product { id }
            userErrors { field message }
          }
        }
      `,
      {input: {id: productId, descriptionHtml: html}},
    );

    if (result.productUpdate.userErrors.length > 0) {
      throw new Error(result.productUpdate.userErrors.map((e) => e.message).join(', '));
    }

    return data<ActionResult>({ok: true, title: productTitle, handle: productHandle}, {headers});
  } catch (error) {
    console.error('[admin-interno/descripcion] update', error);
    return data<ActionResult>(
      {ok: false, error: error instanceof Error ? error.message : 'Error desconocido.'},
      {headers},
    );
  }
}

const EMPTY_FEATURE: DescriptionFeature = {icon: '', title: '', text: ''};
const EMPTY_SPEC: DescriptionSpec = {label: '', value: ''};

export default function AdminDescripcion() {
  const {user, products} = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isBusy = navigation.state !== 'idle';

  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<PickerProduct | null>(null);
  const [intro, setIntro] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [features, setFeatures] = useState<DescriptionFeature[]>([{...EMPTY_FEATURE}]);
  const [specs, setSpecs] = useState<DescriptionSpec[]>([{...EMPTY_SPEC}]);

  const matches =
    query.trim().length > 0
      ? products.filter((p) => p.title.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8)
      : [];

  const previewHtml = buildProductDescriptionHtml({
    intro,
    videoUrl,
    features: features.filter((f) => f.title.trim() || f.text.trim()),
    specs: specs.filter((s) => s.label.trim() || s.value.trim()),
  });

  return (
    <AdminShell user={user} wide>
      <h1>Descripción de producto</h1>
      <p style={{color: 'var(--text-muted)', fontSize: '.9rem', maxWidth: 640}}>
        Rellena los campos y se genera automáticamente con el mismo diseño de la web (tipografía,
        colores, modo claro/oscuro) — no hace falta escribir HTML a mano. Al guardar, se sobrescribe la
        descripción actual del producto en Shopify.
      </p>

      <div className="admin-card" style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32}}>
        <div>
          <h2 style={{marginTop: 0}}>1. Producto</h2>
          {selected ? (
            <div style={{display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14}}>
              {selected.image && (
                <img src={selected.image} alt="" style={{width: 44, height: 44, objectFit: 'cover', borderRadius: 8}} />
              )}
              <strong>{selected.title}</strong>
              <button
                type="button"
                className="admin-btn admin-btn--outline"
                onClick={() => setSelected(null)}
                style={{marginLeft: 'auto'}}
              >
                Cambiar
              </button>
            </div>
          ) : (
            <div style={{position: 'relative', marginBottom: 14}}>
              <input
                type="text"
                placeholder="Busca un producto por nombre…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {matches.length > 0 && (
                <div
                  style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 5,
                    background: 'var(--surface)', border: '1px solid var(--border)',
                    borderRadius: 8, boxShadow: 'var(--shadow-lg)', maxHeight: 280, overflowY: 'auto',
                  }}
                >
                  {matches.map((p) => (
                    <button
                      type="button"
                      key={p.id}
                      onClick={() => {
                        setSelected(p);
                        setQuery('');
                      }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 12px',
                        background: 'none', border: 'none', textAlign: 'left', cursor: 'pointer',
                      }}
                    >
                      {p.image && (
                        <img src={p.image} alt="" style={{width: 32, height: 32, objectFit: 'cover', borderRadius: 6}} />
                      )}
                      {p.title}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <h2>2. Introducción</h2>
          <textarea
            rows={3}
            placeholder="2-4 frases: qué es el producto y para quién"
            value={intro}
            onChange={(e) => setIntro(e.target.value)}
          />

          <h2>3. Características destacadas</h2>
          {features.map((f, i) => (
            <div key={i} style={{display: 'grid', gridTemplateColumns: '60px 1fr auto', gap: 8, marginBottom: 8}}>
              <input
                type="text"
                placeholder="🎛️"
                value={f.icon}
                onChange={(e) => {
                  const next = [...features];
                  next[i] = {...next[i], icon: e.target.value};
                  setFeatures(next);
                }}
              />
              <div>
                <input
                  type="text"
                  placeholder="Título corto"
                  value={f.title}
                  onChange={(e) => {
                    const next = [...features];
                    next[i] = {...next[i], title: e.target.value};
                    setFeatures(next);
                  }}
                  style={{marginBottom: 4}}
                />
                <input
                  type="text"
                  placeholder="1-2 frases explicando el beneficio"
                  value={f.text}
                  onChange={(e) => {
                    const next = [...features];
                    next[i] = {...next[i], text: e.target.value};
                    setFeatures(next);
                  }}
                />
              </div>
              <button
                type="button"
                className="admin-btn admin-btn--outline"
                onClick={() => setFeatures(features.filter((_, idx) => idx !== i))}
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            className="admin-btn admin-btn--outline"
            onClick={() => setFeatures([...features, {...EMPTY_FEATURE}])}
          >
            + Añadir característica
          </button>

          <h2>4. Vídeo de YouTube (opcional)</h2>
          <input
            type="text"
            placeholder="Pega la URL del vídeo (youtube.com/watch?v=... o youtu.be/...)"
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
          />

          <h2>5. Especificaciones técnicas</h2>
          {specs.map((s, i) => (
            <div key={i} style={{display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: 8, marginBottom: 8}}>
              <input
                type="text"
                placeholder="Campo (ej. Peso)"
                value={s.label}
                onChange={(e) => {
                  const next = [...specs];
                  next[i] = {...next[i], label: e.target.value};
                  setSpecs(next);
                }}
              />
              <input
                type="text"
                placeholder="Valor (ej. 1,2 kg)"
                value={s.value}
                onChange={(e) => {
                  const next = [...specs];
                  next[i] = {...next[i], value: e.target.value};
                  setSpecs(next);
                }}
              />
              <button
                type="button"
                className="admin-btn admin-btn--outline"
                onClick={() => setSpecs(specs.filter((_, idx) => idx !== i))}
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            className="admin-btn admin-btn--outline"
            onClick={() => setSpecs([...specs, {...EMPTY_SPEC}])}
          >
            + Añadir especificación
          </button>

          <Form method="post" style={{marginTop: 24}}>
            <input type="hidden" name="productId" value={selected?.id ?? ''} />
            <input type="hidden" name="productHandle" value={selected?.handle ?? ''} />
            <input type="hidden" name="productTitle" value={selected?.title ?? ''} />
            <input type="hidden" name="intro" value={intro} />
            <input type="hidden" name="videoUrl" value={videoUrl} />
            <input type="hidden" name="featuresJson" value={JSON.stringify(features)} />
            <input type="hidden" name="specsJson" value={JSON.stringify(specs)} />
            <button type="submit" className="admin-btn admin-btn--primary" disabled={isBusy || !selected}>
              Guardar en Shopify
            </button>
          </Form>

          {actionData && !actionData.ok && <p className="admin-msg--error">{actionData.error}</p>}
          {actionData?.ok && (
            <p className="admin-msg--ok">
              Guardado en "{actionData.title}".{' '}
              <a href={`https://www.victorso.es/products/${actionData.handle}`} target="_blank" rel="noreferrer">
                Ver producto
              </a>
            </p>
          )}
        </div>

        <div>
          <h2 style={{marginTop: 0}}>Vista previa</h2>
          <div
            style={{
              border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20,
              background: 'var(--bg)', maxHeight: '80vh', overflowY: 'auto',
            }}
            dangerouslySetInnerHTML={{__html: previewHtml}}
          />
        </div>
      </div>
    </AdminShell>
  );
}
