'use strict';
// The Incinerator: updates from GitHub Releases.
//
// Every release carries latest.json:
//   { "version": "0.2.1", "notes": "...", "shell": "44.9.3",
//     "app": { "file": "incinerator-app-0.2.1.pak", "size": 123, "sha256": "..." },
//     "installer": { "file": "The.Incinerator.Setup.exe", "size": 123, "sha256": "..." } }
//
// App updates (the code and art in resources/app) are a small .pak that is unpacked into AppData and
// used from the next start (boot.js picks it). When a release needs a different Electron shell, the full
// installer is downloaded instead and run silently on restart. Nothing is installed without a matching sha256.

const { app, net, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const crypto = require('crypto');
const zlib = require('zlib');
const { spawn } = require('child_process');

const REPO = 'paulem99/the-incinerator';
const VERSION = require('../package.json').version;
const SHELL = String(process.versions.electron || '').split('+')[0];

// Developer testing only: a release server on this computer.
const DEV_BASE = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/.*)?$/.test(process.env.INCIN_UPDATE_BASE || '') ? process.env.INCIN_UPDATE_BASE.replace(/\/$/, '') : null;
const manifestUrl = () => DEV_BASE ? `${DEV_BASE}/latest.json` : `https://github.com/${REPO}/releases/latest/download/latest.json`;
const FIRST_CHECK_MS = DEV_BASE ? 3e3 : 20e3, EVERY_MS = 6 * 3600e3;
const assetUrl = (ver, file) => DEV_BASE ? `${DEV_BASE}/${encodeURIComponent(file)}` : `https://github.com/${REPO}/releases/download/v${ver}/${encodeURIComponent(file)}`;

const updDir = () => path.join(app.getPath('userData'), 'updates');
const statePath = () => path.join(updDir(), 'state.json');
function readState() { try { return JSON.parse(fs.readFileSync(statePath(), 'utf8')); } catch { return {}; } }
function writeState(s) { fs.mkdirSync(updDir(), { recursive: true }); fs.writeFileSync(statePath(), JSON.stringify(s, null, 2)); }

const shellOf = (v) => String(v || '').split('+')[0];
const VER_RE = /^\d+\.\d+\.\d+$/, FILE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}$/, SHA_RE = /^[0-9a-f]{64}$/;
function cmp(a, b) {
  const pa = String(a).split('.').map(n => parseInt(n, 10) || 0), pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0) ? 1 : -1; }
  return 0;
}

let log = () => {}, send = () => {}, getSettings = () => ({}), onQuit = () => {};
let status = { state: 'idle', version: VERSION, latest: null, kind: null, progress: 0, notes: '', error: null };
let busy = false, installerPath = null, timer = null;

function set(patch) { status = { ...status, ...patch }; send('update:status', status); }

