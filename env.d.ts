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
  }
}
