# Categorías y subcategorías — qué es automático y qué no

Notas sobre cómo se comporta el sistema de categorías (mega-menú, home,
páginas de categoría) cuando cambia el catálogo en Shopify. Escrito el
2026-11-18, ampliado el 2026-11-28 con la guía paso a paso de abajo.

## Cómo modificar todo desde Shopify (paso a paso)

Desde hoy, **todo lo que se ve como categoría/subcategoría en la web
sale de dos sitios de Shopify Admin, nunca de código**: el menú de
navegación "Categorías" (la estructura: qué es grupo y qué es
subcategoría) y las Colecciones (los productos de cada subcategoría).
No hace falta avisarnos para ninguno de estos cambios ni esperar a que
redesplieguemos nada — se ve en la web en cuanto se guarda en Shopify
(unos segundos, como mucho el tiempo de caché de la página).

1. **Mover un producto a otra subcategoría, o quitarlo de una.**
   Shopify Admin → **Productos** → abrir el producto → sección
   "Organización del producto" → **Colecciones**. Quitar la colección
   vieja y añadir la nueva (puede estar en varias a la vez si hace
   falta). Aparece solo en el mega-menú, en la cuadrícula de su
   categoría y en el listado combinado — no hace falta tocar nada más.

2. **Añadir una subcategoría nueva dentro de un grupo que ya existe**
   (p. ej. una "Cajas de ritmo" nueva dentro de "Zona DJ"):
   - Shopify Admin → **Productos → Colecciones → Crear colección**.
     Dale el título con el que quieres que se vea en la web y
     asígnale al menos 1 producto (si se crea vacía, no sale en
     ningún sitio hasta que tenga producto — es lo mismo que ya pasa
     con las categorías principales "bare", ver más abajo).
   - Shopify Admin → **Contenido → Menús** → abrir el menú principal
     (el que tiene "Categorías" como uno de sus ítems) → dentro de
     "Categorías", dentro del grupo que toque (p. ej. "Zona DJ") →
     **Añadir elemento del menú** → enlazar a esa colección nueva.
   - Opcional: en `/admin-interno/categorias` se puede elegir a mano
     la foto/icono de esa subcategoría en vez de que coja la del
     primer producto.

3. **Crear una categoría principal nueva** (un grupo al mismo nivel
   que "Zona DJ" o "Cables", no una subcategoría dentro de una que ya
   existe):
   - Crear su colección en Shopify igual que en el paso 2 (puede
     quedarse vacía de producto propio — las categorías principales
     normalmente son "bare", ver la última sección de este documento).
   - En **Contenido → Menús**, añadirla como hijo directo de
     "Categorías" (al mismo nivel que "Zona DJ", "Cables", etc.), y
     luego sus subcategorías como hijos de ella (como el paso 2).
   - Desde el `2026-11-27` esto es **el único paso** — la IA que
     clasifica productos nuevos de los distribuidores (Zentralmedia,
     Midwich, Walkasse) lee ella sola la lista de categorías
     principales de este mismo menú en cada sincronización, así que
     empieza a poder clasificar en la categoría nueva sin que nadie
     toque código.

4. **Reordenar** una categoría/subcategoría: se arrastra directamente
   en **Contenido → Menús** — se ve en el orden nuevo en la web sin
   nada más.

5. **Renombrar una categoría/subcategoría.** ⚠️ A diferencia de los
   puntos anteriores, esto SÍ tiene una trampa si es una de las 7
   categorías principales (las que usa la IA de distribuidores): hay
   que renombrar **el título del ítem en el menú** (lo que ve el
   cliente) **y el título de su colección en Shopify** (Productos →
   Colecciones) **a la vez, al mismo texto**. Si se renombra solo uno
   de los dos, la próxima vez que se cree un producto nuevo desde un
   distribuidor en esa categoría, el sistema no encontrará la colección
   existente (busca por el nombre que ve en el menú) y creará una
   colección duplicada con el nombre nuevo — quedaría la categoría
   "partida en dos" sin que se note hasta pasado un tiempo. Para
   subcategorías normales (no una de las 7 principales) no hay este
   riesgo — renombra solo el menú y ya está.

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
