/**
 * Taxonomía real de categorías de la web (el Excel que pasó Víctor para el
 * mega-menú — ver app/lib/categoryIcons.ts y MEGA-MENU.md), a nivel de
 * SUBCATEGORÍA, no solo de grupo. Son los títulos EXACTOS de las
 * colecciones de Shopify ("Subcategoría — Grupo"), ya creadas a mano por
 * Víctor con esos mismos nombres — así que no hay que crearlas,
 * getOrCreateCollection() las encuentra por título tal cual.
 *
 * Se usa como lista única de clasificación tanto para el pipeline de
 * distribuidores FTP (Zentralmedia/Midwich, ver distributorCategories.server.ts)
 * como para StelOrder/Walkasse (ver stelorderCategories.server.ts) — antes
 * cada uno clasificaba contra una lista distinta (uno solo a nivel de
 * grupo, el otro contra la taxonomía plana vieja), así que los productos
 * nuevos seguían cayendo fuera de la estructura nueva aunque ya se hubiera
 * migrado el catálogo existente a mano.
 */
export const CATEGORY_GROUPS = {
  'Alphatheta & Pioneer DJ': [
    'Controladoras',
    'All-in-one',
    'Mixers',
    'Reproductores',
    'Auriculares',
    'Monitores',
    'Altavoces',
    'Giradiscos',
    'Agujas',
    'Fundas y bolsas',
    'Timecode',
  ],
  'Zona DJ': [
    'Controladoras',
    'All-in-one',
    'Mixers',
    'Reproductores',
    'Auriculares',
    'Giradiscos',
    'Agujas',
    'Patinadores',
    'Decksavers',
    'Timecode',
    'Cables',
  ],
  'Material de estudio': [
    'Controladores MIDI',
    'Teclados MIDI',
    'Monitores de estudio',
    'Tarjetas de sonido',
    'Micrófonos',
    'Auriculares',
    'Accesorios',
  ],
  'Sonido / PA': [
    'Altavoces activos',
    'Altavoces pasivos',
    'Subwoofers',
    'Mezcladores live',
    'Amplificadores',
    'Reproductores',
    'Procesadores de señal',
    'Microfonía',
  ],
  Cables: [
    'Cables micrófono',
    'Cables instrumento',
    'Cables audio',
    'Adaptadores',
    'Cables altavoz',
    'Conectores',
    'Cables híbridos',
    'Cables DMX',
  ],
  'Flightcases y bolsas': ['Flightcase', 'Racks', 'Bolsas', 'Muebles'],
  Iluminación: [
    'Iluminación estática',
    'Cabezas móviles',
    'Flashes',
    'Lásers',
    'Sets de iluminación',
    'Control de iluminación',
    'Efectos deco',
    'Máquinas de humo y niebla',
    'Accesorios',
  ],
} as const;

export type CategoryGroupName = keyof typeof CATEGORY_GROUPS;

/** Título exacto de colección en Shopify para una subcategoría de un
 * grupo, p.ej. leafTitle('Sonido / PA', 'Subwoofers') -> "Subwoofers — Sonido / PA". */
function leafTitle(group: CategoryGroupName, sub: string): string {
  return `${sub} — ${group}`;
}

/** Lista plana de todas las subcategorías reales (sin "Otros") — la usa el
 * prompt de clasificación de ambos pipelines. */
export const ALL_LEAF_CATEGORIES: string[] = Object.entries(CATEGORY_GROUPS).flatMap(([group, subs]) =>
  subs.map((sub) => leafTitle(group as CategoryGroupName, sub)),
);

/** "Otros" es el cajón de sastre de siempre: no se crea ninguna colección,
 * el producto se queda sin categoría nueva (revisable a mano). */
export const CATEGORY_LEAF_OR_OTHER = [...ALL_LEAF_CATEGORIES, 'Otros'] as const;
export type CategoryLeaf = (typeof CATEGORY_LEAF_OR_OTHER)[number];

/** Texto de la taxonomía completa, agrupada, para pegar en un prompt de
 * clasificación. */
export function describeTaxonomyForPrompt(): string {
  return Object.entries(CATEGORY_GROUPS)
    .map(([group, subs]) => `${group}:\n${subs.map((sub) => `  - ${leafTitle(group as CategoryGroupName, sub)}`).join('\n')}`)
    .join('\n\n');
}

/**
 * GID de la taxonomía estándar de Shopify (el campo "category" separado
 * del "Tipo de producto" libre) más cercano a cada subcategoría — mismo
 * concepto que antes vivía en stelorderCategories.server.ts, ahora a nivel
 * de hoja. No hace falta que esté completo: una hoja sin GID aquí
 * simplemente no lleva categoría estándar de Shopify (el producto igual
 * entra bien en SU colección, que es lo que mueve el mega-menú).
 */
