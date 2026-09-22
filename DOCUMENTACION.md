# Victor So Professional — Documentación del proyecto

Tienda Shopify Hydrogen para Victor So Professional (equipos DJ, sonido
profesional y material audiovisual, Lloret de Mar). Migración desde la
tienda anterior + funcionalidades nuevas construidas sobre Hydrogen.

- **Dominio real:** https://victorso.es
- **Repo GitHub:** https://github.com/xavialgarraa/victorso.git (rama `main`,
  despliegue automático a Oxygen en cada push vía GitHub Actions)
- **Shopify admin:** https://admin.shopify.com/store/victor-so-professional
- **Canal Hydrogen:** admin → Canales de venta → Hydrogen → VictorSo

---

## 1. Rutas del panel interno (`/admin-interno`)

Panel de administración interno, con su propio layout (sin cabecera/pie de
la tienda). Login por Firebase Auth, **no** por contraseña compartida.

| Ruta | Qué hace |
|---|---|
| `/admin-interno/login` | Login (email + contraseña, Firebase Auth) |
| `/admin-interno` | Resumen / dashboard |
| `/admin-interno/proveedores` | Sincronización de proveedores: subir/consultar feed, ver cambios (dry-run) antes de aplicar, aplicar stock/precio |
| `/admin-interno/historial` | Historial de sincronizaciones (auditoría: qué se aplicó, cuándo, quién, avisos de precio) |
| `/admin-interno/resenas` | Moderación de reseñas de producto (aprobar / rechazar) |
| `/admin-interno/logout` | Cierra sesión |

Toda la sección está bloqueada para buscadores (`robots.txt`:
`Disallow: /admin-interno`).

### Control de acceso

Firebase Auth por sí solo **no basta** como control de acceso: la API key
de Firebase es pública, así que cualquiera podría registrarse un usuario
nuevo vía la REST API de Firebase. Por eso hay una **lista blanca real**
en la variable de entorno `ADMIN_ALLOWED_EMAILS` (emails separados por
coma) — solo esos correos pueden entrar, aunque tengan una cuenta Firebase
válida. Se comprueba tanto en el login como en cada sesión
(`app/lib/adminSession.server.ts`).

Sesión de admin: cookie firmada, `httpOnly`, `secure`, `sameSite: lax`
(independiente de la sesión de cliente/carrito).

---

## 2. Sincronización de proveedores (Walkasse)

- Conector real implementado solo para **Walkasse** por ahora
  (`app/lib/connectors/walkasse.server.ts`).
- El cruce de EAN se hace contra **todo el catálogo de Shopify**, nunca
  filtrado por marca/proveedor — regla de negocio importante para no
  perder coincidencias.
- Desde `/admin-interno/proveedores` se puede lanzar un **dry-run**
  (previsualizar cambios sin aplicar) y luego aplicar.
- **Stock**: se puede auto-aplicar (vía el cron diario, ver más abajo).
- **Precio**: nunca se aplica solo — siempre queda pendiente de
  confirmación manual en el panel, aunque el sync lo detecte.
  - Guardas de seguridad: precios por debajo de 0,01 € se excluyen y se
    marcan como aviso; precios que cambian por debajo de 1/3 o por encima
    de x3 respecto al actual se marcan como "sospechosos" pero se muestran
    igual para que la persona decida.
- Cada ejecución queda registrada en `/admin-interno/historial` (proveedor,
  tipo, quién/qué la disparó, contadores, errores, avisos de precio).

### Automatización diaria (cron)

Oxygen (donde corre la tienda) **no soporta cron jobs**, así que la
automatización vive en un **Cloudflare Worker separado**:

- Proyecto: `../cron-worker` (carpeta hermana de `victorso-hydrogen`)
- Nombre del Worker: `victorso-sync-cron`
- Cuenta Cloudflare: `Victorsodev@gmail.com`
- URL del Worker (para lanzarlo a mano): https://victorso-sync-cron.victorso.workers.dev
- Horario: todos los días a las **6:00 UTC** (7:00 en invierno / 8:00 en
  verano, hora España) — editable en `cron-worker/wrangler.toml`
- Llama a `POST https://victorso.es/api/sync-trigger` con
  `Authorization: Bearer <SYNC_TRIGGER_SECRET>`
- Solo actualiza **stock**, nunca precio (igual que el resto del sistema)
- Para ver logs de una ejecución en directo:
  ```
  cd cron-worker
  npx wrangler tail
  ```
- Para redesplegar tras un cambio de código:
  ```
  cd cron-worker
  npx wrangler deploy
  ```
  (requiere `CLOUDFLARE_API_TOKEN` en el entorno, o haber hecho
  `wrangler login` antes)

---

## 3. Reseñas de producto

- Sistema de reseñas con valoración por estrellas en la ficha de producto.
- **Moderadas**: toda reseña nueva queda pendiente y solo se publica en la
  ficha del producto cuando se aprueba desde
  `/admin-interno/resenas`.
