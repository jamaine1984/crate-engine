import { validateGameArchive } from './archive.mjs';
import { HttpError } from './common.mjs';

/**
 * Crate Ship's own build check for browser games. This is not a commercial
 * antivirus engine (Cloudflare's upload scanner is Enterprise-only). Instead it
 * relies on what a browser game can and cannot legitimately contain:
 *  - the archive must pass the bounded ZIP validator (paths, sizes, zip bombs);
 *  - native programs, installers, scripts for the operating system and nested
 *    archives are refused by extension AND by file signature;
 *  - known in-browser crypto-miner code is refused;
 *  - suspicious but possibly legitimate content becomes a warning for the owner.
 * Published games are then served from a separate, sandboxed origin and every
 * game is reviewed by the owner before it goes live.
 */
export const SCAN_VERSION = 'crateship-check-1';
export const WEB_BUILD_LIMITS = Object.freeze({
  maxArchiveBytes: 16 * 1024 * 1024, maxExtractedBytes: 48 * 1024 * 1024,
  maxEntryBytes: 16 * 1024 * 1024, maxFiles: 1000, maxCompressionRatio: 100,
});

const BLOCKED_EXTENSIONS = new Set(['exe', 'dll', 'msi', 'msix', 'appx', 'bat', 'cmd', 'com', 'scr', 'pif', 'cpl', 'msc',
  'ps1', 'psm1', 'vbs', 'vbe', 'jse', 'wsf', 'wsh', 'hta', 'lnk', 'reg', 'inf', 'sys', 'drv', 'ocx',
  'jar', 'class', 'apk', 'aab', 'ipa', 'app', 'dmg', 'pkg', 'deb', 'rpm', 'sh', 'bash', 'command', 'so', 'dylib',
  'iso', 'img', 'vhd', 'vhdx', 'zip', '7z', 'rar', 'tar', 'tgz', 'xz', 'bz2', 'cab',
  'php', 'phtml', 'asp', 'aspx', 'jsp', 'cgi', 'pl', 'py', 'rb', 'htaccess', 'docm', 'xlsm', 'pptm']);
const TEXT_EXTENSIONS = new Set(['html', 'htm', 'js', 'mjs', 'cjs', 'json', 'css', 'svg', 'wasm', 'txt', 'xml']);
// Lower-case markers of widely known in-browser mining kits and pools.
const MINER_MARKERS = ['coinhive', 'coin-hive', 'authedmine', 'cryptonight', 'crypto-loot', 'cryptoloot', 'webminepool',
  'webmine.pro', 'minero.cc', 'deepminer', 'coinimp', 'jsecoin', 'monerominer', 'stratum+tcp://', 'stratum+ssl://', 'nerohut', 'hashing.win'];
const PASSWORD_FIELD = /<input[^>]+type\s*=\s*["']?password/i;

function nativeSignature(data) {
  if (data.length < 4) return null;
  const [a, b, c, d] = data;
  if (a === 0x4d && b === 0x5a) return 'a Windows program';
  if (a === 0x7f && b === 0x45 && c === 0x4c && d === 0x46) return 'a Linux program';
  const word = ((a << 24) | (b << 16) | (c << 8) | d) >>> 0;
  if ([0xfeedface, 0xfeedfacf, 0xcefaedfe, 0xcffaedfe, 0xcafebabe].includes(word)) return 'a macOS or Java program';
  if (a === 0x50 && b === 0x4b && (c === 0x03 || c === 0x05) ) return 'another ZIP archive';
  if (a === 0x52 && b === 0x61 && c === 0x72 && d === 0x21) return 'a RAR archive';
  if (a === 0x37 && b === 0x7a && c === 0xbc && d === 0xaf) return 'a 7-Zip archive';
  return null;
}

// Latin-1 decoding keeps byte positions and never throws on binary content.
const latin1 = new TextDecoder('latin1');

export async function scanGameArchive(bytes, now = Date.now()) {
  let archive;
  try { archive = await validateGameArchive(bytes, WEB_BUILD_LIMITS); }
  catch (error) {
    if (error instanceof HttpError) return { status: 'rejected', errors: [error.message] };
    throw error;
  }
  const errors = [], warnings = [];
  for (const entry of archive.manifest) {
    const name = entry.path.split('/').pop(), extension = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
    const data = archive.files.get(entry.path);
    if (BLOCKED_EXTENSIONS.has(extension)) { errors.push(`${entry.path}: .${extension} files are not allowed in a browser game.`); continue; }
    const native = nativeSignature(data);
    if (native) { errors.push(`${entry.path}: this file is ${native}, which is not allowed in a browser game.`); continue; }
    if (TEXT_EXTENSIONS.has(extension) || !extension) {
      const text = latin1.decode(data).toLowerCase();
      const marker = MINER_MARKERS.find(m => text.includes(m));
      if (marker) errors.push(`${entry.path}: contains crypto-mining code (“${marker}”).`);
      if ((extension === 'html' || extension === 'htm') && PASSWORD_FIELD.test(text)) warnings.push(`${entry.path}: has a password field. Games should never ask players for passwords.`);
    }
  }
  if (errors.length) return { status: 'rejected', errors: errors.slice(0, 20), sha256: archive.sha256 };
  return {
    status: 'clean', sha256: archive.sha256, sizeBytes: archive.sizeBytes,
    reference: `${SCAN_VERSION}:${archive.sha256.slice(0, 16)}:${Math.floor(now / 1000)}`,
    manifest: archive.manifest, warnings: warnings.slice(0, 20),
  };
}
