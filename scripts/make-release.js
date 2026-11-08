#!/usr/bin/env node
'use strict';
// Gets a release ready in out/release-<version>/ without publishing anything:
//   incinerator-app-<version>.pak   the small app update most players download
//   The.Incinerator.Setup.exe       the full installer (for new installs and Electron changes)
//   latest.json                     what the updater reads
//   notes.txt                       release notes
//
//   node scripts/make-release.js --notes "what changed" [--no-installer]
// The installer is taken from out/The Incinerator Setup.exe (build it first with scripts/build-installer.sh).
// Publishing is a separate step (scripts/publish.sh), and only happens after the owner says yes.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const notes = opt('--notes') || '';
const withInstaller = !args.includes('--no-installer');

const dir = path.join(ROOT, 'out', `release-${pkg.version}`);
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });

const pak = JSON.parse(execFileSync(process.execPath, [path.join(__dirname, 'pack-app.js'), path.join(dir, `incinerator-app-${pkg.version}.pak`)], { encoding: 'utf8' }));
const manifest = {
  version: pkg.version,
  date: new Date().toISOString(),
  notes,
  shell: pkg.incinerator.shell,
  app: { file: pak.file, size: pak.size, sha256: pak.sha256 }
};

if (withInstaller) {
  const src = path.join(ROOT, 'out', 'The Incinerator Setup.exe');
  if (!fs.existsSync(src)) throw new Error('out/The Incinerator Setup.exe is missing: run scripts/build-installer.sh first (or pass --no-installer)');
  const file = 'The.Incinerator.Setup.exe', dest = path.join(dir, file);
  fs.copyFileSync(src, dest);
  const buf = fs.readFileSync(dest);
  manifest.installer = { file, size: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex') };
}

fs.writeFileSync(path.join(dir, 'latest.json'), JSON.stringify(manifest, null, 2) + '\n');
fs.writeFileSync(path.join(dir, 'notes.txt'), (notes || `The Incinerator ${pkg.version}`) + '\n\nInstall: download The.Incinerator.Setup.exe below and run it. Already installed? The app updates itself.\n');
console.log(`release ${pkg.version} ready in ${path.relative(ROOT, dir)}/ (not published)`);
for (const f of fs.readdirSync(dir)) console.log(`  ${f}  ${fs.statSync(path.join(dir, f)).size} bytes`);
