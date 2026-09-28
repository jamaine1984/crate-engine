import { Inflate } from 'fflate';
import { HttpError } from './common.mjs';

/** Structural validation is not a malware verdict. Run this in a bounded scanner job. */
export const ARCHIVE_LIMITS = Object.freeze({
  maxArchiveBytes: 64 * 1024 * 1024,
  maxFiles: 1000,
  maxEntryBytes: 32 * 1024 * 1024,
  maxExtractedBytes: 128 * 1024 * 1024,
  maxCompressionRatio: 100,
  maxPathBytes: 512,
  maxDepth: 24,
});

const signatures = { local: 0x04034b50, central: 0x02014b50, end: 0x06054b50, descriptor: 0x08074b50 };
const utf8 = new TextDecoder('utf-8', { fatal: true });
const safeExtras = new Set([0x5455, 0x000a, 0x7875]); // timestamps and UID/GID only
const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

function invalid(message, code = 'ARCHIVE_INVALID', status = 422) {
  throw new HttpError(status, message, code);
}

function limitsFor(options) {
  const aliases = {
    maxArchiveBytes: options.uploadBytes,
    maxFiles: options.files,
    maxExtractedBytes: options.extractedBytes,
    maxCompressionRatio: options.compressionRatio,
  };
  const limits = {};
  for (const [name, fallback] of Object.entries(ARCHIVE_LIMITS)) {
    const value = options[name] ?? aliases[name] ?? fallback;
    if (!Number.isSafeInteger(value) || value < 1) invalid(`Invalid scanner limit: ${name}.`, 'SCANNER_CONFIGURATION', 500);
    limits[name] = value;
  }
  return limits;
}

function sourceBytes(input) {
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (input instanceof Uint8Array) return input;
  invalid('Provide ZIP bytes as an ArrayBuffer or Uint8Array.');
}

function checkRange(offset, length, upperBound) {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset + length > upperBound) {
    invalid('ZIP contains a truncated or overlapping record.');
  }
}

function checkExtras(bytes, view, start, length) {
  const end = start + length;
  checkRange(start, length, bytes.length);
  const fields = new Set();
  for (let position = start; position < end;) {
    checkRange(position, 4, end);
    const id = view.getUint16(position, true), size = view.getUint16(position + 2, true);
    checkRange(position + 4, size, end);
    if (!safeExtras.has(id) || fields.has(id)) {
      invalid('ZIP contains unsupported, duplicate, encrypted, ZIP64, or alternate-path metadata.', 'ARCHIVE_UNSUPPORTED');
    }
    fields.add(id);
    position += 4 + size;
  }
}

