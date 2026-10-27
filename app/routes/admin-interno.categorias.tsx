import {Form, data, useActionData, useLoaderData, useNavigation} from 'react-router';
import type {Route} from './+types/admin-interno.categorias';
import {requireAdminUser} from '~/lib/adminSession.server';
import {AdminShell} from '~/components/admin/AdminShell';
import {uploadImageToShopify} from '~/lib/shopifyFiles.server';
import {clearCategoryCover, listCategoryCovers, setCategoryCover} from '~/lib/categoryCovers.server';

export const meta: Route.MetaFunction = () => {
  return [{title: 'Carátulas de categorías — Panel interno'}];
};

const ADMIN_CATEGORIES_QUERY = `#graphql
  query AdminCategories {
    collections(first: 30, sortKey: TITLE) {
      nodes {
        id
        handle
        title
        products(first: 1) {
          nodes { featuredImage { url } }
        }
      }
    }
  }
` as const;

type CategoryRow = {
  handle: string;
  title: string;
  overrideUrl: string | null;
  randomPreviewUrl: string | null;
};

export async function loader({request, context}: Route.LoaderArgs) {
  const {user, headers} = await requireAdminUser(request, context.env);
  const [collectionsData, overrides] = await Promise.all([
    context.storefront.query(ADMIN_CATEGORIES_QUERY),
    listCategoryCovers(context.env),
  ]);

  const categories: CategoryRow[] = collectionsData.collections.nodes
    .filter((c) => c.handle !== 'frontpage' && c.handle !== 'novedades-destacadas-home')
    .map((c) => ({
      handle: c.handle,
      title: c.title,
      overrideUrl: overrides[c.handle] ?? null,
      randomPreviewUrl: c.products.nodes[0]?.featuredImage?.url ?? null,
    }));

  return data({user, categories}, {headers});
}

type ActionResult =
  | {intent: 'set'; ok: true; handle: string}
  | {intent: 'set'; ok: false; handle: string; error: string}
  | {intent: 'clear'; ok: true};

export async function action({request, context}: Route.ActionArgs) {
  const {headers} = await requireAdminUser(request, context.env);
  const formData = await request.formData();
  const intent = String(formData.get('intent') || '');
  const handle = String(formData.get('handle') || '');

  if (intent === 'set') {
    const file = formData.get('image');
    if (!(file instanceof File) || file.size === 0) {
      return data<ActionResult>({intent: 'set', ok: false, handle, error: 'Elige una imagen.'}, {headers});
    }
    try {
      const imageUrl = await uploadImageToShopify(context.env, file);
      await setCategoryCover(context.env, handle, imageUrl);
      return data<ActionResult>({intent: 'set', ok: true, handle}, {headers});
    } catch (error) {
      console.error('[admin-interno/categorias] set', error);
      return data<ActionResult>(
        {intent: 'set', ok: false, handle, error: error instanceof Error ? error.message : 'Error desconocido.'},
        {headers},
      );
    }
  }

  if (intent === 'clear') {
    await clearCategoryCover(context.env, handle);
    return data<ActionResult>({intent: 'clear', ok: true}, {headers});
  }

  return data<ActionResult>({intent: 'clear', ok: true}, {headers});
}

export default function AdminCategorias() {
  const {user, categories} = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isBusy = navigation.state !== 'idle';

  return (
    <AdminShell user={user} wide>
      <h1>Carátulas de categorías</h1>
      <p style={{color: 'var(--text-muted)', fontSize: '.9rem', maxWidth: 640}}>
        Por defecto, cada categoría muestra la foto de un producto suyo elegida al azar en cada visita. Si subes
        una carátula aquí, esa categoría siempre mostrará esa foto en su lugar (en la home y en la página de la
        categoría). Puedes quitarla cuando quieras para volver a la aleatoria.
      </p>

      <div className="admin-card">
        <div className="hero-admin__list">
          {categories.map((c) => (
            <div key={c.handle} className="hero-admin__card" style={{gridTemplateColumns: '64px 1fr auto'}}>
              <img
                src={c.overrideUrl ?? c.randomPreviewUrl ?? ''}
                alt=""
                style={{width: 64, height: 48, objectFit: 'cover', borderRadius: 8, background: 'var(--img-bg)'}}
              />
              <div>
                <div className="hero-admin__title">{c.title}</div>
                <span className="hero-admin__link">
                  {c.overrideUrl ? 'Carátula fija' : 'Foto aleatoria de un producto'}
                </span>
              </div>
              <div style={{display: 'flex', gap: 8, alignItems: 'center'}}>
                <Form method="post" encType="multipart/form-data" style={{display: 'flex', gap: 6, alignItems: 'center'}}>
                  <input type="hidden" name="intent" value="set" />
                  <input type="hidden" name="handle" value={c.handle} />
                  <input type="file" name="image" accept="image/*" style={{width: 150, fontSize: '.78rem'}} />
                  <button type="submit" className="admin-btn admin-btn--outline" disabled={isBusy}>
                    Subir
                  </button>
                </Form>
                {c.overrideUrl && (
                  <Form method="post">
                    <input type="hidden" name="intent" value="clear" />
                    <input type="hidden" name="handle" value={c.handle} />
                    <button type="submit" className="admin-btn admin-btn--danger" disabled={isBusy}>
                      Usar aleatoria
                    </button>
                  </Form>
                )}
              </div>
            </div>
          ))}
        </div>
        {actionData?.intent === 'set' && !actionData.ok && (
          <p className="admin-msg--error">{actionData.error}</p>
        )}
      </div>
    </AdminShell>
  );
}
