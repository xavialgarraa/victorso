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

- **(Actualizado 2026-11-27 — el mega-menú ya no es el de la nota
  anterior.)** El panel del mega-menú de escritorio es ahora una
  cuadrícula de 4 columnas dentro de un panel de ancho acotado
  (500-780px, ver `.mega-menu__tiles-wrap`/`.mega-menu__tiles` en
  `app/styles/app.css`) con **scroll propio pasados 460px de alto** —
  una categoría con muchas subcategorías simplemente scrollea dentro de
  su panel, no hace falta tocar nada en código cuando crece.
- **Añadir una categoría principal nueva de verdad** (no una
  subcategoría dentro de una que ya existe, sino un grupo nuevo al
  nivel de "Zona DJ" o "Cables"): sigue haciendo falta crear su
  colección "bare" en Shopify y darla de alta como hijo de "Categorías"
  en el menú de Navegación — eso es una decisión de estructura, no algo
  que Shopify pueda inventarse solo. Lo que **ya NO hace falta** es
  tocar código aparte: la lista de categorías que usa la IA para
  clasificar productos nuevos de distribuidores
  (`distributorCategories.server.ts`) se lee del propio menú
  "Categorías" en cada sincronización, no de una lista duplicada a
  mano — editar el menú en Shopify Admin es ahora el único paso.
  (La lista de StelOrder, `stelorderCategories.server.ts`, es un
  sistema aparte — categoriza por TIPO de producto, no por grupo
  principal, y sigue siendo una lista propia en código a propósito.)

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
