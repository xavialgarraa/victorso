import {Form, data, useActionData, useLoaderData, useNavigation} from 'react-router';
import type {Route} from './+types/admin-interno.colecciones';
import {requireAdminUser} from '~/lib/adminSession.server';
import {AdminShell} from '~/components/admin/AdminShell';
import {
  deleteCollectionBanner,
  listCollectionBanners,
  upsertCollectionBanner,
  type CollectionBanner,
  type CollectionBannerFeature,
} from '~/lib/collectionBanners.server';
import {BRANDS} from '~/lib/brands';
import {uploadImageToShopify} from '~/lib/shopifyFiles.server';

export const meta: Route.MetaFunction = () => {
  return [{title: 'Banners de colección — Panel interno'}];
};

const ICON_OPTIONS: Array<{value: CollectionBannerFeature['icon']; label: string}> = [
  {value: 'shield', label: 'Escudo (garantía / oficial)'},
  {value: 'wrench', label: 'Llave inglesa (servicio técnico)'},
  {value: 'truck', label: 'Camión (envío)'},
  {value: 'check', label: 'Check'},
  {value: 'globe', label: 'Globo'},
  {value: 'star', label: 'Estrella'},
];

const ADMIN_COLLECTIONS_QUERY = `#graphql
  query AdminCollectionsForBanners {
    collections(first: 50, sortKey: TITLE) {
      nodes { id handle title }
    }
  }
` as const;

export async function loader({request, context}: Route.LoaderArgs) {
  const {user, headers} = await requireAdminUser(request, context.env);
  const [collectionsData, banners] = await Promise.all([
    context.storefront.query(ADMIN_COLLECTIONS_QUERY),
    listCollectionBanners(context.env),
  ]);

  const collections = collectionsData.collections.nodes
    .filter((c) => c.handle !== 'frontpage' && c.handle !== 'novedades-destacadas-home')
    .map((c) => ({handle: c.handle, title: c.title, banner: banners[c.handle] ?? null}));

  return data({user, collections}, {headers});
}

type ActionResult =
  | {intent: 'save'; ok: true; handle: string}
  | {intent: 'save'; ok: false; handle: string; error: string}
  | {intent: 'delete'; ok: true};

function featuresFromForm(formData: FormData): CollectionBannerFeature[] {
  const features: CollectionBannerFeature[] = [];
  for (let i = 0; i < 3; i++) {
    const title = String(formData.get(`feature${i}_title`) || '').trim();
    const text = String(formData.get(`feature${i}_text`) || '').trim();
    const icon = String(formData.get(`feature${i}_icon`) || 'check') as CollectionBannerFeature['icon'];
    if (title && text) features.push({icon, title, text});
  }
  return features;
}

export async function action({request, context}: Route.ActionArgs) {
  const {headers} = await requireAdminUser(request, context.env);
  const formData = await request.formData();
  const intent = String(formData.get('intent') || '');
  const handle = String(formData.get('handle') || '');

  if (intent === 'save') {
    let backgroundImage = String(formData.get('existingBackgroundImage') || '') || undefined;
    if (formData.get('removeBackgroundImage') === 'on') {
      backgroundImage = undefined;
    } else {
      const file = formData.get('backgroundImage');
      if (file instanceof File && file.size > 0) {
        try {
          backgroundImage = await uploadImageToShopify(context.env, file);
        } catch (error) {
          console.error('[admin-interno/colecciones] upload', error);
          return data<ActionResult>(
            {intent: 'save', ok: false, handle, error: 'No se pudo subir la imagen de fondo.'},
            {headers},
          );
        }
      }
    }

    const banner: Omit<CollectionBanner, 'translations'> = {
      active: formData.get('active') === 'on',
      logos: formData.getAll('logos').map(String),
      backgroundImage,
      title: String(formData.get('title') || '').trim(),
      lede: String(formData.get('lede') || '').trim(),
      features: featuresFromForm(formData),
    };
    if (!banner.title || !banner.lede) {
      return data<ActionResult>({intent: 'save', ok: false, handle, error: 'Escribe al menos el título y el texto.'}, {headers});
    }
    try {
      await upsertCollectionBanner(context.env, handle, banner);
      return data<ActionResult>({intent: 'save', ok: true, handle}, {headers});
    } catch (error) {
      console.error('[admin-interno/colecciones] save', error);
      return data<ActionResult>(
        {intent: 'save', ok: false, handle, error: error instanceof Error ? error.message : 'Error desconocido.'},
        {headers},
      );
    }
  }

  if (intent === 'delete') {
    await deleteCollectionBanner(context.env, handle);
    return data<ActionResult>({intent: 'delete', ok: true}, {headers});
  }

  return data<ActionResult>({intent: 'delete', ok: true}, {headers});
}

