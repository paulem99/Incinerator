#!/usr/bin/env node
'use strict';
// Gets a version ready to ship, without publishing anything:
//   updates/incinerator-app-<version>.pak   the app update (code + art), ~330 KB
//   updates/latest.json                     what installed copies read (raw.githubusercontent.com/<repo>/main/updates/)
// Older .pak files in updates/ are removed. Players get it once updates/ is pushed (scripts/publish.sh), and the
// app asks them before installing.
//
//   node scripts/make-release.js --notes "what changed"
//   node scripts/make-release.js --notes "..." --full
// --full also puts out/release-<version>/ together (installer + latest.json) for a GitHub Release the owner
// uploads by hand. That's only needed when the Electron shell changes (incinerator.shell in package.json).

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const notes = opt('--notes') || '';
const full = args.includes('--full');

const UPD = path.join(ROOT, 'updates');
fs.mkdirSync(UPD, { recursive: true });
const pakName = `incinerator-app-${pkg.version}.pak`;
for (const f of fs.readdirSync(UPD)) if (/^incinerator-app-.*\.pak$/.test(f) && f !== pakName) fs.rmSync(path.join(UPD, f));
const pak = JSON.parse(execFileSync(process.execPath, [path.join(__dirname, 'pack-app.js'), path.join(UPD, pakName)], { encoding: 'utf8' }));
const manifest = {
  version: pkg.version,
  date: new Date().toISOString(),
  notes,
  shell: pkg.incinerator.shell,
  app: { file: pak.file, size: pak.size, sha256: pak.sha256 }
};
fs.writeFileSync(path.join(UPD, 'latest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`${pkg.version} ready in updates/ (not published): ${pak.file} ${pak.size} bytes`);

if (full) {
  const src = path.join(ROOT, 'out', 'Incinerator Setup.exe');
  if (!fs.existsSync(src)) throw new Error('out/Incinerator Setup.exe is missing: run scripts/build-installer.sh first');
  const dir = path.join(ROOT, 'out', `release-${pkg.version}`);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const file = 'Incinerator.Setup.exe', buf = fs.readFileSync(src);
  fs.writeFileSync(path.join(dir, file), buf);
  fs.copyFileSync(path.join(UPD, pakName), path.join(dir, pakName));
  const rel = { ...manifest, installer: { file, size: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex') } };
  fs.writeFileSync(path.join(dir, 'latest.json'), JSON.stringify(rel, null, 2) + '\n');
  console.log(`GitHub Release files for the owner to upload by hand: ${path.relative(ROOT, dir)}/`);
}