function readPath(raw, flags, limits) {
  if (!raw.length || raw.length > limits.maxPathBytes) invalid('An archive path exceeds the configured limit.', 'ARCHIVE_PATH');
  if (!(flags & 0x0800) && raw.some((byte) => byte > 127)) invalid('Non-ASCII archive paths must use the ZIP UTF-8 flag.', 'ARCHIVE_PATH');
  let name;
  try { name = utf8.decode(raw); } catch { invalid('Archive path is not valid UTF-8.', 'ARCHIVE_PATH'); }
  if (name !== name.normalize('NFC') || /[\x00-\x1f\x7f-\x9f\\:%?#]/u.test(name) || name.startsWith('/')) {
    invalid('Archive contains an unsafe or ambiguous path.', 'ARCHIVE_PATH');
  }
  const directory = name.endsWith('/');
  const path = directory ? name.slice(0, -1) : name;
  const parts = path.split('/');
  if (parts.length > limits.maxDepth || parts.some((part) => !part || part === '.' || part === '..' || /[. ]$/.test(part) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) {
    invalid('Archive contains traversal, reserved, or excessively deep paths.', 'ARCHIVE_PATH');
  }
  return { path, directory, parts };
}

function registerPath(entry, nodes, explicitPaths) {
  const key = entry.path.toUpperCase();
  if (explicitPaths.has(key)) invalid('Archive contains duplicate or case-colliding paths.', 'ARCHIVE_PATH_COLLISION');
  explicitPaths.add(key);
  for (let depth = 1; depth <= entry.parts.length; depth++) {
    const path = entry.parts.slice(0, depth).join('/');
    const isDirectory = depth < entry.parts.length || entry.directory;
    const folded = path.toUpperCase(), previous = nodes.get(folded);
    if (previous && (previous.path !== path || previous.directory !== isDirectory)) {
      invalid('Archive contains directory/file or case-colliding paths.', 'ARCHIVE_PATH_COLLISION');
    }
    if (!previous) nodes.set(folded, { path, directory: isDirectory });
  }
}

function endRecord(bytes, view) {
  // A comment is permitted, but appended bytes and ZIP64/multi-volume layouts are not.
  for (let position = bytes.length - 22; position >= Math.max(0, bytes.length - 22 - 65535); position--) {
    if (view.getUint32(position, true) !== signatures.end) continue;
    const commentBytes = view.getUint16(position + 20, true);
    if (position + 22 + commentBytes !== bytes.length) continue;
    const disk = view.getUint16(position + 4, true), centralDisk = view.getUint16(position + 6, true);
    const diskEntries = view.getUint16(position + 8, true), entries = view.getUint16(position + 10, true);
    const centralSize = view.getUint32(position + 12, true), centralOffset = view.getUint32(position + 16, true);
    if (disk || centralDisk || diskEntries !== entries || entries === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
      invalid('ZIP64 and multi-volume archives are not supported.', 'ARCHIVE_UNSUPPORTED');
    }
    checkRange(centralOffset, centralSize, position);
    if (centralOffset + centralSize !== position) invalid('ZIP central directory does not end at its declared boundary.');
    return { position, entries, centralSize, centralOffset };
  }
  invalid('ZIP end-of-central-directory record is missing or has appended data.');
}

function inspectHeaders(bytes, limits) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = endRecord(bytes, view);
  if (!end.entries || end.entries > limits.maxFiles) invalid('Archive file count exceeds the configured limit.', 'ARCHIVE_LIMIT', 413);
  const nodes = new Map(), explicitPaths = new Set(), entries = [];
  let position = end.centralOffset, extractedBytes = 0, compressedBytes = 0;
  for (let index = 0; index < end.entries; index++) {
    checkRange(position, 46, end.position);
    if (view.getUint32(position, true) !== signatures.central) invalid('ZIP central directory record is invalid.');
    const needed = view.getUint16(position + 6, true), flags = view.getUint16(position + 8, true), method = view.getUint16(position + 10, true);
    const crc = view.getUint32(position + 16, true), compressedSize = view.getUint32(position + 20, true), size = view.getUint32(position + 24, true);
    const nameLength = view.getUint16(position + 28, true), extraLength = view.getUint16(position + 30, true), commentLength = view.getUint16(position + 32, true);
    const disk = view.getUint16(position + 34, true), attributes = view.getUint32(position + 38, true), offset = view.getUint32(position + 42, true);
    if (needed > 20 || needed < 10 || disk || size === 0xffffffff || compressedSize === 0xffffffff || offset === 0xffffffff || ![0, 8].includes(method) || (flags & ~0x080e) || (method === 0 && (flags & 6))) {
      invalid('Encrypted, patched, ZIP64, or unsupported ZIP compression is not accepted.', 'ARCHIVE_UNSUPPORTED');
    }
    checkRange(position + 46, nameLength + extraLength + commentLength, end.position);
    const rawName = bytes.subarray(position + 46, position + 46 + nameLength);
    const path = readPath(rawName, flags, limits);
    const unixType = (attributes >>> 16) & 0xf000;
    if (![0, 0x4000, 0x8000].includes(unixType) || (unixType === 0x4000 && !path.directory) || (unixType === 0x8000 && path.directory) || ((attributes & 0x10) && !path.directory)) {
      invalid('Symlinks, special files, and conflicting directory attributes are not accepted.', 'ARCHIVE_SYMLINK');
    }
    if (path.directory && size !== 0) invalid('ZIP directory entries cannot contain file data.');
    if (size > limits.maxEntryBytes || (!compressedSize && size) || size > Math.max(1, compressedSize) * limits.maxCompressionRatio) {
      invalid('Archive entry exceeds the size or compression-ratio limit.', 'ARCHIVE_LIMIT', 413);
    }
    if (method === 0 && compressedSize !== size) invalid('Stored ZIP entry has inconsistent byte lengths.');
    extractedBytes += size; compressedBytes += compressedSize;
    if (extractedBytes > limits.maxExtractedBytes) invalid('Archive extracted size exceeds the configured limit.', 'ARCHIVE_LIMIT', 413);
    checkExtras(bytes, view, position + 46 + nameLength, extraLength);
    const entry = { ...path, flags, method, crc, compressedSize, size, offset };
    registerPath(entry, nodes, explicitPaths);

    checkRange(offset, 30, end.centralOffset);
    if (view.getUint32(offset, true) !== signatures.local || view.getUint16(offset + 4, true) !== needed || view.getUint16(offset + 6, true) !== flags || view.getUint16(offset + 8, true) !== method) {
      invalid('ZIP local and central headers disagree.');
    }
    const localCrc = view.getUint32(offset + 14, true), localCompressed = view.getUint32(offset + 18, true), localSize = view.getUint32(offset + 22, true);
    const localNameLength = view.getUint16(offset + 26, true), localExtraLength = view.getUint16(offset + 28, true);
    checkRange(offset + 30, localNameLength + localExtraLength, end.centralOffset);
    if (localNameLength !== nameLength || !rawName.every((value, i) => value === bytes[offset + 30 + i])) invalid('ZIP local filename differs from the manifest.', 'ARCHIVE_PATH');
    checkExtras(bytes, view, offset + 30 + localNameLength, localExtraLength);
    if (flags & 8) {
      if ((localCrc !== 0 && localCrc !== crc) || (localCompressed !== 0 && localCompressed !== compressedSize) || (localSize !== 0 && localSize !== size)) invalid('ZIP local streaming sizes disagree with the manifest.');
    } else if (localCrc !== crc || localCompressed !== compressedSize || localSize !== size) invalid('ZIP local sizes or CRC disagree with the manifest.');
    entry.dataOffset = offset + 30 + localNameLength + localExtraLength;
    checkRange(entry.dataOffset, compressedSize, end.centralOffset);
    entry.endOffset = entry.dataOffset + compressedSize;
    if (flags & 8) {
      checkRange(entry.endOffset, 12, end.centralOffset);
      const descriptorOffset = entry.endOffset + (view.getUint32(entry.endOffset, true) === signatures.descriptor ? 4 : 0);
      checkRange(descriptorOffset, 12, end.centralOffset);
      if (view.getUint32(descriptorOffset, true) !== crc || view.getUint32(descriptorOffset + 4, true) !== compressedSize || view.getUint32(descriptorOffset + 8, true) !== size) invalid('ZIP data descriptor disagrees with its manifest.');
      entry.endOffset = descriptorOffset + 12;
    }
    entries.push(entry);
    position += 46 + nameLength + extraLength + commentLength;
  }
  if (position !== end.position) invalid('ZIP contains undeclared central directory records.');
  let boundary = 0;
  for (const entry of [...entries].sort((a, b) => a.offset - b.offset)) {
    if (entry.offset !== boundary) invalid('ZIP contains overlapping, hidden, prefixed, or unreferenced local data.');
    boundary = entry.endOffset;
  }
  if (boundary !== end.centralOffset) invalid('ZIP contains unreferenced bytes before the central directory.');
  if (extractedBytes > Math.max(1, compressedBytes) * limits.maxCompressionRatio) invalid('Archive compression ratio exceeds the configured limit.', 'ARCHIVE_LIMIT', 413);
  if (!entries.some((entry) => entry.path === 'index.html' && !entry.directory && entry.size > 0)) invalid('A web game archive must contain a nonempty index.html at its root.', 'ARCHIVE_ENTRYPOINT');
  return { entries, extractedBytes };
}

const lengthBases = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const lengthBits = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const distanceBases = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const distanceBits = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
const codeOrder = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

function huffman(lengths, allowEmpty = false) {
  const counts = new Uint16Array(16), next = new Uint16Array(16);
  let max = 0, symbols = 0;
  for (const length of lengths) {
    if (length < 0 || length > 15) invalid('Invalid DEFLATE Huffman code length.');
    if (length) { counts[length]++; max = Math.max(max, length); symbols++; }
  }
  if (!max) {
    if (allowEmpty) return { table: new Uint16Array(), max: 0 };
    invalid('Empty DEFLATE Huffman tree.');
  }
  let remaining = 1, code = 0;
  for (let length = 1; length <= max; length++) {
    remaining = remaining * 2 - counts[length];
    if (remaining < 0) invalid('Oversubscribed DEFLATE Huffman tree.');
    code = (code + counts[length - 1]) << 1; next[length] = code;
  }
  if (remaining !== 0 && !(symbols === 1 && max === 1)) invalid('Incomplete DEFLATE Huffman tree.');
  const table = new Uint16Array(1 << max);
  for (let symbol = 0; symbol < lengths.length; symbol++) {
    const length = lengths[symbol]; if (!length) continue;
    let value = next[length]++, reversed = 0;
    for (let bit = 0; bit < length; bit++) { reversed = (reversed << 1) | (value & 1); value >>>= 1; }
    for (let index = reversed; index < table.length; index += 1 << length) table[index] = (symbol << 5) | length;
  }
  return { table, max };
}

const fixedLiteral = huffman(Array.from({ length: 288 }, (_, i) => i < 144 ? 8 : i < 256 ? 9 : i < 280 ? 7 : 8));
const fixedDistance = huffman(new Array(32).fill(5));

/** Validate exact DEFLATE boundaries independently of permissive inflater behavior. */
function inspectDeflate(data, declaredSize) {
  let position = 0, outputSize = 0, blocks = 0;
  const peek = (bits) => {
    const byte = position >>> 3;
    return ((data[byte] | (data[byte + 1] << 8) | (data[byte + 2] << 16)) >>> (position & 7)) & ((1 << bits) - 1);
  };
  const read = (bits) => {
    if (position + bits > data.length * 8) invalid('Truncated DEFLATE stream.');
    const value = peek(bits); position += bits; return value;
  };
  const symbol = (tree) => {
    const entry = tree.table[peek(tree.max)] || 0, length = entry & 31;
    if (!length) invalid('Invalid DEFLATE Huffman symbol.');
    read(length); return entry >>> 5;
  };
  const addOutput = (count) => {
    outputSize += count;
    if (outputSize > declaredSize) invalid('Deflated content exceeds its declared size.', 'ARCHIVE_LIMIT', 413);
  };
  let final;
  do {
    if (++blocks > 10000) invalid('Archive contains too many DEFLATE blocks.', 'ARCHIVE_LIMIT', 413);
    final = read(1); const type = read(2);
    if (type === 0) {
      position = Math.ceil(position / 8) * 8;
      const length = read(16), inverse = read(16);
      if ((length ^ inverse) !== 0xffff) invalid('DEFLATE stored block length check failed.');
      if (position + length * 8 > data.length * 8) invalid('Truncated DEFLATE stored block.');
      position += length * 8; addOutput(length); continue;
    }
    if (type === 3) invalid('Reserved DEFLATE block type.');
    let literals = fixedLiteral, distances = fixedDistance;
    if (type === 2) {
      const literalCount = read(5) + 257, distanceCount = read(5) + 1, codeCount = read(4) + 4;
      if (literalCount > 286) invalid('Invalid DEFLATE literal count.');
      const codeLengths = new Uint8Array(19);
      for (let i = 0; i < codeCount; i++) codeLengths[codeOrder[i]] = read(3);
      const codeTree = huffman(codeLengths), lengths = [];
      while (lengths.length < literalCount + distanceCount) {
        const value = symbol(codeTree);
        if (value <= 15) lengths.push(value);
        else {
          if (value === 16 && !lengths.length) invalid('DEFLATE repeats a missing code length.');
          const count = value === 16 ? read(2) + 3 : value === 17 ? read(3) + 3 : read(7) + 11;
          const repeated = value === 16 ? lengths[lengths.length - 1] : 0;
          if (lengths.length + count > literalCount + distanceCount) invalid('DEFLATE code-length repeat exceeds its tree.');
          for (let i = 0; i < count; i++) lengths.push(repeated);
        }
      }
      if (!lengths[256]) invalid('DEFLATE end-of-block symbol is missing.');
      literals = huffman(lengths.slice(0, literalCount));
      distances = huffman(lengths.slice(literalCount), true);
    }
    for (;;) {
      const value = symbol(literals);
      if (value < 256) { addOutput(1); continue; }
      if (value === 256) break;
      if (value > 285) invalid('Reserved DEFLATE length symbol.');
      const length = lengthBases[value - 257] + read(lengthBits[value - 257]);
      const distanceCode = symbol(distances);
      if (distanceCode > 29) invalid('Reserved DEFLATE distance symbol.');
      const distance = distanceBases[distanceCode] + read(distanceBits[distanceCode]);
      if (distance > outputSize) invalid('DEFLATE back-reference precedes its output.');
      addOutput(length);
    }
  } while (!final);
  if (Math.ceil(position / 8) !== data.length) invalid('DEFLATE stream contains trailing or hidden data.');
  if (outputSize !== declaredSize) invalid('DEFLATE output length differs from the ZIP manifest.');
}

function extractEntry(bytes, entry, limits) {
  const compressed = bytes.subarray(entry.dataOffset, entry.dataOffset + entry.compressedSize);
  let data;
  if (entry.method === 0) data = compressed.slice();
  else {
    inspectDeflate(compressed, entry.size);
    const chunks = []; let outputSize = 0, completed = false;
    const decoder = new Inflate((chunk, final) => {
      outputSize += chunk.length;
      if (outputSize > entry.size || outputSize > limits.maxEntryBytes || outputSize > Math.max(1, entry.compressedSize) * limits.maxCompressionRatio) {
        invalid('Deflated content exceeds its declared size or extraction budget.', 'ARCHIVE_LIMIT', 413);
      }
      if (chunk.length) chunks.push(chunk);
      completed = final;
    });
    try {
      // Limit each synchronous inflation step; never trust an advertised output
      // size or inflate a whole attacker-controlled stream before checking it.
      for (let offset = 0; offset < compressed.length; offset += 256) {
        const end = Math.min(offset + 256, compressed.length);
        decoder.push(compressed.subarray(offset, end), end === compressed.length);
      }
    } catch (error) {
      if (error instanceof HttpError) throw error;
      invalid('ZIP contains an invalid or truncated DEFLATE stream.');
    }
    if (!completed || outputSize !== entry.size) invalid('Decompressed entry size does not match the ZIP manifest.');
    data = new Uint8Array(outputSize); let offset = 0;
    for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.length; }
  }
  let crc = 0xffffffff;
  for (const byte of data) crc = crcTable[(crc ^ byte) & 255] ^ (crc >>> 8);
  if (((crc ^ 0xffffffff) >>> 0) !== entry.crc) invalid('Archive content fails its CRC integrity check.', 'ARCHIVE_INTEGRITY');
  return data;
}

