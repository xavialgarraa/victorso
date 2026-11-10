#!/usr/bin/env node
/**
 * Descarga por FTP el feed de los distribuidores que Oxygen no puede leer
 * directamente (ver app/lib/connectors/distributorFeed.server.ts — Oxygen
 * no soporta sockets TCP crudos, solo fetch HTTP). Este script corre fuera
 * de Oxygen (GitHub Actions, Node normal) y deja el catálogo troceado en
 * Firestore, usando la misma cuenta de servicio que ya usa la web.
 *
 * Variables de entorno esperadas (ver .github/workflows/sync-supplier-feeds.yml):
 *   FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
 *   ZENTRALMEDIA_FTP_HOST/USER/PASSWORD
 *   MIDWICH_FTP_HOST/USER/PASSWORD
 */
import {Client} from 'basic-ftp';
import {webcrypto} from 'crypto';
import {Writable} from 'stream';

function collectorStream() {
  const chunks = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(chunk);
      callback();
    },
  });
  return {stream, chunks};
}

const CHUNK_SIZE = 80; // ver nota de tamaño máximo de documento en distributorFeed.server.ts

// --- Firestore REST, igual que app/lib/firestore.server.ts + googleAuth.server.ts,
// reescrito en JS plano porque este script corre en Node normal, no en Oxygen. ---

// Firma el JWT importando la clave como PKCS8 vía Web Crypto, igual que
// app/lib/googleAuth.server.ts (que sí funciona en producción) — evita
// depender del parser de strings PEM de Node, que en el runner de GitHub
// Actions (Node 20 + OpenSSL 3) dio "DECODER routines::unsupported" con
// createSign().sign(pem) aunque la misma clave funcionaba en local.
function pemToDer(pem) {
  const base64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  return Buffer.from(base64, 'base64');
}

async function getGoogleAccessToken() {
  const clientEmail = (process.env.FIREBASE_CLIENT_EMAIL || '').trim().replace(/^"|"$/g, '');
  // El valor en .env va entre comillas dobles con "\n" escapado en una sola
  // línea (p.ej. "-----BEGIN...-----\nMII...\n-----END...-----\n") — si se
  // pegó tal cual en un secreto de GitHub, las comillas quedan como
  // caracteres literales y rompen el PEM, así que se quitan aquí por si acaso.
  const privateKeyPem = (process.env.FIREBASE_PRIVATE_KEY || '')
    .trim()
    .replace(/^"|"$/g, '')
    .replace(/\\n/g, '\n');
  if (!clientEmail || !privateKeyPem) throw new Error('Faltan FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY.');

  const now = Math.floor(Date.now() / 1000);
  const header = {alg: 'RS256', typ: 'JWT'};
  const claims = {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const signingInput = `${b64(header)}.${b64(claims)}`;

  const key = await webcrypto.subtle.importKey(
    'pkcs8',
    pemToDer(privateKeyPem),
    {name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256'},
    false,
    ['sign'],
  );
  const signatureBuffer = await webcrypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput));
  const signature = Buffer.from(signatureBuffer).toString('base64url');
  const assertion = `${signingInput}.${signature}`;

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion}),
  });
  const data = await response.json();
  if (!response.ok || !data.access_token) {
    throw new Error(`No se pudo autenticar con Google: ${data.error_description || data.error || response.status}`);
  }
  return data.access_token;
}

function toFirestoreValue(value) {
  if (value === null || value === undefined) return {nullValue: null};
  if (typeof value === 'string') return {stringValue: value};
  if (typeof value === 'boolean') return {booleanValue: value};
  if (typeof value === 'number') {
    return Number.isInteger(value) ? {integerValue: String(value)} : {doubleValue: value};
  }
  if (Array.isArray(value)) return {arrayValue: {values: value.map(toFirestoreValue)}};
  if (typeof value === 'object') return {mapValue: {fields: toFirestoreFields(value)}};
  return {stringValue: String(value)};
}