export const LEAF_TAXONOMY_GID: Partial<Record<string, string>> = {
  'Controladoras — Alphatheta & Pioneer DJ': 'gid://shopify/TaxonomyCategory/el-2-5-4',
  'Controladoras — Zona DJ': 'gid://shopify/TaxonomyCategory/el-2-5-4',
  'All-in-one — Alphatheta & Pioneer DJ': 'gid://shopify/TaxonomyCategory/el-2-5-2',
  'All-in-one — Zona DJ': 'gid://shopify/TaxonomyCategory/el-2-5-2',
  'Mixers — Alphatheta & Pioneer DJ': 'gid://shopify/TaxonomyCategory/el-2-5-5',
  'Mixers — Zona DJ': 'gid://shopify/TaxonomyCategory/el-2-5-5',
  'Reproductores — Alphatheta & Pioneer DJ': 'gid://shopify/TaxonomyCategory/el-2-5-1',
  'Reproductores — Zona DJ': 'gid://shopify/TaxonomyCategory/el-2-5-1',
  'Auriculares — Alphatheta & Pioneer DJ': 'gid://shopify/TaxonomyCategory/el-2-2-7-1-2',
  'Auriculares — Zona DJ': 'gid://shopify/TaxonomyCategory/el-2-2-7-1-2',
  'Auriculares — Material de estudio': 'gid://shopify/TaxonomyCategory/el-2-2-7-1',
  'Giradiscos — Alphatheta & Pioneer DJ': 'gid://shopify/TaxonomyCategory/el-2-3-10-2',
  'Giradiscos — Zona DJ': 'gid://shopify/TaxonomyCategory/el-2-3-10-2',
  'Flightcase — Flightcases y bolsas': 'gid://shopify/TaxonomyCategory/el-2-5-8-1',
  'Cables — Zona DJ': 'gid://shopify/TaxonomyCategory/el-7-7',
  'Cables micrófono — Cables': 'gid://shopify/TaxonomyCategory/el-7-7',
  'Cables instrumento — Cables': 'gid://shopify/TaxonomyCategory/el-7-7',
  'Cables audio — Cables': 'gid://shopify/TaxonomyCategory/el-7-7',
  'Cables altavoz — Cables': 'gid://shopify/TaxonomyCategory/el-7-7',
  'Cables híbridos — Cables': 'gid://shopify/TaxonomyCategory/el-7-7',
  'Cables DMX — Cables': 'gid://shopify/TaxonomyCategory/el-7-7',
  'Controladores MIDI — Material de estudio': 'gid://shopify/TaxonomyCategory/ae-2-8-4-2',
  'Teclados MIDI — Material de estudio': 'gid://shopify/TaxonomyCategory/ae-2-8-4-2',
  'Altavoces — Alphatheta & Pioneer DJ': 'gid://shopify/TaxonomyCategory/el-2-2-10',
  'Altavoces activos — Sonido / PA': 'gid://shopify/TaxonomyCategory/el-2-2-10',
  'Altavoces pasivos — Sonido / PA': 'gid://shopify/TaxonomyCategory/el-2-2-10',
  'Subwoofers — Sonido / PA': 'gid://shopify/TaxonomyCategory/el-2-2-10',
};

/** Handle real de cada colección "grupo" (bare, 0 productos — solo
 * existe para el rail del mega-menú, ver Header.tsx) — confirmado a mano
 * contra Shopify, no se puede derivar del título porque Shopify genera
 * el handle a su manera (p.ej. quita el "&"). Se usa en el breadcrumb de
 * las colecciones hoja, ver parseLeafTitle. */
export const GROUP_HANDLES: Record<CategoryGroupName, string> = {
  'Alphatheta & Pioneer DJ': 'alphatheta-pioneer-dj',
  'Zona DJ': 'zona-dj',
  'Material de estudio': 'material-de-estudio',
  'Sonido / PA': 'sonido-pa',
  Cables: 'cables',
  'Flightcases y bolsas': 'flightcases-y-bolsas',
  Iluminación: 'iluminacion',
};

/** Si el título de una colección sigue el patrón "Subcategoría — Grupo"
 * de esta taxonomía (ver leafTitle más arriba) y el grupo es uno de los
 * 7 reales, devuelve las dos partes más el handle del grupo — para
 * pintar el breadcrumb como Categoría > Subcategoría en vez del título
 * plano. Si no seguía el patrón (OUTLET, "PIONEER DJ & ALPHATHETA", los
 * propios grupos "bare"...) devuelve null y el caller cae al breadcrumb
 * de un solo nivel de siempre. */
export function parseLeafTitle(
  title: string,
): {group: CategoryGroupName; sub: string; groupHandle: string} | null {
  const idx = title.indexOf(' — ');
  if (idx === -1) return null;
  const group = title.slice(idx + 3);
  if (!(group in CATEGORY_GROUPS)) return null;
  const groupName = group as CategoryGroupName;
  return {group: groupName, sub: title.slice(0, idx), groupHandle: GROUP_HANDLES[groupName]};
}
