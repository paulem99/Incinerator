#!/usr/bin/env node
'use strict';
// Packs the app (what lives in resources/app) into an update .pak that src/updater.js can unpack.
//   node scripts/pack-app.js [out.pak]
// Format: gzip( "INCPAK1\n" + uint32 BE header length + header JSON {version, files:[[path, size], ...]} + file bytes )

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const out = process.argv[2] || path.join(ROOT, 'out', `incinerator-app-${pkg.version}.pak`);
const INCLUDE = ['package.json', 'boot.js', 'src', 'assets', 'node_modules'];
const SKIP = (rel) => /(^|\/)\.package-lock\.json$/.test(rel) || /(^|\/)\.bin(\/|$)/.test(rel);

function walk(rel, list) {
  const abs = path.join(ROOT, rel), st = fs.statSync(abs);
  if (st.isDirectory()) { for (const name of fs.readdirSync(abs).sort()) walk(rel + '/' + name, list); }
  else if (st.isFile() && !SKIP(rel)) list.push(rel);
}

const files = [];
for (const top of INCLUDE) { if (!fs.existsSync(path.join(ROOT, top))) throw new Error(`missing ${top} (run npm ci first?)`); walk(top, files); }
if (!files.includes('node_modules/music-metadata/package.json')) throw new Error('node_modules looks incomplete: run npm ci');

const bodies = files.map(f => fs.readFileSync(path.join(ROOT, f)));
const head = Buffer.from(JSON.stringify({ version: pkg.version, files: files.map((f, i) => [f, bodies[i].length]) }), 'utf8');
const len = Buffer.alloc(4); len.writeUInt32BE(head.length);
const gz = zlib.gzipSync(Buffer.concat([Buffer.from('INCPAK1\n', 'latin1'), len, head, ...bodies]), { level: 9 });
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, gz);
const sha256 = crypto.createHash('sha256').update(gz).digest('hex');
console.log(JSON.stringify({ file: path.basename(out), path: out, size: gz.length, sha256, files: files.length, version: pkg.version }));