function toFirestoreFields(obj) {
  const fields = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;
    fields[key] = toFirestoreValue(value);
  }
  return fields;
}

async function firestoreSetDoc(token, projectId, collection, id, data) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collection}/${id}`;
  const response = await fetch(url, {
    method: 'PATCH',
    headers: {Authorization: `Bearer ${token}`, 'Content-Type': 'application/json'},
    body: JSON.stringify({fields: toFirestoreFields(data)}),
  });
  if (!response.ok) {
    throw new Error(`Firestore PATCH ${collection}/${id} -> ${response.status}: ${await response.text()}`);
  }
}

async function firestoreListIds(token, projectId, collection) {
  const ids = [];
  let pageToken;
  do {
    const query = pageToken ? `?pageSize=300&pageToken=${encodeURIComponent(pageToken)}&mask.fieldPaths=supplierId` : '?pageSize=300&mask.fieldPaths=supplierId';
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collection}${query}`;
    const response = await fetch(url, {headers: {Authorization: `Bearer ${token}`}});
    if (response.status === 404) break;
    if (!response.ok) throw new Error(`Firestore GET ${collection} -> ${response.status}: ${await response.text()}`);
    const data = await response.json();
    for (const doc of data.documents ?? []) ids.push(doc.name.split('/').pop());
    pageToken = data.nextPageToken;
  } while (pageToken);
  return ids;
}

