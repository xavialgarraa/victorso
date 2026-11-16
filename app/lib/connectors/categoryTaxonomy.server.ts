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

/** Si el título es exactamente uno de los 7 grupos (la colección "bare"
 * en sí misma, 0 productos — ver GROUP_HANDLES), devuelve el nombre del
 * grupo; si no, null. Se usa para detectar cuándo una colección.$handle
 * es en realidad la página de un grupo y pintar ahí la cuadrícula de
 * subcategorías en vez del listado de productos (vacío). */
export function groupNameFromTitle(title: string): CategoryGroupName | null {
  return title in CATEGORY_GROUPS ? (title as CategoryGroupName) : null;
}

/** Handle real de cada colección hoja ("Subcategoría — Grupo"), para
 * construir los enlaces de la cuadrícula de subcategorías de la página
 * de un grupo — confirmado a mano contra Shopify por la misma razón que
 * GROUP_HANDLES (el handle no es un slugify trivial del título en todos
 * los casos, p.ej. los que llevan "/" o acentos). */
export const LEAF_HANDLES: Record<string, string> = {
  'Controladoras — Alphatheta & Pioneer DJ': 'controladoras-alphatheta-pioneer-dj',
  'All-in-one — Alphatheta & Pioneer DJ': 'all-in-one-alphatheta-pioneer-dj',
  'Mixers — Alphatheta & Pioneer DJ': 'mixers-alphatheta-pioneer-dj',
  'Reproductores — Alphatheta & Pioneer DJ': 'reproductores-alphatheta-pioneer-dj',
  'Auriculares — Alphatheta & Pioneer DJ': 'auriculares-alphatheta-pioneer-dj',
  'Monitores — Alphatheta & Pioneer DJ': 'monitores-alphatheta-pioneer-dj',
  'Altavoces — Alphatheta & Pioneer DJ': 'altavoces-alphatheta-pioneer-dj',
  'Giradiscos — Alphatheta & Pioneer DJ': 'giradiscos-alphatheta-pioneer-dj',
  'Agujas — Alphatheta & Pioneer DJ': 'agujas-alphatheta-pioneer-dj',
  'Fundas y bolsas — Alphatheta & Pioneer DJ': 'fundas-y-bolsas-alphatheta-pioneer-dj',
  'Timecode — Alphatheta & Pioneer DJ': 'timecode-alphatheta-pioneer-dj',
  'Controladoras — Zona DJ': 'controladoras-zona-dj',
  'All-in-one — Zona DJ': 'all-in-one-zona-dj',
  'Mixers — Zona DJ': 'mixers-zona-dj',
  'Reproductores — Zona DJ': 'reproductores-zona-dj',
  'Auriculares — Zona DJ': 'auriculares-zona-dj',
  'Giradiscos — Zona DJ': 'giradiscos-zona-dj',
  'Agujas — Zona DJ': 'agujas-zona-dj',
  'Patinadores — Zona DJ': 'patinadores-zona-dj',
  'Decksavers — Zona DJ': 'decksavers-zona-dj',
  'Timecode — Zona DJ': 'timecode-zona-dj',
  'Cables — Zona DJ': 'cables-zona-dj',
  'Controladores MIDI — Material de estudio': 'controladores-midi-material-de-estudio',
  'Teclados MIDI — Material de estudio': 'teclados-midi-material-de-estudio',
  'Monitores de estudio — Material de estudio': 'monitores-de-estudio-material-de-estudio',
  'Tarjetas de sonido — Material de estudio': 'tarjetas-de-sonido-material-de-estudio',
  'Micrófonos — Material de estudio': 'microfonos-material-de-estudio',
  'Auriculares — Material de estudio': 'auriculares-material-de-estudio',
  'Accesorios — Material de estudio': 'accesorios-material-de-estudio',
  'Altavoces activos — Sonido / PA': 'altavoces-activos-sonido-pa',
  'Altavoces pasivos — Sonido / PA': 'altavoces-pasivos-sonido-pa',
  'Subwoofers — Sonido / PA': 'subwoofers-sonido-pa',
  'Mezcladores live — Sonido / PA': 'mezcladores-live-sonido-pa',
  'Amplificadores — Sonido / PA': 'amplificadores-sonido-pa',
  'Reproductores — Sonido / PA': 'reproductores-sonido-pa',
  'Procesadores de señal — Sonido / PA': 'procesadores-de-senal-sonido-pa',
  'Microfonía — Sonido / PA': 'microfonia-sonido-pa',
  'Cables micrófono — Cables': 'cables-microfono-cables',
  'Cables instrumento — Cables': 'cables-instrumento-cables',
  'Cables audio — Cables': 'cables-audio-cables',
  'Adaptadores — Cables': 'adaptadores-cables',
  'Cables altavoz — Cables': 'cables-altavoz-cables',
  'Conectores — Cables': 'conectores-cables',
  'Cables híbridos — Cables': 'cables-hibridos-cables',
  'Cables DMX — Cables': 'cables-dmx-cables',
  'Flightcase — Flightcases y bolsas': 'flightcase-flightcases-y-bolsas',
  'Racks — Flightcases y bolsas': 'racks-flightcases-y-bolsas',
  'Bolsas — Flightcases y bolsas': 'bolsas-flightcases-y-bolsas',
  'Muebles — Flightcases y bolsas': 'muebles-flightcases-y-bolsas',
  'Iluminación estática — Iluminación': 'iluminacion-estatica-iluminacion',
  'Cabezas móviles — Iluminación': 'cabezas-moviles-iluminacion',
  'Flashes — Iluminación': 'flashes-iluminacion',
  'Lásers — Iluminación': 'lasers-iluminacion',
  'Sets de iluminación — Iluminación': 'sets-de-iluminacion-iluminacion',
  'Control de iluminación — Iluminación': 'control-de-iluminacion-iluminacion',
  'Efectos deco — Iluminación': 'efectos-deco-iluminacion',
  'Máquinas de humo y niebla — Iluminación': 'maquinas-de-humo-y-niebla-iluminacion',
  'Accesorios — Iluminación': 'accesorios-iluminacion',
};

/** Las subcategorías de un grupo, con su handle real — para la
 * cuadrícula de navegación de la página de un grupo (ver
 * groupNameFromTitle). Las hojas sin handle conocido (no debería pasar,
 * ver LEAF_HANDLES) se omiten en vez de romper el render. */
export function subcategoryLinksForGroup(
  group: CategoryGroupName,
): Array<{sub: string; title: string; handle: string}> {
  const subs: readonly string[] = CATEGORY_GROUPS[group];
  return subs
    .map((sub) => {
      const title = leafTitle(group, sub);
      const handle = LEAF_HANDLES[title];
      return handle ? {sub, title, handle} : null;
    })
    .filter((t): t is {sub: string; title: string; handle: string} => t !== null);
}
