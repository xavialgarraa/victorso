import {getGoogleAccessToken} from '~/lib/googleAuth.server';

/**
 * Cliente mínimo para la Firestore REST API (v1). No usamos el SDK de
 * cliente de Firebase ni firebase-admin — solo fetch + el access_token de
 * la cuenta de servicio. Firestore representa cada valor con un objeto
 * tipado ({stringValue: "..."}, {integerValue: "..."}, ...); las
 * funciones to/from de aquí abajo convierten eso a JS normal y viceversa.
 */

type FirestoreValue =
  | {stringValue: string}
  | {integerValue: string}
  | {doubleValue: number}
  | {booleanValue: boolean}
  | {nullValue: null}
  | {timestampValue: string}
  | {mapValue: {fields: Record<string, FirestoreValue>}}
  | {arrayValue: {values: FirestoreValue[]}};

function toFirestoreValue(value: unknown): FirestoreValue {
  if (value === null || value === undefined) return {nullValue: null};
  if (typeof value === 'string') return {stringValue: value};
  if (typeof value === 'boolean') return {booleanValue: value};
  if (typeof value === 'number') {
    return Number.isInteger(value) ? {integerValue: String(value)} : {doubleValue: value};
  }
  if (value instanceof Date) return {timestampValue: value.toISOString()};
  if (Array.isArray(value)) {
    return {arrayValue: {values: value.map(toFirestoreValue)}};
  }
  if (typeof value === 'object') {
    return {mapValue: {fields: toFirestoreFields(value as Record<string, unknown>)}};
  }
  return {stringValue: String(value)};
}

function toFirestoreFields(obj: Record<string, unknown>): Record<string, FirestoreValue> {
  const fields: Record<string, FirestoreValue> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;
    fields[key] = toFirestoreValue(value);
  }
  return fields;
}

function fromFirestoreValue(value: FirestoreValue): unknown {
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('nullValue' in value) return null;
  if ('timestampValue' in value) return value.timestampValue;
  if ('arrayValue' in value) return (value.arrayValue.values ?? []).map(fromFirestoreValue);
  if ('mapValue' in value) return fromFirestoreFields(value.mapValue.fields ?? {});
  return null;
}

function fromFirestoreFields(fields: Record<string, FirestoreValue>): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    obj[key] = fromFirestoreValue(value);
  }
  return obj;
}

function baseUrl(env: Env): string {
  if (!env.FIREBASE_PROJECT_ID) {
    throw new Error('Falta FIREBASE_PROJECT_ID en las variables de entorno.');
  }
  return `https://firestore.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents`;
}

async function firestoreFetch(env: Env, path: string, init?: RequestInit) {
  const token = await getGoogleAccessToken(env);
  const response = await fetch(`${baseUrl(env)}${path}`, {
    ...init,
    headers: {
      ...init?.headers,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });
  return response;
}

export type FirestoreDoc<T> = {id: string; data: T};

/** Lee todos los documentos de una colección. */
export async function listDocs<T extends Record<string, unknown>>(
  env: Env,
  collection: string,
): Promise<FirestoreDoc<T>[]> {
  const response = await firestoreFetch(env, `/${collection}`);
  if (response.status === 404) return [];
  if (!response.ok) {
    throw new Error(`Firestore: no se pudo leer "${collection}" (${response.status}).`);
  }
  const data = (await response.json()) as {
    documents?: Array<{name: string; fields?: Record<string, FirestoreValue>}>;
  };
  return (data.documents ?? []).map((doc) => ({
    id: doc.name.split('/').pop()!,
    data: fromFirestoreFields(doc.fields ?? {}) as T,
  }));
}

export async function getDoc<T extends Record<string, unknown>>(
  env: Env,
  collection: string,
  id: string,
): Promise<T | null> {
  const response = await firestoreFetch(env, `/${collection}/${id}`);
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Firestore: no se pudo leer "${collection}/${id}" (${response.status}).`);
  }
  const data = (await response.json()) as {fields?: Record<string, FirestoreValue>};
  return fromFirestoreFields(data.fields ?? {}) as T;
}

/** Crea o sobrescribe un documento entero (id fijo, elegido por nosotros). */
export async function setDoc(
  env: Env,
  collection: string,
  id: string,
  data: Record<string, unknown>,
): Promise<void> {
  const response = await firestoreFetch(env, `/${collection}/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({fields: toFirestoreFields(data)}),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Firestore: no se pudo guardar "${collection}/${id}" (${response.status}): ${text}`);
  }
}

/** Crea un documento nuevo con id autogenerado por Firestore. Devuelve el id. */
export async function addDoc(
  env: Env,
  collection: string,
  data: Record<string, unknown>,
): Promise<string> {
  const response = await firestoreFetch(env, `/${collection}`, {
    method: 'POST',
    body: JSON.stringify({fields: toFirestoreFields(data)}),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Firestore: no se pudo crear en "${collection}" (${response.status}): ${text}`);
  }
  const doc = (await response.json()) as {name: string};
  return doc.name.split('/').pop()!;
}

export async function deleteDoc(env: Env, collection: string, id: string): Promise<void> {
  const response = await firestoreFetch(env, `/${collection}/${id}`, {method: 'DELETE'});
  if (!response.ok && response.status !== 404) {
    throw new Error(`Firestore: no se pudo borrar "${collection}/${id}" (${response.status}).`);
  }
}