- (Antes vivía en una página aparte `/moderar-resenas` protegida por
  contraseña compartida — se migró al panel interno con Firebase Auth y
  esa ruta antigua ya no existe.)

---

## 4. Idiomas (i18n) conectados al catálogo real

- Selector de idioma (ES/EN/FR/PT/CA) en la cabecera, con el mismo diseño
  que la demo original.
- Textos de interfaz (botones, menús, textos fijos): sistema de
  traducción propio en `app/lib/i18n.tsx`.
- **Catálogo real** (títulos de producto, descripciones, nombres de
  colección): traducido de verdad usando Shopify Markets + Translate &
  Adapt, consultado vía Storefront API con `@inContext(language:, country:)`.
- El idioma elegido se guarda en cookie (no solo `localStorage`) para que
  el servidor pueda leerlo al renderizar, y al cambiar de idioma se
  revalida la página para traer el contenido traducido sin recargar todo.
- **Estado de publicación en Shopify**: de momento solo español (por
  defecto) y **catalán** están publicados en Markets/Translate & Adapt.
  Inglés, francés y portugués están preparados en el código pero
  **pendientes de publicar** las traducciones en Shopify.

---

## 5. Asistente de chat (IA)

- Botón de chat flotante en toda la tienda (`app/components/ChatAssistant.tsx`).
- Backend: `app/routes/api.chat.tsx`, usa la API de Anthropic (modelo
  `claude-haiku-4-5-20251001`) con una herramienta `search_products` que
  busca productos reales del catálogo (nunca inventa precio/stock).
- Requiere la variable `ANTHROPIC_API_KEY` en Oxygen. Si no está
  configurada, el asistente responde con un aviso amable en vez de fallar
  (se han dado casos de clave mal pegada en Oxygen — revisar que el valor
  sea exactamente la API key, sin espacios, si el chat deja de responder).

---

## 6. Carrito

- Resumen del carrito (`app/components/CartSummary.tsx`) con barra de
  progreso hacia el envío gratis (umbral: **149 €**, mismo valor que la
  tarifa real configurada en Shopify → Envío y entrega → zona España →
  tarifa "Estándar": gratis a partir de 149 €, si no 6,99 €).
- Fila de "Envío" en el resumen: muestra "Se calcula en el siguiente paso"
  si no se ha llegado a 149 €, o "Gratis" si ya se ha superado (el cálculo
  real de gastos de envío solo puede hacerlo Shopify en el checkout, con
  la dirección — el resumen del carrito no puede calcularlo antes).

---

## 7. Variables de entorno (Oxygen)

Configurables en Shopify admin → Hydrogen → VictorSo → Production →
"Editar entorno" → Variables de entorno. **Cada cambio requiere volver a
desplegar** para que la instancia en producción lo recoja.

| Variable | Para qué sirve |
|---|---|
| `SHOPIFY_ADMIN_CLIENT_ID` / `SHOPIFY_ADMIN_CLIENT_SECRET` | App personalizada del Admin API (avisos de restock, sync de proveedores) |
| `SHOPIFY_WEBHOOK_SECRET` | Verificar firma de webhooks de Shopify |
| `RESEND_API_KEY` / `RESEND_FROM_EMAIL` | Envío real de emails de aviso de restock (pendiente de configurar) |
| `ANTHROPIC_API_KEY` | Asistente de chat con IA |
| `FIREBASE_API_KEY` / `FIREBASE_PROJECT_ID` | Firebase Auth (login panel interno) |
| `FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY` | Cuenta de servicio Firebase (acceso admin a Firestore) |
| `ADMIN_SESSION_SECRET` | Firma la cookie de sesión del panel interno |
| `ADMIN_ALLOWED_EMAILS` | Lista blanca de emails con acceso a `/admin-interno` |
| `WALKASSE_FEED_USER` / `WALKASSE_FEED_PASSWORD` | Credenciales del feed de Walkasse |
| `SYNC_TRIGGER_SECRET` | Protege `/api/sync-trigger` (lo llama el cron externo, no una persona) — debe coincidir exactamente con el secreto configurado en el Cloudflare Worker |

---

## 8. Pendiente / próximos pasos

- Publicar las traducciones de catálogo en inglés, francés y portugués en
  Shopify Markets/Translate & Adapt (catalán y español ya están).
- Configurar `RESEND_API_KEY` para que los avisos de "vuelve a haber
  stock" se envíen de verdad por email.
- Registrar el webhook `products/update` (ahora que ya hay dominio
  público estable, `victorso.es`).
- Revisar y probablemente desinstalar las apps de terceros redundantes de
  "aviso de restock" que había instaladas en la tienda (R+ Back In Stock,
  Kbite), ya que esa función ya la cubre el código propio.
