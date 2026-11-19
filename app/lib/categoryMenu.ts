/**
 * Categorías y subcategorías a partir del menú "Categorías" de Shopify
 * (Admin > Contenido > Navegación > Menú principal), no de una lista
 * fija en el código — para que crear/mover/renombrar una categoría o
 * subcategoría sea cosa de editar ese menú en Shopify, sin tocar nada
 * aquí. Lo usan tanto el mega-menú (Header.tsx) como las páginas de
 * colección y la home (ver CATEGORIAS.md en la raíz del repo).
 *
 * No es un módulo ".server" a propósito: Header.tsx lo necesita tanto
 * en el loader como en el componente (se hidrata en el cliente), y un
 * módulo ".server" no se puede importar desde ahí — ver el aviso junto
 * a parseLeafTitle en el historial de collections.$handle.tsx.
 */

// Mínimo común de lo que necesitamos de un MenuItem de Shopify, a 3
// niveles (Shopify permite anidar hasta 3 en el editor de Navegación) —
// evita acoplar este parseo al tipo generado exacto de un fragment en
// concreto, basta con que tenga esta forma.
export type ShopifyMenuItemLike = {
  title: string;
  url?: string | null;
  items?: Array<{
    title: string;
    url?: string | null;
    items?: Array<{title: string; url?: string | null}> | null;
  }> | null;
};

export type MinimalShopifyMenu = {
  items: Array<{title: string; url?: string | null}>;
};

export type CategoryRef = {title: string; handle: string};

/** Quita el dominio de una URL de menú de Shopify (siempre viene absoluta,
 * tipo https://tienda.myshopify.com/collections/altavoces) para poder
 * usarla con <NavLink>/<Link> de React Router. */
export function toRelativeUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).pathname + new URL(url).search;
  } catch {
    return url.startsWith('/') ? url : null;
  }
}

/** Handle de colección a partir de una URL de menú tipo
 * "/collections/altavoces" — para cruzarlo con datos de Shopify
 * (producto/foto, carátula propia...). */
export function collectionHandleFromUrl(href: string | null): string | null {
  const match = href?.match(/\/collections\/([^/?#]+)/);
  return match ? match[1] : null;
}

/** El item "Categorías" dentro del menú principal — insensible a
 * mayúsculas/acentos para no depender de que se escriba exactamente
 * igual en Shopify. Si no existe (nadie lo ha montado aún en Admin >
 * Contenido > Navegación), devuelve undefined y el caller cae a su
 * comportamiento sin categorías. */
export function findCategoriesMenuItem(
  menu: MinimalShopifyMenu | null | undefined,
): ShopifyMenuItemLike | undefined {
  return menu?.items.find(
    (item) => item.title.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase() === 'categorias',
  ) as ShopifyMenuItemLike | undefined;
}

function refFromEntry(entry: {title: string; url?: string | null}): CategoryRef | null {
  const handle = collectionHandleFromUrl(toRelativeUrl(entry.url));
  return handle ? {title: entry.title, handle} : null;
}

/** Las categorías principales (los hijos directos de "Categorías"),
 * cada una con el handle de su colección — ver
 * app/routes/_index.tsx ("Encuentra tu equipo") y la cuadrícula de
 * subcategorías de una página de grupo. */
export function categoryGroups(categoriesItem: ShopifyMenuItemLike | undefined): CategoryRef[] {
  return (categoriesItem?.items ?? [])
    .map(refFromEntry)
    .filter((g): g is CategoryRef => g !== null);
}

/** ¿Esta colección (por su handle) es una de las categorías
 * principales? Se usa para detectar cuándo una colections.$handle es
 * en realidad la página de un grupo y pintar ahí la cuadrícula de
 * subcategorías en vez del listado de productos (vacío, salvo que el
 * grupo tenga productos propios — ver collections.$handle.tsx). */
export function groupByHandle(
  categoriesItem: ShopifyMenuItemLike | undefined,
  handle: string,
): CategoryRef | null {
  return categoryGroups(categoriesItem).find((g) => g.handle === handle) ?? null;
}

/** Las subcategorías de una categoría principal (por su handle), con
 * el handle real de cada una — para la cuadrícula de navegación de la
 * página de un grupo. */
export function subcategoriesOf(
  categoriesItem: ShopifyMenuItemLike | undefined,
  groupHandle: string,
): CategoryRef[] {
  const groupItem = categoriesItem?.items?.find(
    (child) => collectionHandleFromUrl(toRelativeUrl(child.url)) === groupHandle,
  );
  return (groupItem?.items ?? [])
    .map(refFromEntry)
    .filter((s): s is CategoryRef => s !== null);
}

/** Si esta colección (por su handle) es una subcategoría de alguna
 * categoría principal, devuelve ambas — para el breadcrumb Categoría >
 * Subcategoría de una página de producto/colección hoja. Ya no
 * depende de que el título siga ningún patrón ("Sub — Grupo"): basta
 * con que esté anidada en el sitio correcto del menú de Shopify. */
export function leafContext(
  categoriesItem: ShopifyMenuItemLike | undefined,
  leafHandle: string,
): {group: CategoryRef; sub: CategoryRef} | null {
  for (const child of categoriesItem?.items ?? []) {
    const group = refFromEntry(child);
    if (!group) continue;
    for (const sub of child.items ?? []) {
      const subRef = refFromEntry(sub);
      if (subRef?.handle === leafHandle) {
        return {group, sub: subRef};
      }
    }
  }
  return null;
}
