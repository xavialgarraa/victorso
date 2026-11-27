import {Fragment, useState} from 'react';
import {Form, data, useActionData, useLoaderData, useNavigation} from 'react-router';
import type {Route} from './+types/admin-interno.descripcion';
import {requireAdminUser} from '~/lib/adminSession.server';
import {AdminShell} from '~/components/admin/AdminShell';
import {adminQuery} from '~/lib/shopifyAdmin.server';
import {
  buildProductDescriptionHtml,
  parseProductDescriptionHtml,
  type DescriptionFeature,
  type DescriptionSpec,
} from '~/lib/productDescriptionTemplate';
import {getAIProductDescription} from '~/lib/connectors/productDescriptionAI.server';
import {looksLikeMissingDescription} from '~/lib/productDescriptionGaps';

export const meta: Route.MetaFunction = () => {
  return [{title: 'Descripción de producto — Panel interno'}];
};

type PickerProduct = {
  id: string;
  handle: string;
  title: string;
  image: string;
  descriptionHtml: string;
  vendor: string;
  productType: string;
};

// Lista plana para el selector (mismo patrón que el buscador del hero) —
// se trae entera de una vez para que el autocompletar vaya al instante.
// Incluye descriptionHtml para poder precargar el formulario si el
// producto ya tiene una descripción hecha con esta misma plantilla, y
// vendor/productType para poder pasárselos a la IA en el relleno
// automático (ver "Rellenar huecos con IA" más abajo).
const ADMIN_DESCRIPTION_PRODUCTS_QUERY = `#graphql
  query AdminDescriptionProducts {
    products(first: 250, sortKey: TITLE) {
      nodes {
        id
        handle
        title
        vendor
        productType
        featuredImage { url altText }
        descriptionHtml
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
    descriptionHtml: p.descriptionHtml ?? '',
    vendor: p.vendor ?? '',
    productType: p.productType ?? '',
  }));

  return data({user, products}, {headers});
}

// Igual límite que el resto de lotes del panel (StelOrder, distribuidores)
// — de uno en uno se pasaría de tiempo de request y de coste de IA de
// golpe; de lote en lote se puede parar/revisar entre tandas.
const BACKFILL_BATCH_SIZE = 10;

type ActionResult =
  | {intent: 'save'; ok: true; title: string; handle: string}
  | {intent: 'save'; ok: false; error: string}
  | {intent: 'backfill-ai'; ok: true; processed: number; errors: string[]}
  | {intent: 'backfill-ai'; ok: false; error: string};

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
  const intent = String(formData.get('intent') || 'save');

  if (intent === 'backfill-ai') {
    const ids = formData.getAll('productId').map(String);
    const titles = formData.getAll('productTitle').map(String);
    const vendors = formData.getAll('productVendor').map(String);
    const categories = formData.getAll('productCategory').map(String);
    const errors: string[] = [];
    let processed = 0;
    for (let i = 0; i < ids.length; i++) {
      try {
        const {html} = await getAIProductDescription(context.env, ids[i], {
          title: titles[i] || '',
          vendor: vendors[i] || '',
          category: categories[i] || '',
          originalText: null,
        });
        if (!html) {
          errors.push(`${titles[i]}: la IA no está disponible (falta ANTHROPIC_API_KEY) o no devolvió texto.`);
          continue;
        }
        const result = await adminQuery<{
          productUpdate: {product: {id: string} | null; userErrors: Array<{message: string}>};
        }>(
          context.env,
          `
            mutation BackfillProductDescription($input: ProductInput!) {
              productUpdate(input: $input) {
                product { id }
                userErrors { field message }
              }
            }
          `,
          {input: {id: ids[i], descriptionHtml: html}},
        );
        if (result.productUpdate.userErrors.length > 0) {
          errors.push(`${titles[i]}: ${result.productUpdate.userErrors.map((e) => e.message).join(', ')}`);
          continue;
        }
        processed++;
      } catch (error) {
        errors.push(`${titles[i]}: ${error instanceof Error ? error.message : 'Error desconocido.'}`);
      }
    }
    return data<ActionResult>({intent: 'backfill-ai', ok: true, processed, errors}, {headers});
  }

  const productId = String(formData.get('productId') || '');
  const productHandle = String(formData.get('productHandle') || '');
  const productTitle = String(formData.get('productTitle') || '');

  if (!productId) {
    return data<ActionResult>({intent: 'save', ok: false, error: 'Elige un producto de la lista.'}, {headers});
  }

  const intro = String(formData.get('intro') || '');
  const videos = parseJsonArray<string>(formData, 'videosJson');
  const features = parseJsonArray<DescriptionFeature>(formData, 'featuresJson');
  const specs = parseJsonArray<DescriptionSpec>(formData, 'specsJson');

  const html = buildProductDescriptionHtml({intro, features, specs, videos});

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

    return data<ActionResult>({intent: 'save', ok: true, title: productTitle, handle: productHandle}, {headers});
  } catch (error) {
    console.error('[admin-interno/descripcion] update', error);
    return data<ActionResult>(
      {intent: 'save', ok: false, error: error instanceof Error ? error.message : 'Error desconocido.'},
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
  const busyIntent = navigation.formData?.get('intent');
  const saveResult = actionData?.intent === 'save' ? actionData : null;
  const backfillResult = actionData?.intent === 'backfill-ai' ? actionData : null;
  // "De verdad sin descripción" — vacíos o con un texto tan corto que es
  // claramente un título pegado sin más (ver looksLikeMissingDescription).
  // Nunca toca nada que ya tenga contenido real, aunque no venga de este
  // formulario ni de la IA.
  const missingDescription = products.filter((p) => looksLikeMissingDescription(p.descriptionHtml));
  const nextBackfillBatch = missingDescription.slice(0, BACKFILL_BATCH_SIZE);

  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<PickerProduct | null>(null);
  const [hadUnrecognizedDescription, setHadUnrecognizedDescription] = useState(false);
  const [intro, setIntro] = useState('');
  const [videos, setVideos] = useState<string[]>(['']);
  const [features, setFeatures] = useState<DescriptionFeature[]>([{...EMPTY_FEATURE}]);
  const [specs, setSpecs] = useState<DescriptionSpec[]>([{...EMPTY_SPEC}]);

  const matches =
    query.trim().length > 0
      ? products.filter((p) => p.title.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 8)
      : [];

  function selectProduct(p: PickerProduct) {
    setSelected(p);
    setQuery('');

    const parsed = parseProductDescriptionHtml(p.descriptionHtml);
    if (parsed) {
      setIntro(parsed.intro);
      setFeatures(parsed.features.length > 0 ? parsed.features : [{...EMPTY_FEATURE}]);
      setSpecs(parsed.specs.length > 0 ? parsed.specs : [{...EMPTY_SPEC}]);
      setVideos(parsed.videos.length > 0 ? parsed.videos : ['']);
      setHadUnrecognizedDescription(false);
    } else {
      setIntro('');
      setFeatures([{...EMPTY_FEATURE}]);
      setSpecs([{...EMPTY_SPEC}]);
      setVideos(['']);
      setHadUnrecognizedDescription(Boolean(p.descriptionHtml.trim()));
    }
  }

  const previewHtml = buildProductDescriptionHtml({
    intro,
    videos,
    features: features.filter((f) => f.title.trim() || f.text.trim()),
    specs: specs.filter((s) => s.label.trim() || s.value.trim()),
  });

  return (
    <AdminShell user={user} wide>
      <h1>Descripción de producto</h1>
      <p style={{color: 'var(--text-muted)', fontSize: '.9rem', maxWidth: 640}}>
        Rellena los campos y se genera automáticamente con el mismo diseño de la web (tipografía,
        colores, modo claro/oscuro) — no hace falta escribir HTML a mano ni usa ninguna IA, siempre es la
        misma plantilla. Al guardar, se sobrescribe la descripción actual del producto en Shopify.
      </p>

      <div className="admin-card">
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10}}>
          <div>
            <strong>Rellenar huecos con IA</strong>
            <p className="admin-hint" style={{marginTop: 4, maxWidth: 560}}>
              Productos sin descripción de verdad (vacíos, o con un texto tan corto que es claramente un título
              pegado sin más — esto pasa con los que se crean desde un distribuidor o StelOrder sin que nadie
              escriba nada a mano). Esto nunca toca un producto que ya tenga contenido, lo escribiera quien lo
              escribiera. Los productos nuevos de aquí en adelante ya se crean con esto aplicado solo — este
              botón es solo para ponerse al día con los que ya existían.
            </p>
          </div>
          {missingDescription.length > 0 && (
            <span className="admin-badge admin-badge--dry">{missingDescription.length} sin descripción</span>
          )}
        </div>

        {missingDescription.length === 0 ? (
          <p className="admin-hint" style={{marginTop: 12}}>Todo al día — ningún producto sin descripción.</p>
        ) : (
          <Form method="post" style={{marginTop: 14}}>
            <input type="hidden" name="intent" value="backfill-ai" />
            {nextBackfillBatch.map((p) => (
              <Fragment key={p.id}>
                <input type="hidden" name="productId" value={p.id} />
                <input type="hidden" name="productTitle" value={p.title} />
                <input type="hidden" name="productVendor" value={p.vendor} />
                <input type="hidden" name="productCategory" value={p.productType} />
              </Fragment>
            ))}
            <button type="submit" className="admin-btn admin-btn--primary" disabled={isBusy}>
              {isBusy && busyIntent === 'backfill-ai' && <span className="admin-spinner" aria-hidden="true" />}
              {isBusy && busyIntent === 'backfill-ai'
                ? 'Generando…'
                : `Generar con IA para ${nextBackfillBatch.length} de ${missingDescription.length}`}
            </button>
          </Form>
        )}

        {backfillResult && (
          backfillResult.ok ? (
            <p className={backfillResult.errors.length > 0 ? 'admin-msg--error' : 'admin-msg--ok'} style={{marginTop: 12}}>
              Generadas {backfillResult.processed} descripciones.
              {backfillResult.errors.length > 0 && (
                <> {backfillResult.errors.length} errores: {backfillResult.errors.slice(0, 5).join(' · ')}</>
              )}
            </p>
          ) : (
            <p className="admin-msg--error" style={{marginTop: 12}}>{backfillResult.error}</p>
          )
        )}
      </div>

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
                      onClick={() => selectProduct(p)}
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

          {hadUnrecognizedDescription && selected && (
            <div style={{marginBottom: 14}}>
              <p className="admin-hint">
                Este producto ya tiene una descripción, pero no se generó con este formulario (viene de
                otro sitio, como una IA externa o el ERP) — no se puede precargar sola en los campos de
                abajo. Aquí tienes el texto tal cual está ahora, para que puedas copiar trozos a mano al
                rellenar la plantilla. Si guardas aquí, la sustituye por completo.
              </p>
              <details style={{marginTop: 8}}>
                <summary style={{cursor: 'pointer', fontWeight: 600, fontSize: '.85rem'}}>
                  Ver descripción actual
                </summary>
                <div
                  style={{
                    marginTop: 8, padding: 14, border: '1px solid #e4e4e8', borderRadius: 8,
                    background: '#fafafb', maxHeight: 320, overflowY: 'auto', fontSize: '.88rem',
                  }}
                  dangerouslySetInnerHTML={{__html: selected.descriptionHtml}}
                />
              </details>
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
          <p className="admin-hint" style={{marginTop: -4}}>
            El icono es opcional — si lo dejas vacío sale un punto de acento en vez de un emoji.
          </p>
          {features.map((f, i) => (
            <div key={i} style={{display: 'grid', gridTemplateColumns: '60px 1fr auto', gap: 8, marginBottom: 8}}>
              <input
                type="text"
                placeholder="(opcional)"
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

          <h2>4. Vídeos de YouTube (opcional)</h2>
          {videos.map((v, i) => (
            <div key={i} style={{display: 'flex', gap: 8, marginBottom: 8}}>
              <input
                type="text"
                placeholder="youtube.com/watch?v=... o youtu.be/..."
                value={v}
                onChange={(e) => {
                  const next = [...videos];
                  next[i] = e.target.value;
                  setVideos(next);
                }}
                style={{flex: 1}}
              />
              <button
                type="button"
                className="admin-btn admin-btn--outline"
                onClick={() => setVideos(videos.filter((_, idx) => idx !== i))}
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            className="admin-btn admin-btn--outline"
            onClick={() => setVideos([...videos, ''])}
          >
            + Añadir vídeo
          </button>

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
            <input type="hidden" name="videosJson" value={JSON.stringify(videos)} />
            <input type="hidden" name="featuresJson" value={JSON.stringify(features)} />
            <input type="hidden" name="specsJson" value={JSON.stringify(specs)} />
            <button type="submit" className="admin-btn admin-btn--primary" disabled={isBusy || !selected}>
              Guardar en Shopify
            </button>
          </Form>

          {saveResult && !saveResult.ok && <p className="admin-msg--error">{saveResult.error}</p>}
          {saveResult?.ok && (
            <p className="admin-msg--ok">
              Guardado en "{saveResult.title}".{' '}
              <a href={`https://www.victorso.es/products/${saveResult.handle}`} target="_blank" rel="noreferrer">
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
