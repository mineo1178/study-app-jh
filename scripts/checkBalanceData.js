import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { verifyBalanceData, readBalanceData, writeBalanceData, sha256, canonicalGzip } from './balanceData.js';
const manifest = verifyBalanceData();
for (const entry of manifest.files) {
  const archived = readFileSync(entry.path + '.gz');
  assert.equal(archived[9],255,'canonical gzip OS');
  assert.equal(archived.readUInt32LE(4),0,'no variable gzip timestamp');
  assert.equal(sha256(canonicalGzip(gunzipSync(archived))),entry.gzipSha256,'deterministic repack');
}
const original = {
  'docs/rpg-v2.9.13-comparison.json': ['20deffe0342ee5ddf8fad7c477a3e16f6b1e8885911098493034101035f99cd0',13587788],
  'docs/rpg-v2.9.13-summary.json': ['bc4403aa5862204e326e0190badd61cdade2ad7be091b55576625cacae1904df',2316270],
};
for (const [path,[digest,size]] of Object.entries(original)) {
  const raw = gunzipSync(readFileSync(path + '.gz'));
  assert.equal(sha256(raw),digest,'must match original e14d6d8 bytes');
  assert.equal(raw.length,size);
  const entry = manifest.files.find(f=>f.path===path);
  assert.equal(entry.rawSha256,digest);
}
const report = readBalanceData('docs/rpg-v2.9.13-comparison.json');
assert.equal(report.rows.length,31536);
assert.deepEqual(Object.keys(report.candidates),['before','light','medium','strong']);
assert.equal(report.verifiedImplementation,true);
const summary = readBalanceData('docs/rpg-v2.9.13-summary.json');
assert.equal(summary.summary.length,768);
report.rows[0].level++;
assert.throws(()=>writeBalanceData('docs/rpg-v2.9.13-comparison.json',report),/measurement results changed/);
assert.throws(()=>gunzipSync(readFileSync('docs/rpg-v2.9.13-comparison.json.gz').subarray(0,40)));
verifyBalanceData(); // Rejected writes must leave the archive unchanged.
console.log('Balance archive integrity / original hashes / row counts / mutation rejection / truncation checks PASS');
