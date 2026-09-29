import {adminQuery} from '~/lib/shopifyAdmin.server';

/**
 * Sube un fichero de imagen a Shopify (Contenido > Archivos) y devuelve su
 * URL pública en el CDN de Shopify. Se usa para las fotos que sube el
 * admin desde /admin-interno/hero — así no hace falta alojamiento propio,
 * la imagen queda gestionada dentro del mismo Shopify.
 *
 * Flujo estándar de la Admin API (3 pasos):
 * 1. stagedUploadsCreate: pide una URL temporal de subida (Google Cloud
 *    Storage, gestionado por Shopify).
 * 2. Subir el fichero ahí directamente (multipart/form-data).
 * 3. fileCreate: le dice a Shopify "ya está subido en esa URL, procésalo
 *    como archivo del catálogo" — devuelve el archivo, pero su URL final
 *    en el CDN tarda un poco en estar lista (procesamiento async), así
 *    que hay que reintentar la lectura unas cuantas veces.
 */
export async function uploadImageToShopify(env: Env, file: File): Promise<string> {
  const staged = await adminQuery<{
    stagedUploadsCreate: {
      stagedTargets: Array<{url: string; resourceUrl: string; parameters: Array<{name: string; value: string}>}>;
      userErrors: Array<{field: string[]; message: string}>;
    };
  }>(
    env,
    `mutation($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets { url resourceUrl parameters { name value } }
        userErrors { field message }
      }
    }`,
    {input: [{resource: 'FILE', filename: file.name, mimeType: file.type || 'application/octet-stream', httpMethod: 'POST'}]},
  );

  const target = staged.stagedUploadsCreate.stagedTargets[0];
  if (!target) {
    throw new Error(
      `No se pudo iniciar la subida: ${staged.stagedUploadsCreate.userErrors.map((e) => e.message).join(', ')}`,
    );
  }

  const uploadForm = new FormData();
  for (const {name, value} of target.parameters) uploadForm.append(name, value);
  uploadForm.append('file', file);

  const uploadResponse = await fetch(target.url, {method: 'POST', body: uploadForm});
  if (!uploadResponse.ok && uploadResponse.status !== 201) {
    throw new Error(`Fallo subiendo el fichero a Shopify (${uploadResponse.status}).`);
  }

  const created = await adminQuery<{
    fileCreate: {
      files: Array<{id: string}>;
      userErrors: Array<{field: string[]; message: string}>;
    };
  }>(
    env,
    `mutation($files: [FileCreateInput!]!) {
      fileCreate(files: $files) {
        files { id }
        userErrors { field message }
      }
    }`,
    {files: [{alt: file.name, contentType: 'IMAGE', originalSource: target.resourceUrl}]},
  );

  const fileNode = created.fileCreate.files[0];
  if (!fileNode) {
    throw new Error(`No se pudo crear el archivo: ${created.fileCreate.userErrors.map((e) => e.message).join(', ')}`);
  }

  // El CDN tarda un instante en tener la imagen lista — reintenta unas
  // cuantas veces antes de rendirse.
  for (let attempt = 0; attempt < 8; attempt++) {
    const data = await adminQuery<{node: {image?: {url: string}} | null}>(
      env,
      `query($id: ID!) { node(id: $id) { ... on MediaImage { image { url } } } }`,
      {id: fileNode.id},
    );
    const url = data.node?.image?.url;
    if (url) return url;
    await new Promise((resolve) => setTimeout(resolve, 600));
  }

  throw new Error('La imagen se subió pero Shopify tardó demasiado en procesarla — vuelve a intentarlo en un momento.');
}
