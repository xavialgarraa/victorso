# Categorías y subcategorías — qué es automático y qué no

Notas sobre cómo se comporta el sistema de categorías (mega-menú, home,
páginas de categoría) cuando cambia el catálogo en Shopify. Escrito el
2026-11-18.

## Se actualiza solo (sin tocar código ni volver a desplegar)

- **Añadir productos a una subcategoría que ya existe en Shopify**
  (p. ej. meter productos en "Cables instrumento — Cables", que ahora
  está vacía): en cuanto tenga al menos 1 producto, empieza a salir
  sola en el mega-menú, en la cuadrícula de su categoría y en el
  listado combinado de esa categoría. No hace falta avisar a nadie.
- **El icono de cada subcategoría**: si no hay una carátula elegida a
  mano en `/admin-interno/categorias`, se usa la foto del primer
  producto de esa subcategoría — también se actualiza sola si cambia
  el catálogo.
- **Las 7 categorías de "Encuentra tu equipo" (home)**: salen todas
  las que son una de las 7 categorías reales, tengan producto directo
  o no (ver más abajo por qué).

## Necesita un cambio de código (un aviso rápido, no un rediseño)

- **El ancho y el alto del panel del mega-menú de escritorio están
  fijos en píxeles** (260px de ancho del listado de categorías, 296px
  de alto), calculados para el catálogo de ahora mismo. Si una
  categoría llega a tener más de 8 subcategorías con producto (pasaría
  a necesitar 3 filas de iconos en vez de 2) o si se añade una
  categoría con un nombre más largo que "Alphatheta & Pioneer DJ", hay
  que subir esos dos números a mano — está señalado en los comentarios
  junto a `.mega-menu__tiles-wrap` y `.mega-menu__rail` en
  `app/styles/app.css`.
- **Añadir una categoría principal nueva de verdad** (no una
  subcategoría dentro de una que ya existe, sino un 8º grupo al nivel
  de "Zona DJ" o "Cables"): hay que darla de alta en
  `app/lib/connectors/categoryTaxonomy.server.ts` (`CATEGORY_GROUPS` y
  `GROUP_HANDLES`) y crear su colección "bare" en Shopify, igual que
  las 7 actuales — es una decisión de estructura, no algo que Shopify
  pueda reflejar solo.

## Por qué algunas categorías no muestran productos todavía

Las 7 categorías principales son colecciones "bare" en Shopify (0
productos propios, solo organizan sus subcategorías) — salvo
"Alphatheta & Pioneer DJ", que usa la colección real de siempre
("PIONEER DJ & ALPHATHETA", con sus 46 productos). Para las otras 6,
la página de la categoría junta en el momento los productos de todas
sus subcategorías que sí tienen stock — si ahora mismo una categoría
sale con pocos productos o ninguno (como "Iluminación", vacía del
todo), es porque sus subcategorías todavía no tienen producto asignado
en Shopify, no un error de la web. En cuanto se les asigne, aparecen
solas.