async function firestoreDeleteDoc(token, projectId, collection, id) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collection}/${id}`;
  const response = await fetch(url, {method: 'DELETE', headers: {Authorization: `Bearer ${token}`}});
  if (!response.ok && response.status !== 404) {
    throw new Error(`Firestore DELETE ${collection}/${id} -> ${response.status}`);
  }
}

// --- CSV: parser consciente de comillas (coma o punto y coma como delimitador). ---

function splitCsvLine(line, delimiter) {
  const fields = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

function parseCsv(text, delimiter) {
  const lines = text.split(/\r\n|\n|\r/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return {header: [], rows: []};
  const header = splitCsvLine(lines[0], delimiter);
  const rows = lines.slice(1).map((line) => splitCsvLine(line, delimiter));
  return {header, rows};
}

function parseEsNumber(raw) {
  const cleaned = String(raw ?? '').trim().replace(/\./g, '').replace(',', '.');
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : 0;
}

function normalizeEan(raw) {
  return String(raw ?? '').trim().replace(/^0+(?=\d)/, '');
}

// --- Zentralmedia: un único CSV, ; delimitado, todo en una fila. ---

async function fetchZentralmedia() {
  const client = new Client(20000);
  try {
    await client.access({
      host: process.env.ZENTRALMEDIA_FTP_HOST,
      user: process.env.ZENTRALMEDIA_FTP_USER,
      password: process.env.ZENTRALMEDIA_FTP_PASSWORD,
      secure: false,
    });
    const {stream, chunks} = collectorStream();
    await client.downloadTo(stream, 'articulos.csv');
    const text = Buffer.concat(chunks).toString('latin1');
    const {rows} = parseCsv(text, ';');
    const products = [];
    for (const r of rows) {
      const ean = normalizeEan(r[11]);
      if (!ean) continue;
      products.push({
        supplierId: 'zentralmedia',
        ean,
        sku: (r[0] || '').trim(),
        title: (r[6] || '').trim(),
        brand: (r[1] || '').trim(),
        category: (r[5] || '').trim(),
        description: (r[8] || '').trim().slice(0, 2000),
        imageUrl: (r[16] || '').trim(),
        price: parseEsNumber(r[14]), // PVP_ConIVA
        stock: Math.max(0, Math.round(parseEsNumber(r[12]))),
      });
    }
    return products;
  } finally {
    client.close();
  }
}

// --- Midwich: catálogo + stock en ficheros separados, cruzados por EAN. ---

async function downloadText(client, remoteFile) {
  const {stream, chunks} = collectorStream();
  await client.downloadTo(stream, remoteFile);
  return Buffer.concat(chunks).toString('latin1');
}

async function fetchMidwich() {
  const client = new Client(20000);
  try {
    await client.access({
      host: process.env.MIDWICH_FTP_HOST,
      user: process.env.MIDWICH_FTP_USER,
      password: process.env.MIDWICH_FTP_PASSWORD,
      secure: false,
    });
    // No se pueden descargar dos ficheros a la vez con el mismo cliente FTP
    // (basic-ftp no soporta operaciones concurrentes en una sola conexión).
    const catalogText = await downloadText(client, 'EARPRO_Tarifa_Prosumer_Premium_con_imagenes.csv');
    const stockText = await downloadText(client, 'EARPRO_stock_report.csv');

    const stockByEan = new Map();
    const {rows: stockRows} = parseCsv(stockText, ',');
    for (const r of stockRows) {
      const ean = normalizeEan(r[1]);
      if (ean) stockByEan.set(ean, Math.max(0, Math.round(parseEsNumber(r[2]))));
    }

    // Ojo: la cabecera de este fichero usa comas, pero las filas de datos
    // vienen separadas por ";" — confirmado inspeccionando el feed real.
    const {rows: catalogRows} = parseCsv(catalogText, ';');
    const products = [];
    for (const r of catalogRows) {
      const ean = normalizeEan(r[8]);
      if (!ean) continue;
      products.push({
        supplierId: 'midwich',
        ean,
        sku: (r[1] || '').trim(),
        title: (r[5] || '').trim(),
        brand: '',
        category: (r[0] || '').trim(),
        description: (r[6] || '').trim().slice(0, 2000),
        imageUrl: (r[14] || '').trim(),
        price: parseEsNumber(r[2]), // STREET PRICE IVA Incl
        stock: stockByEan.get(ean) ?? 0,
      });
    }
    return products;
  } finally {
    client.close();
  }
}

// --- Orquestación: descarga, trocea y escribe en Firestore. ---

async function syncSupplier(token, projectId, supplierId, fetchFn) {
  console.log(`[${supplierId}] descargando...`);
  const products = await fetchFn();
  console.log(`[${supplierId}] ${products.length} productos con EAN.`);

  const existingIds = await firestoreListIds(token, projectId, 'distributor_feed_chunks');
  const staleIds = existingIds.filter((id) => id.startsWith(`${supplierId}__`));

  const chunkCount = Math.ceil(products.length / CHUNK_SIZE) || 0;
  for (let i = 0; i < chunkCount; i++) {
    const items = products.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
    await firestoreSetDoc(token, projectId, 'distributor_feed_chunks', `${supplierId}__${i}`, {
      supplierId,
      chunkIndex: i,
      items,
    });
  }

  // Borra los chunks que ya no hacen falta si el catálogo se ha reducido.
  for (const id of staleIds) {
    const idx = Number(id.split('__')[1]);
    if (!(idx < chunkCount)) await firestoreDeleteDoc(token, projectId, 'distributor_feed_chunks', id);
  }

  await firestoreSetDoc(token, projectId, 'distributor_feed_meta', supplierId, {
    supplierId,
    updatedAt: new Date().toISOString(),
    totalCount: products.length,
    chunkCount,
  });
  console.log(`[${supplierId}] escrito en Firestore (${chunkCount} chunks).`);
}

async function main() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) throw new Error('Falta FIREBASE_PROJECT_ID.');
  const token = await getGoogleAccessToken();

  const results = await Promise.allSettled([
    syncSupplier(token, projectId, 'zentralmedia', fetchZentralmedia),
    syncSupplier(token, projectId, 'midwich', fetchMidwich),
  ]);

  let failed = false;
  for (const r of results) {
    if (r.status === 'rejected') {
      failed = true;
      console.error(r.reason);
    }
  }
  if (failed) process.exit(1);
}

main();
