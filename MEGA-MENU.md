# Mega-menú de categorías — guía para Víctor

Esto es lo que necesitas saber para activar y mantener el nuevo menú de categorías con fotos/iconos en victorso.es.

## Qué es

Hasta ahora "Categorías" en el menú de arriba era un desplegable con una simple lista de texto. Ahora la web sabe mostrar un mega-menú como el de las tiendas grandes: columnas con grupos y, dentro, pestañas con foto redonda — **pero solo si tú lo montas en Shopify**. Mientras no lo montes, la web sigue funcionando exactamente igual que ahora (el desplegable de texto de toda la vida). No hay ningún riesgo de que se rompa nada por no tocarlo.

## Cómo activarlo — 2 pasos

### Paso 1: montar el menú en Shopify

Ve a **Shopify Admin → Contenido → Navegación** → el menú principal de la tienda.

Tiene que haber un item que se llame **"Categorías"** (sin importar mayúsculas/acentos). Dentro de ese item, añade sub-items que enlacen a tus colecciones. Hay dos formas de montarlo, según lo que quieras conseguir:

**Opción A — menú sencillo (una sola fila de iconos)**
```
Categorías
├── Altavoces          → /collections/altavoces
├── Microfonía         → /collections/microfonia
├── Mezcladores        → /collections/mezcladores
└── Iluminación        → /collections/iluminacion
```
Si ninguno de los hijos tiene a su vez más hijos, todos salen juntos en un único panel de iconos.

**Opción B — menú agrupado (columnas + iconos), como Madrid HiFi**
```
Categorías
├── Sonido y Audio
│   ├── Altavoces           → /collections/altavoces
│   ├── Microfonía          → /collections/microfonia
│   └── Mezcladores         → /collections/mezcladores
├── Iluminación
│   ├── Focos LED           → /collections/focos-led
│   └── Láseres              → /collections/laseres
└── DJ
    ├── Controladoras        → /collections/controladoras
    └── Platos                → /collections/platos
```
Aquí cada hijo de primer nivel ("Sonido y Audio", "Iluminación", "DJ") se convierte en una columna/grupo a la izquierda, y sus propios hijos salen como iconos a la derecha. Shopify permite anidar hasta 3 niveles en su editor de Navegación — es justo lo que se usa aquí.

No hace falta que decidas de golpe: puedes probar la Opción A primero y pasar a la Opción B más adelante sin tocar nada de código, solo reorganizando el menú en Shopify.

### Paso 2 (opcional): subir fotos redondas por categoría

Por defecto, cada pestaña del mega-menú sale con un icono genérico que la web adivina sola por el nombre (p.ej. "Iluminación" → bombilla, "Microfonía" → micrófono). Si quieres que salga una foto real en vez del icono:

Ve a **`/admin-interno/categorias`** (pestaña "Carátulas categorías" en el panel interno) y sube una foto para la colección que quieras. Esa foto es la que se usa como icono redondo en el mega-menú — no hace falta tocar nada más, se recoge sola.

Si no subes nada para una categoría concreta, simplemente se queda con el icono genérico — nunca se ve un hueco vacío.

## Resumen rápido

| Quiero... | Qué hago |
|---|---|
| Activar el mega-menú | Crear item "Categorías" en Shopify → Navegación, con hijos |
| Pasar de menú plano a agrupado por columnas | Anidar un nivel más dentro de los hijos de "Categorías" |
| Poner una foto en vez del icono genérico | Subirla en `/admin-interno/categorias` |
| Quitar un icono/foto y volver al genérico | Borrarla en `/admin-interno/categorias` |
| Volver atrás, al desplegable de texto de siempre | Borrar o renombrar el item "Categorías" en Shopify |

## Dónde tocar si algo no cuadra

- El icono que se adivina por nombre para cada categoría está en `app/lib/categoryIcons.ts` — es una lista de palabras clave (p.ej. "altavoz" → icono de altavoz). Si una categoría nueva sale con el icono genérico de etiqueta por defecto, es que su nombre no coincide con ninguna palabra clave de esa lista — se puede ampliar sin tocar nada más.
