/**
 * Autenticación de Firebase por REST, sin el SDK "firebase-admin" (que usa
 * APIs de Node como grpc/net que no existen en el runtime de Oxygen/
 * Cloudflare Workers). Todo esto son llamadas HTTP normales + verificación
 * de la firma del token con Web Crypto, igual que ya hacemos con el token
 * de la Admin API de Shopify en shopifyAdmin.server.ts.
 */

export type FirebaseSignInResult = {
  idToken: string;
  refreshToken: string;
  expiresInSeconds: number;
  uid: string;
  email: string;
};

function requireApiKey(env: Env): string {
  if (!env.FIREBASE_API_KEY) {
    throw new Error('Falta FIREBASE_API_KEY en las variables de entorno.');
  }
  return env.FIREBASE_API_KEY;
}

/** Login con email/contraseña contra Firebase Auth (Identity Toolkit REST). */
export async function signInWithPassword(
  env: Env,
  email: string,
  password: string,
): Promise<FirebaseSignInResult> {
  const apiKey = requireApiKey(env);
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
    {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({email, password, returnSecureToken: true}),
    },
  );

  const data = (await response.json()) as {
    idToken?: string;
    refreshToken?: string;
    expiresIn?: string;
    localId?: string;
    email?: string;
    error?: {message: string};
  };

  if (!response.ok || !data.idToken) {
    // Firebase devuelve códigos como INVALID_LOGIN_CREDENTIALS, USER_DISABLED, etc.
    throw new Error(data.error?.message || 'No se pudo iniciar sesión.');
  }

  return {
    idToken: data.idToken,
    refreshToken: data.refreshToken!,
    expiresInSeconds: Number(data.expiresIn ?? '3600'),
    uid: data.localId!,
    email: data.email!,
  };
}

/** Cambia un refresh token por un idToken nuevo (el idToken caduca en 1h). */
export async function refreshIdToken(
  env: Env,
  refreshToken: string,
): Promise<{idToken: string; refreshToken: string; expiresInSeconds: number}> {
  const apiKey = requireApiKey(env);
  const response = await fetch(`https://securetoken.googleapis.com/v1/token?key=${apiKey}`, {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({grant_type: 'refresh_token', refresh_token: refreshToken}),
  });

  const data = (await response.json()) as {
    id_token?: string;
    refresh_token?: string;
    expires_in?: string;
    error?: {message: string};
  };

  if (!response.ok || !data.id_token) {
    throw new Error(data.error?.message || 'No se pudo renovar la sesión.');
  }

  return {
    idToken: data.id_token,
    refreshToken: data.refresh_token!,
    expiresInSeconds: Number(data.expires_in ?? '3600'),
  };
}

// --- Verificación del idToken en el servidor (sin firebase-admin) ---

type Jwk = {kid: string; n: string; e: string; kty: string; alg: string};

const JWKS_URL = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

let cachedJwks: {keys: Jwk[]; expiresAt: number} | null = null;

async function getGoogleJwks(): Promise<Jwk[]> {
  if (cachedJwks && cachedJwks.expiresAt > Date.now()) {
    return cachedJwks.keys;
  }
  const response = await fetch(JWKS_URL);
  if (!response.ok) {
    throw new Error(`No se pudieron obtener las claves públicas de Google (${response.status}).`);
  }
  const data = (await response.json()) as {keys: Jwk[]};
  cachedJwks = {
    keys: data.keys,
    // Cachea 1h; las claves de Google rotan con poca frecuencia.
    expiresAt: Date.now() + 60 * 60 * 1000,
  };
  return data.keys;
}

function base64UrlToUint8Array(base64Url: string): Uint8Array {
  const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function base64UrlToJson<T>(base64Url: string): T {
  return JSON.parse(new TextDecoder().decode(base64UrlToUint8Array(base64Url))) as T;
}

export type VerifiedFirebaseUser = {uid: string; email: string};

/**
 * Verifica la firma y las claims de un idToken de Firebase Auth. Devuelve
 * el usuario si es válido, o null si no lo es (firma inválida, caducado,
 * proyecto distinto...). No lanza excepción — un token inválido es un
 * caso normal (sesión caducada), no un error de programa.
 */
export async function verifyIdToken(env: Env, idToken: string): Promise<VerifiedFirebaseUser | null> {
  if (!env.FIREBASE_PROJECT_ID) {
    throw new Error('Falta FIREBASE_PROJECT_ID en las variables de entorno.');
  }

  const parts = idToken.split('.');
  if (parts.length !== 3) return null;
  const [headerPart, payloadPart, signaturePart] = parts;

  let header: {kid?: string; alg?: string};
  let payload: {
    aud?: string;
    iss?: string;
    sub?: string;
    email?: string;
    exp?: number;
    iat?: number;
  };
  try {
    header = base64UrlToJson(headerPart);
    payload = base64UrlToJson(payloadPart);
  } catch {
    return null;
  }

  if (header.alg !== 'RS256' || !header.kid) return null;

  const now = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp < now) return null;
  if (!payload.iat || payload.iat > now + 60) return null;
  if (payload.aud !== env.FIREBASE_PROJECT_ID) return null;
  if (payload.iss !== `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`) return null;
  if (!payload.sub) return null;

  const jwks = await getGoogleJwks();
  const jwk = jwks.find((k) => k.kid === header.kid);
  if (!jwk) return null;

  const publicKey = await crypto.subtle.importKey(
    'jwk',
    {kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true},
    {name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256'},
    false,
    ['verify'],
  );

  const signedData = new TextEncoder().encode(`${headerPart}.${payloadPart}`);
  const signature = base64UrlToUint8Array(signaturePart);

  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    publicKey,
    signature as BufferSource,
    signedData,
  );
  if (!valid) return null;

  return {uid: payload.sub, email: payload.email ?? ''};
}
