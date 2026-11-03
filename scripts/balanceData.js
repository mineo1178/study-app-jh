/* global process, Buffer */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const manifestPath = 'docs/rpg-v2.9.13-data-manifest.json';
export const DATA_PATHS = ['docs/rpg-v2.9.13-comparison.json', 'docs/rpg-v2.9.13-summary.json', 'docs/rpg-v2.9.13-tower40-investigation.json'];
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
// gzip embeds the host OS at byte 9; normalize it for identical cross-OS archives.
export function canonicalGzip(raw) {
  const compressed = gzipSync(raw, { level: 9 });
  compressed[9] = 255;
  return compressed;
}
export const readBalanceData = path => JSON.parse(gunzipSync(readFileSync(path + '.gz')));
export function writeBalanceData(path, data) {
  const raw = Buffer.from(JSON.stringify(data));
  const compressed = canonicalGzip(raw);
  if (existsSync(manifestPath)) {
    const entry = JSON.parse(readFileSync(manifestPath)).files.find(f => f.path === path);
    assert(entry, 'unregistered balance data: ' + path);
    assert.equal(sha256(raw), entry.rawSha256, 'measurement results changed: ' + path);
  }
  writeFileSync(path + '.gz', compressed);
}
export function verifyBalanceData() {
  const manifest = JSON.parse(readFileSync(manifestPath));
  for (const entry of manifest.files) {
    const compressed = readFileSync(entry.path + '.gz');
    const raw = gunzipSync(compressed);
    assert.equal(sha256(compressed), entry.gzipSha256, entry.path + ' gzip SHA256');
    assert.equal(sha256(raw), entry.rawSha256, entry.path + ' raw SHA256');
    assert.equal(raw.length, entry.rawBytes);
    assert.equal(compressed.length, entry.gzipBytes);
    JSON.parse(raw);
  }
  return manifest;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--pack')) {
    const files = DATA_PATHS.map(path => {
      const raw = readFileSync(path), compressed = canonicalGzip(raw);
      writeFileSync(path + '.gz', compressed);
      return { path, rawBytes: raw.length, gzipBytes: compressed.length, rawSha256: sha256(raw), gzipSha256: sha256(compressed) };
    });
    writeFileSync(manifestPath, JSON.stringify({ originalCommit: 'e14d6d8bc2afd027f9b0aec602480cad413fd88b', encoding: 'UTF-8 JSON / gzip level 9, mtime 0, OS 255; raw SHA256 is platform-independent', files }, null, 2) + '\n');
  }
  const manifest = verifyBalanceData();
  console.log(JSON.stringify(manifest, null, 2));
}
