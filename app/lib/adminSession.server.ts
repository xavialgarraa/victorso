import {createCookieSessionStorage, redirect} from 'react-router';
import {refreshIdToken, verifyIdToken, type VerifiedFirebaseUser} from '~/lib/firebaseAuth.server';

/**
 * Firebase Auth por sí solo NO es suficiente control de acceso: con
 * Email/Password activado, cualquiera puede registrarse un usuario nuevo
 * en el proyecto llamando directamente a la REST API de Identity Toolkit
 * con la FIREBASE_API_KEY (que es pública, no un secreto). Esta lista es
 * la que de verdad decide quién puede usar el panel — se comprueba
 * siempre, además de que el token sea válido.
 */
export function isAllowedAdminEmail(env: Env, email: string): boolean {
  const allowed = (env.ADMIN_ALLOWED_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return allowed.length > 0 && allowed.includes(email.toLowerCase());
}

const COOKIE_NAME = 'vs_admin_session';

function getStorage(env: Env) {
  if (!env.ADMIN_SESSION_SECRET) {
    throw new Error('Falta ADMIN_SESSION_SECRET en las variables de entorno.');
  }
  return createCookieSessionStorage({
    cookie: {
      name: COOKIE_NAME,
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      secure: true,
      secrets: [env.ADMIN_SESSION_SECRET],
    },
  });
}

export type AdminTokens = {
  idToken: string;
  refreshToken: string;
  expiresAt: number; // Date.now() + expiresInSeconds*1000
};

/** Crea la cookie de sesión tras un login correcto. */
export async function createAdminSessionCookie(env: Env, tokens: AdminTokens): Promise<string> {
  const storage = getStorage(env);
  const session = await storage.getSession();
  session.set('idToken', tokens.idToken);
  session.set('refreshToken', tokens.refreshToken);
  session.set('expiresAt', tokens.expiresAt);
  return storage.commitSession(session);
}

export async function destroyAdminSessionCookie(env: Env, request: Request): Promise<string> {
  const storage = getStorage(env);
  const session = await storage.getSession(request.headers.get('Cookie'));
  return storage.destroySession(session);
}

type SessionCheckResult =
  | {ok: true; user: VerifiedFirebaseUser; setCookie?: string}
  | {ok: false};

/** Lee la cookie, verifica el idToken y lo renueva sola si ha caducado
 * (usando el refreshToken). No la llames directamente desde una ruta —
 * usa requireAdminUser, que ya gestiona la redirección a login. */
async function checkAdminSession(request: Request, env: Env): Promise<SessionCheckResult> {
  const storage = getStorage(env);
  const session = await storage.getSession(request.headers.get('Cookie'));
  const idToken = session.get('idToken') as string | undefined;
  const refreshToken = session.get('refreshToken') as string | undefined;
  const expiresAt = session.get('expiresAt') as number | undefined;

  if (!idToken || !refreshToken || !expiresAt) return {ok: false};

  // Margen de 60s de seguridad antes de la caducidad real.
  if (Date.now() < expiresAt - 60_000) {
    const user = await verifyIdToken(env, idToken);
    if (!user || !isAllowedAdminEmail(env, user.email)) return {ok: false};
    return {ok: true, user};
  }

  // El idToken ha caducado (dura 1h): pedimos uno nuevo con el refreshToken,
  // que dura mucho más. Si esto también falla, hay que volver a hacer login.
  try {
    const refreshed = await refreshIdToken(env, refreshToken);
    const user = await verifyIdToken(env, refreshed.idToken);
    if (!user || !isAllowedAdminEmail(env, user.email)) return {ok: false};

    session.set('idToken', refreshed.idToken);
    session.set('refreshToken', refreshed.refreshToken);
    session.set('expiresAt', Date.now() + refreshed.expiresInSeconds * 1000);
    const setCookie = await storage.commitSession(session);

    return {ok: true, user, setCookie};
  } catch {
    return {ok: false};
  }
}

/**
 * Úsala al principio del loader/action de cualquier ruta de
 * /admin-interno que deba estar protegida. Si no hay sesión válida,
 * redirige a login. Si el token se ha renovado, devuelve `headers` — hay
 * que pasarlos en la respuesta de la ruta para que el navegador reciba la
 * cookie actualizada (si no, en la siguiente petición volvería a caducar).
 */
export async function requireAdminUser(
  request: Request,
  env: Env,
): Promise<{user: VerifiedFirebaseUser; headers?: HeadersInit}> {
  const result = await checkAdminSession(request, env);
  if (!result.ok) {
    const url = new URL(request.url);
    throw redirect(`/admin-interno/login?next=${encodeURIComponent(url.pathname)}`);
  }
  return {
    user: result.user,
    headers: result.setCookie ? {'Set-Cookie': result.setCookie} : undefined,
  };
}
