const MAX_JSON_BYTES = 25 * 1024 * 1024;

function invalid(message) {
  const error = new Error(message);
  error.status = 400;
  throw error;
}

export function modelContentType(fileName) {
  return String(fileName || '').toLowerCase().endsWith('.gltf')
    ? 'model/gltf+json' : 'model/gltf-binary';
}

export function modelResponseHeaders(fileName) {
  const safeName = String(fileName || 'model.glb').replace(/[\r\n"\\]/g, '-');
  return {
    'Content-Type': modelContentType(fileName),
    'X-Content-Type-Options': 'nosniff',
    'Content-Security-Policy': "sandbox; default-src 'none'; frame-ancestors 'none'",
    'Content-Disposition': `attachment; filename="${safeName.replace(/[^\x20-\x7e]/g, '_')}"; filename*=UTF-8''${encodeURIComponent(safeName)}`,
  };
}

function validateDocument(document, binaryBytes = null) {
  if (!document || Array.isArray(document) || document.asset?.version !== '2.0') {
    invalid('Only a valid glTF 2.0 model document is accepted.');
  }
  for (const name of ['scenes', 'nodes', 'meshes', 'buffers', 'bufferViews', 'accessors', 'images', 'textures', 'materials']) {
    if (document[name] !== undefined && !Array.isArray(document[name])) invalid(`Invalid glTF ${name}.`);
  }
  for (const buffer of document.buffers || []) {
    if (!buffer || !Number.isSafeInteger(buffer.byteLength) || buffer.byteLength < 0) invalid('Invalid glTF buffer length.');
    if (buffer.uri === undefined) {
      if (binaryBytes === null || buffer.byteLength > binaryBytes) invalid('Missing or incomplete GLB buffer data.');
    } else if (typeof buffer.uri !== 'string' || !/^data:application\/(?:octet-stream|gltf-buffer);base64,[A-Za-z0-9+/]*={0,2}$/.test(buffer.uri)) {
      invalid('Upload a self-contained GLB or GLTF; external model resources are not accepted.');
    }
  }
  for (const image of document.images || []) {
    if (!image || typeof image !== 'object') invalid('Invalid glTF image.');
    if (image.uri !== undefined && (typeof image.uri !== 'string' || !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]*={0,2}$/.test(image.uri))) {
      invalid('Only embedded PNG, JPEG, or WebP textures are accepted.');
    }
    if (image.uri === undefined && (!Number.isSafeInteger(image.bufferView) || !['image/png', 'image/jpeg', 'image/webp'].includes(image.mimeType))) {
      invalid('Invalid embedded model texture.');
    }
  }
  return document;
}

export function validateModelFile(data, extension) {
  const bytes = new Uint8Array(data);
  if (!bytes.length || bytes.length > MAX_JSON_BYTES) invalid('Invalid model size.');
  const decode = (value) => {
    try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(value)); }
    catch { invalid('Model contains invalid glTF JSON.'); }
  };
  if (extension === 'gltf') return validateDocument(decode(bytes));
  if (extension !== 'glb' || bytes.byteLength < 20) invalid('Invalid GLB header.');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, true) !== 0x46546c67 || view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== bytes.byteLength) {
    invalid('Invalid GLB signature, version, or length.');
  }
  let offset = 12;
  let document;
  let binaryBytes = 0;
  let chunkIndex = 0;
  while (offset < bytes.byteLength) {
    if (offset + 8 > bytes.byteLength) invalid('Truncated GLB chunk header.');
    const length = view.getUint32(offset, true);
    const type = view.getUint32(offset + 4, true);
    offset += 8;
    if (length % 4 || offset + length > bytes.byteLength) invalid('Invalid GLB chunk length.');
    if (chunkIndex === 0 && type !== 0x4e4f534a) invalid('GLB must begin with a JSON chunk.');
    if (type === 0x4e4f534a) {
      if (chunkIndex !== 0) invalid('GLB has duplicate JSON chunks.');
      document = decode(bytes.subarray(offset, offset + length));
    } else if (type === 0x004e4942) {
      if (chunkIndex !== 1) invalid('Invalid GLB binary chunk order.');
      binaryBytes = length;
    } else invalid('Unsupported GLB chunk.');
    offset += length;
    chunkIndex++;
  }
  return validateDocument(document, binaryBytes);
}
