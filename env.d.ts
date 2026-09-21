/// <reference types="vite/client" />
/// <reference types="react-router" />
/// <reference types="@shopify/oxygen-workers-types" />
/// <reference types="@shopify/hydrogen/react-router-types" />

// Enhance TypeScript's built-in typings.
import '@total-typescript/ts-reset';

declare global {
  interface Env {
    // Admin API (custom app en Shopify Admin, con permiso de lectura/escritura
    // de Productos) - usada para guardar los emails en espera de "avísame
    // cuando vuelva a haber stock" en un metafield del producto. El servidor
    // intercambia estas credenciales por un token temporal en cada arranque.
    SHOPIFY_ADMIN_CLIENT_ID?: string;
    SHOPIFY_ADMIN_CLIENT_SECRET?: string;
    // Secreto para verificar la firma de los webhooks de Shopify (el mismo
    // "Client secret" de la app usada para el token de arriba).
    SHOPIFY_WEBHOOK_SECRET?: string;
    // Email transaccional (Resend) para el envío real del aviso de restock.
    RESEND_API_KEY?: string;
    RESEND_FROM_EMAIL?: string;
    // Asistente de chat con IA (API de Anthropic/Claude).
    ANTHROPIC_API_KEY?: string;

    // --- Panel interno (/admin-interno: proveedores, historial, reseñas) ---
    // Firebase Auth: login de Iván/Xavier. La API key es pública (se usa
    // igual en el cliente que en el servidor para las llamadas REST).
    FIREBASE_API_KEY?: string;
    FIREBASE_PROJECT_ID?: string;
    // Cuenta de servicio (Admin SDK) para que el servidor lea/escriba en
    // Firestore con permisos de administrador. Se genera en Firebase
    // Console > Configuración del proyecto > Cuentas de servicio > Generar
    // nueva clave privada (descarga un JSON con estos dos campos).
    FIREBASE_CLIENT_EMAIL?: string;
    FIREBASE_PRIVATE_KEY?: string;
    // Secreto propio para firmar la cookie de sesión del panel interno
    // (independiente de SESSION_SECRET, que es la del carrito/cliente).
    ADMIN_SESSION_SECRET?: string;
    // Lista blanca de emails con permiso para entrar en /admin-interno,
    // separados por comas. Firebase Auth por sí solo NO basta como control
    // de acceso: cualquiera que sepa la FIREBASE_API_KEY (pública) puede
    // registrarse un usuario nuevo en el proyecto vía la REST API de
    // Firebase — esta lista es la que de verdad decide quién entra.
    ADMIN_ALLOWED_EMAILS?: string;

    // Credenciales del feed de Walkasse (proveedor), hasta que se guarden
    // en Firestore desde el propio panel.
    WALKASSE_FEED_USER?: string;
    WALKASSE_FEED_PASSWORD?: string;
    // Secreto compartido para /api/sync-trigger (lo llama un cron externo,
    // no una persona logueada — ver Cloudflare Worker de ejemplo).
    SYNC_TRIGGER_SECRET?: string;
  }
}