async function getJson(url) {
  const r = await net.fetch(url, { headers: { 'Cache-Control': 'no-cache' } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return JSON.parse(await r.text());
}

function validManifest(m) {
  if (!m || !VER_RE.test(m.version || '')) throw new Error('bad latest.json');
  for (const k of ['app', 'installer']) {
    const a = m[k]; if (!a) continue;
    if (!FILE_RE.test(a.file || '') || !SHA_RE.test(a.sha256 || '') || !(a.size > 0 && a.size < 600e6)) throw new Error(`bad ${k} entry in latest.json`);
  }
  if (!m.app && !m.installer) throw new Error('release has nothing to download');
  return m;
}

async function download(url, dest, size, sha256) {
  const r = await net.fetch(url);
  if (!r.ok) throw new Error(`download failed: HTTP ${r.status}`);
  const h = crypto.createHash('sha256'), fd = await fsp.open(dest, 'w');
  let got = 0, lastSend = 0;
  try {
    const reader = r.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      got += value.length;
      if (got > size) throw new Error('download is bigger than expected');
      h.update(value); await fd.write(value);
      const now = Date.now(); if (now - lastSend > 250) { lastSend = now; set({ progress: got / size }); }
    }
  } finally { await fd.close(); }
  if (got !== size) throw new Error('download was cut off');
  if (h.digest('hex') !== sha256) throw new Error('download is damaged (sha256 mismatch)');
  set({ progress: 1 });
}

// .pak = gzip( "INCPAK1\n" + uint32 header length + header JSON {version, files:[[path,size],...]} + file bytes )
function unpack(gz) {
  const buf = zlib.gunzipSync(gz);
  if (buf.subarray(0, 8).toString('latin1') !== 'INCPAK1\n') throw new Error('not an update pack');
  const hl = buf.readUInt32BE(8), head = JSON.parse(buf.subarray(12, 12 + hl).toString('utf8'));
  let off = 12 + hl;
  const out = [];
  for (const [p, n] of head.files) {
    const norm = path.posix.normalize(String(p));
    if (!norm || norm.startsWith('/') || norm.startsWith('..') || norm.includes('/../') || /[:\\]/.test(norm)) throw new Error('bad path in update pack');
    if (!(n >= 0) || off + n > buf.length) throw new Error('update pack is cut off');
    out.push([norm, buf.subarray(off, off + n)]); off += n;
  }
  if (off !== buf.length) throw new Error('update pack has extra bytes');
  return { version: head.version, files: out };
}

async function fetchApp(m) {
  const dir = updDir(), file = m.app.file, part = path.join(dir, file + '.part');
  const fin = path.join(dir, 'app-' + m.version), tmp = fin + '.tmp';
  const s0 = readState();
  if (s0.active === m.version && fs.existsSync(path.join(fin, 'src', 'main.js'))) { set({ state: 'ready', kind: 'app', latest: m.version, notes: m.notes || '', progress: 1 }); return; }
  await fsp.mkdir(dir, { recursive: true });
  set({ state: 'downloading', kind: 'app', latest: m.version, notes: m.notes || '', progress: 0 });
  log('update', `downloading app ${m.version} (${m.app.size} bytes)`);
  await download(assetUrl(m.version, file), part, m.app.size, m.app.sha256);
  const pak = unpack(await fsp.readFile(part));
  if (pak.version !== m.version) throw new Error('update pack is for a different version');
  await fsp.rm(tmp, { recursive: true, force: true });
  for (const [p, data] of pak.files) {
    const out = path.join(tmp, ...p.split('/'));
    if (!out.startsWith(tmp + path.sep)) throw new Error('bad path in update pack');
    await fsp.mkdir(path.dirname(out), { recursive: true });
    await fsp.writeFile(out, data);
  }
  const pkg = JSON.parse(await fsp.readFile(path.join(tmp, 'package.json'), 'utf8'));
  if (pkg.version !== m.version || !fs.existsSync(path.join(tmp, 'src', 'main.js'))) throw new Error('update pack is incomplete');
  if (pkg.incinerator && pkg.incinerator.shell && shellOf(pkg.incinerator.shell) !== SHELL) throw new Error('update needs a different Electron');
  await fsp.rm(fin, { recursive: true, force: true });
  await fsp.rename(tmp, fin);
  await fsp.rm(part, { force: true });
  const s = readState();
  // Keep the version running now as the fallback in case the new one won't start.
  s.prev = (global.__incinBoot && global.__incinBoot.fromUpdate) ? VERSION : null;
  s.active = m.version; s.tries = 0; s.bad = (s.bad || []).filter(v => v !== m.version);
  writeState(s);
  log('update', `app ${m.version} ready; it runs from the next start`);
  set({ state: 'ready', kind: 'app', progress: 1 });
}

async function fetchInstaller(m) {
  const dir = updDir(), file = m.installer.file, dest = path.join(dir, `setup-${m.version}.exe`), part = dest + '.part';
  await fsp.mkdir(dir, { recursive: true });
  set({ state: 'downloading', kind: 'installer', latest: m.version, notes: m.notes || '', progress: 0 });
  log('update', `downloading installer ${m.version} (${m.installer.size} bytes)`);
  await download(assetUrl(m.version, file), part, m.installer.size, m.installer.sha256);
  await fsp.rm(dest, { force: true });
  await fsp.rename(part, dest);
  installerPath = dest;
  log('update', `installer ${m.version} ready`);
  set({ state: 'ready', kind: 'installer', progress: 1 });
}

async function check(manual) {
  if (busy || status.state === 'ready') return;
  busy = true;
  set({ state: 'checking', error: null });
  try {
    const raw = await getJson(manifestUrl());
    if (!raw) { set({ state: 'current', latest: null }); log('update', 'no releases published yet'); return; }
    const m = validManifest(raw);
    if (cmp(m.version, VERSION) <= 0) { set({ state: 'current', latest: m.version }); if (manual) log('update', `up to date (${VERSION})`); return; }
    if ((readState().bad || []).includes(m.version)) { set({ state: 'current', latest: m.version }); log('update', `skipping ${m.version}: it failed to start before`); return; }
    const sameShell = !m.shell || shellOf(m.shell) === SHELL;
    if (m.app && sameShell) await fetchApp(m);
    else if (m.installer && process.platform === 'win32') await fetchInstaller(m);
    else throw new Error(`update ${m.version} needs the full installer`);
  } catch (e) {
    const msg = String((e && e.message) || e);
    log('update', 'check failed: ' + msg);
    set({ state: 'error', error: msg.slice(0, 200), progress: 0 });
  } finally { busy = false; }
}

function apply() {
  if (status.state !== 'ready') return;
  log('update', `restarting into ${status.latest} (${status.kind})`);
  if (status.kind === 'installer' && installerPath) {
    // The installer closes this app, updates it quietly and opens it again.
    const child = spawn(installerPath, ['/S'], { detached: true, stdio: 'ignore', windowsHide: true });
    child.on('error', (e) => { log('update', 'installer did not start: ' + e.message); installerPath = null; set({ state: 'error', error: 'installer did not start' }); });
    child.on('spawn', () => { child.unref(); onQuit(false); });
  } else onQuit(true);
}

// The player started fine on this version: reset the failed-start counter boot.js keeps.
function markGood() {
  try {
    const s = readState(), boot = global.__incinBoot || {};
    let changed = false;
    if (boot.fromUpdate && s.active === VERSION && s.tries) { s.tries = 0; changed = true; }
    if (!boot.fromUpdate && s.active && cmp(s.active, VERSION) <= 0) { s.active = null; s.tries = 0; changed = true; }
    if (changed) writeState(s);
  } catch {}
}

// Remove old update folders and leftover downloads (never the one running or the one queued).
async function cleanup() {
  try {
    const s = readState(), keep = new Set([s.active && 'app-' + s.active, s.prev && 'app-' + s.prev, 'app-' + VERSION, 'state.json']);
    for (const name of await fsp.readdir(updDir())) {
      if (keep.has(name)) continue;
      if (/^app-\d+\.\d+\.\d+(\.tmp)?$/.test(name) || /\.part$/.test(name) || /^setup-\d+\.\d+\.\d+\.exe$/.test(name)) {
        await fsp.rm(path.join(updDir(), name), { recursive: true, force: true }).catch(() => {});
      }
    }
  } catch {}
}

function init(opts) {
  ({ log, send, getSettings, onQuit } = opts);
  ipcMain.handle('update:get', () => status);
  ipcMain.on('update:check', () => { if (status.state !== 'ready') check(true); });
  ipcMain.on('update:apply', apply);
  const boot = global.__incinBoot || {};
  log('update', `running ${VERSION} from ${boot.fromUpdate ? 'update folder' : 'install folder'}; shell ${SHELL}${DEV_BASE ? '; dev server ' + DEV_BASE : ''}`);
  cleanup();
  // A downloaded app update that hasn't been started yet: say so right away.
  const s = readState();
  if (s.active && cmp(s.active, VERSION) > 0 && !(s.bad || []).includes(s.active)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(updDir(), 'app-' + s.active, 'package.json'), 'utf8'));
      const need = pkg.incinerator && pkg.incinerator.shell;
      if (pkg.version === s.active && (!need || shellOf(need) === SHELL)) status = { ...status, state: 'ready', kind: 'app', latest: s.active, progress: 1 };
    } catch {}
  }
  const auto = () => { if (getSettings().autoUpdate !== false) check(false); };
  setTimeout(auto, FIRST_CHECK_MS);
  timer = setInterval(auto, EVERY_MS);
}

module.exports = { init, check, apply, markGood, VERSION };