const sha256 = async (bytes) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
  .map((byte) => byte.toString(16).padStart(2, '0')).join('');

/**
 * Validate and extract a web-game ZIP without executing any content.
 * `files` contains exact binary Uint8Arrays; manifest is safe to serialize.
 * The result never satisfies handleUploads' trusted-scanner `status: clean` gate.
 */
export async function validateGameArchive(input, options = {}) {
  const limits = limitsFor(options), supplied = sourceBytes(input);
  if (supplied.length < 22) invalid('ZIP is empty or truncated.');
  if (supplied.length > limits.maxArchiveBytes) invalid('Compressed archive exceeds the configured limit.', 'ARCHIVE_LIMIT', 413);
  const bytes = supplied.slice(); // freeze the checksum/extraction input before awaiting
  const { entries, extractedBytes } = inspectHeaders(bytes, limits);
  const files = new Map(), manifest = [];
  for (const entry of entries) {
    const data = extractEntry(bytes, entry, limits);
    if (entry.directory) continue;
    files.set(entry.path, data);
    manifest.push({ path: entry.path, size: data.byteLength, sha256: await sha256(data) });
  }
  return {
    status: 'structurally_valid', malwareScan: 'required', sha256: await sha256(bytes),
    sizeBytes: bytes.length, extractedBytes, entryPoint: 'index.html', manifest, files,
  };
}
