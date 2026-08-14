// Downloads the latest stable Go toolchain for windows-amd64 into .tools/.
// Uses Node's OpenSSL HTTPS stack because schannel TLS is unavailable in this shell.
// Usage: node scripts/fetch-go.cjs
'use strict';
const https = require('https');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const TOOLS = path.join(ROOT, '.tools');

function get(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'light-kanban-setup' } }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return resolve(get(res.headers.location));
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      })
      .on('error', reject);
  });
}

(async () => {
  const meta = JSON.parse((await get('https://go.dev/dl/?mode=json')).toString());
  const stable = meta.find((v) => v.stable && !/rc|beta/.test(v.version));
  if (!stable) throw new Error('no stable Go release found');
  const version = stable.version;
  const zipUrl = `https://go.dev/dl/${version}.windows-amd64.zip`;
  console.log(`downloading ${zipUrl}`);
  const zip = await get(zipUrl);
  fs.mkdirSync(TOOLS, { recursive: true });
  const zipPath = path.join(TOOLS, 'go.zip');
  fs.writeFileSync(zipPath, zip);
  console.log(`saved ${zip.length} bytes to ${zipPath}`);
  execFileSync('tar', ['-xf', zipPath, '-C', TOOLS], { stdio: 'inherit' });
  fs.unlinkSync(zipPath);
  const goBin = path.join(TOOLS, 'go', 'bin', 'go.exe');
  execFileSync(goBin, ['version'], { stdio: 'inherit' });
  console.log(`GOROOT=${path.join(TOOLS, 'go')}`);
})().catch((e) => {
  console.error(`FAIL: ${e.message}`);
  process.exit(1);
});