export default function AdminColecciones() {
  const {user, collections} = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isBusy = navigation.state !== 'idle';

  return (
    <AdminShell user={user} wide>
      <h1>Banners de colección</h1>
      <p style={{color: 'var(--text-muted)', fontSize: '.9rem', maxWidth: 680}}>
        Banner editorial opcional para la cabecera de una colección (marca o campaña): título, texto y hasta 3
        argumentos de venta con icono. Escribe solo en español — al guardar se traduce automáticamente a los
        demás idiomas de la web. Si una colección no tiene banner activo, se muestra tal cual (sin cabecera extra).
      </p>

      <div style={{display: 'flex', flexDirection: 'column', gap: 12, marginTop: 20}}>
        {collections.map((c) => (
          <div className="admin-card" key={c.handle}>
            <details>
              <summary style={{cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                <span>
                  <strong>{c.title}</strong>{' '}
                  <span style={{color: 'var(--text-muted)', fontSize: '.82rem'}}>/{c.handle}</span>
                </span>
                <span style={{fontSize: '.8rem', color: c.banner?.active ? 'var(--red, #e30613)' : 'var(--text-muted)'}}>
                  {c.banner?.active ? 'Banner activo' : c.banner ? 'Banner desactivado' : 'Sin banner'}
                </span>
              </summary>

              <Form method="post" className="admin-form" encType="multipart/form-data" style={{marginTop: 16}}>
                <input type="hidden" name="intent" value="save" />
                <input type="hidden" name="handle" value={c.handle} />
                <input type="hidden" name="existingBackgroundImage" value={c.banner?.backgroundImage ?? ''} />

                <label style={{display: 'flex', alignItems: 'center', gap: 8}}>
                  <input type="checkbox" name="active" defaultChecked={c.banner?.active ?? false} />
                  Banner activo en esta colección
                </label>

                <label>Foto de fondo (opcional)</label>
                {c.banner?.backgroundImage && (
                  <div style={{marginBottom: 8}}>
                    <img
                      src={c.banner.backgroundImage}
                      alt=""
                      style={{width: 220, height: 80, objectFit: 'cover', borderRadius: 8}}
                    />
                    <label style={{display: 'flex', alignItems: 'center', gap: 6, fontSize: '.82rem', marginTop: 4}}>
                      <input type="checkbox" name="removeBackgroundImage" /> Quitar esta foto
                    </label>
                  </div>
                )}
                <input type="file" name="backgroundImage" accept="image/*" style={{marginBottom: 8}} />

                <label>Logos de marca a mostrar</label>
                <div style={{display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 4}}>
                  {BRANDS.filter((b) => b.logo).map((b) => (
                    <label key={b.slug} style={{display: 'flex', alignItems: 'center', gap: 6, fontSize: '.85rem'}}>
                      <input
                        type="checkbox"
                        name="logos"
                        value={b.logo}
                        defaultChecked={c.banner?.logos.includes(b.logo!) ?? false}
                      />
                      {b.name}
                    </label>
                  ))}
                </div>

                <label>Título</label>
                <input type="text" name="title" defaultValue={c.banner?.title ?? ''} required />

                <label>Texto</label>
                <textarea name="lede" rows={3} defaultValue={c.banner?.lede ?? ''} required />

                <label style={{marginTop: 8}}>Argumentos de venta (hasta 3 — deja título y texto vacíos para omitir)</label>
                {[0, 1, 2].map((i) => {
                  const f = c.banner?.features[i];
                  return (
                    <div
                      key={i}
                      style={{display: 'grid', gridTemplateColumns: '160px 1fr 1fr', gap: 8, marginBottom: 8}}
                    >
                      <select name={`feature${i}_icon`} defaultValue={f?.icon ?? 'check'}>
                        {ICON_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <input type="text" name={`feature${i}_title`} placeholder="Título" defaultValue={f?.title ?? ''} />
                      <input type="text" name={`feature${i}_text`} placeholder="Texto" defaultValue={f?.text ?? ''} />
                    </div>
                  );
                })}

                <div style={{display: 'flex', gap: 8, marginTop: 8}}>
                  <button type="submit" className="admin-btn admin-btn--primary" disabled={isBusy}>
                    Guardar
                  </button>
                </div>
                {actionData?.intent === 'save' && actionData.handle === c.handle && !actionData.ok && (
                  <p className="admin-msg--error">{actionData.error}</p>
                )}
              </Form>
              {c.banner && (
                <Form
                  method="post"
                  style={{marginTop: 8}}
                  onSubmit={(e) => {
                    if (!confirm('¿Borrar el banner de esta colección?')) e.preventDefault();
                  }}
                >
                  <input type="hidden" name="intent" value="delete" />
                  <input type="hidden" name="handle" value={c.handle} />
                  <button type="submit" className="admin-btn admin-btn--danger" disabled={isBusy}>
                    Borrar banner
                  </button>
                </Form>
              )}
            </details>
          </div>
        ))}
      </div>
    </AdminShell>
  );
}
