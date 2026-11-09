'use strict';
// Incinerator: main process.
// Two windows: the pixel player you see, and a hidden Apple Music web player it drives.

const { app, BrowserWindow, components, ipcMain, dialog, protocol, net, session, screen, shell, desktopCapturer, nativeImage, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const fsp = require('fs/promises');
const { Readable } = require('stream');
const { execFile } = require('child_process');
const signing = require('./signing');
const updater = require('./updater');
const webplayer = require('./webplayer');
const VERSION = updater.VERSION;

const APP_NAME = 'Incinerator';
// The app used to be called "The Incinerator". Its AppData folder, exe and install folder keep that name so
// settings, the Apple Music sign-in and the castLabs signature carry over.
const OLD_NAME = 'The Incinerator';
const BASE_W = 300, BASE_H = 268;
const AM_URL = 'https://music.apple.com/';
const AM_PARTITION = 'persist:applemusic';
const AUDIO_EXT = new Set(['.mp3', '.m4a', '.aac', '.flac', '.wav', '.ogg', '.opus']);
const MIME = { '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.flac': 'audio/flac', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.opus': 'audio/ogg' };

app.setName(APP_NAME);
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// Apple Music turns away browsers that announce themselves as Electron, so look like plain Chrome.
const CHROME_UA = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`;
app.userAgentFallback = CHROME_UA;

protocol.registerSchemesAsPrivileged([
  { scheme: 'incin', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, corsEnabled: true } }
]);

const single = app.requestSingleInstanceLock();
if (!single) { app.quit(); }

let playerWin = null, amWin = null, quitting = false, amShownForSignIn = false;
const ICON = path.join(__dirname, '..', 'assets', 'icon.png');

// ---------- settings ----------
const settingsPath = () => path.join(app.getPath('userData'), 'settings.json');
const DEFAULTS = { vol: 60, folder: null, scale: null, x: null, y: null, fps: 60, crunch: 70, static: 70, intro: true, tab: 'SONGS', mode: 'art', signSkipped: false, cfgVersion: 2, fxVolume: 35, autoUpdate: true, lastVersion: null };
let settings = { ...DEFAULTS };
function loadSettings() {
  let file = null;
  try { file = JSON.parse(fs.readFileSync(settingsPath(), 'utf8')); } catch { file = null; }
  settings = { ...DEFAULTS, ...(file || {}) };
  // v0.1.1: run at 60 fps with crunch and static at 70 (replaces the old 5 fps / 60 static values).
  if (file && !(file.cfgVersion >= 2)) { settings.fps = 60; settings.crunch = 70; settings.static = 70; settings.cfgVersion = 2; saveSettings(); }
}
let saveTimer = null;
function saveSettings() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { fs.mkdirSync(app.getPath('userData'), { recursive: true }); fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2)); } catch (e) { console.error('settings save failed', e); }
  }, 300);
}

// ---------- local music library ----------
const libPath = () => path.join(app.getPath('userData'), 'local-library.json');
let localLib = { folder: null, files: [] };
let allowedFiles = new Set();
let mm = null;
async function musicMetadata() { if (!mm) mm = await import('music-metadata'); return mm; }

function loadLocalCache() {
  try { localLib = JSON.parse(fs.readFileSync(libPath(), 'utf8')); } catch { localLib = { folder: null, files: [] }; }
  if (localLib.folder !== settings.folder) localLib = { folder: settings.folder, files: [] };
  allowedFiles = new Set(localLib.files.map(f => f.path));
}

async function walk(dir, out) {
  let ents;
  try { ents = await fsp.readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!e.name.startsWith('.')) await walk(p, out); }
    else if (e.isFile() && AUDIO_EXT.has(path.extname(e.name).toLowerCase())) out.push(p);
  }
}

let scanning = false;
async function scanFolder() {
  const folder = settings.folder;
  if (!folder || scanning) return;
  scanning = true;
  try {
    const { parseFile } = await musicMetadata();
    const paths = [];
    await walk(folder, paths);
    const prev = new Map(localLib.files.map(f => [f.path, f]));
    const files = [];
    let n = 0;
    for (const p of paths) {
      n++;
      let st;
      try { st = await fsp.stat(p); } catch { continue; }
      const old = prev.get(p);
      if (old && old.mtimeMs === st.mtimeMs && old.size === st.size) { files.push(old); continue; }
      const base = path.basename(p, path.extname(p));
      const rec = { path: p, mtimeMs: st.mtimeMs, size: st.size, added: Math.min(st.birthtimeMs || st.mtimeMs, st.mtimeMs) || st.mtimeMs, title: base, artist: 'UNKNOWN ARTIST', album: 'UNKNOWN ALBUM', year: '', duration: 0, track: 0, disc: 0 };
      try {
        const meta = await parseFile(p, { skipCovers: true, duration: false });
        const c = meta.common || {};
        rec.title = c.title || base;
        rec.artist = c.artist || c.albumartist || rec.artist;
        rec.album = c.album || rec.album;
        rec.year = c.year ? String(c.year) : '';
        rec.track = (c.track && c.track.no) || 0;
        rec.disc = (c.disk && c.disk.no) || 0;
        rec.duration = (meta.format && meta.format.duration) || 0;
      } catch { /* unreadable tags: keep file name */ }
      files.push(rec);
      if (n % 25 === 0) send('local:progress', { done: n, total: paths.length });
    }
    localLib = { folder, files };
    allowedFiles = new Set(files.map(f => f.path));
    try { await fsp.writeFile(libPath(), JSON.stringify(localLib)); } catch {}
    send('local:library', localLib);
  } catch (e) {
    log('local', 'scan failed: ' + String(e && e.message || e));
    send('local:error', String(e && e.message || e));
  } finally { scanning = false; }
}

function parseRange(h, size) {
  const m = /bytes=(\d*)-(\d*)/.exec(h || '');
  if (!m) return null;
  let start = m[1] === '' ? null : parseInt(m[1], 10), end = m[2] === '' ? null : parseInt(m[2], 10);
  if (start === null) { start = Math.max(0, size - end); end = size - 1; }
  if (end === null || end >= size) end = size - 1;
  if (start > end || start >= size) return null;
  return { start, end };
}

function registerProtocol() {
  protocol.handle('incin', async (req) => {
    const u = new URL(req.url);
    if (u.host !== 'file') return new Response('not found', { status: 404 });
    const p = u.searchParams.get('p');
    if (!p || !allowedFiles.has(p)) return new Response('forbidden', { status: 403 });
    let st;
    try { st = await fsp.stat(p); } catch { return new Response('missing', { status: 404 }); }
    const type = MIME[path.extname(p).toLowerCase()] || 'application/octet-stream';
    const r = parseRange(req.headers.get('range'), st.size);
    if (r) {
      const stream = Readable.toWeb(fs.createReadStream(p, { start: r.start, end: r.end }));
      return new Response(stream, { status: 206, headers: { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${r.start}-${r.end}/${st.size}`, 'Content-Length': String(r.end - r.start + 1) } });
    }
    return new Response(Readable.toWeb(fs.createReadStream(p)), { status: 200, headers: { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Length': String(st.size) } });
  });
}

// ---------- helpers ----------
function send(ch, payload) { if (playerWin && !playerWin.isDestroyed()) playerWin.webContents.send(ch, payload); }

// Plain-text log so problems on the user's PC can be diagnosed (Ctrl+Shift+L in the player opens it).
const logPath = () => path.join(app.getPath('userData'), 'log.txt');
function log(tag, msg) {
  try {
    const p = logPath();
    try { if (fs.statSync(p).size > 1e6) fs.renameSync(p, p + '.old'); } catch {}
    fs.appendFileSync(p, `${new Date().toISOString()} [${tag}] ${msg}\n`);
  } catch {}
}

const playerSize = () => { const s = settings.scale || 2; return [BASE_W * s, BASE_H * s]; };
let sizeFix = null;
function lockSize() {
  if (!playerWin || playerWin.isDestroyed()) return;
  const [w, h] = playerSize(), [cw, ch] = playerWin.getContentSize();
  if (cw !== w || ch !== h) playerWin.setContentSize(w, h);
}

function pickScale() {
  const wa = screen.getPrimaryDisplay().workAreaSize;
  let s = Math.floor(Math.min((wa.width * 0.92) / BASE_W, (wa.height * 0.92) / BASE_H));
  return Math.max(1, Math.min(s, 6));
}

// ---------- windows ----------
function createPlayer() {
  const scale = settings.scale || pickScale();
  settings.scale = scale;
  const opts = {
    width: BASE_W * scale, height: BASE_H * scale, useContentSize: true,
    frame: false, resizable: false, maximizable: false, fullscreenable: false,
    backgroundColor: '#000000', title: APP_NAME, show: false,
    icon: fs.existsSync(ICON) ? nativeImage.createFromPath(ICON) : undefined,
    webPreferences: { preload: path.join(__dirname, 'preload-player.js'), contextIsolation: true, sandbox: true, backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required' }
  };
  if (Number.isFinite(settings.x) && Number.isFinite(settings.y)) {
    const onScreen = screen.getAllDisplays().some(d => settings.x >= d.workArea.x - 50 && settings.y >= d.workArea.y - 50 && settings.x < d.workArea.x + d.workArea.width - 100 && settings.y < d.workArea.y + d.workArea.height - 100);
    if (onScreen) { opts.x = settings.x; opts.y = settings.y; }
  }
  playerWin = new BrowserWindow(opts);
  playerWin.loadFile(path.join(__dirname, 'player', 'index.html'));
  playerWin.once('ready-to-show', () => playerWin.show());
  // The player loaded: tell the updater this version starts fine.
  playerWin.webContents.once('did-finish-load', () => setTimeout(() => updater.markGood(), 3000));
  playerWin.on('moved', () => { const [x, y] = playerWin.getPosition(); settings.x = x; settings.y = y; saveSettings(); });
  playerWin.on('resize', () => { clearTimeout(sizeFix); sizeFix = setTimeout(lockSize, 150); });
  playerWin.webContents.on('console-message', (e) => { const lvl = e.level; if (lvl === 'warning' || lvl === 'error' || lvl === 2 || lvl === 3) log('player-console', String(e.message).slice(0, 500)); });
  playerWin.on('closed', () => { playerWin = null; quitting = true; app.quit(); });

  // System audio capture for the visualizer (Apple Music's protected audio can't be read directly).
  playerWin.webContents.session.setDisplayMediaRequestHandler((_req, cb) => {
    desktopCapturer.getSources({ types: ['screen'] }).then(src => cb({ video: src[0], audio: 'loopback' })).catch(() => cb({}));
  });
}

// Apple's own sites (sign-in runs on idmsa.apple.com / authorize.music.apple.com, art on mzstatic.com).
const APPLE_URL = /^https:\/\/([a-z0-9-]+\.)*(apple\.com|icloud\.com|mzstatic\.com|apple-cloudkit\.com|cdn-apple\.com)([\/?#:]|$)/i;
const BLANK_URL = (u) => !u || u === 'about:blank';
const short = (u) => String(u || '').split(/[?#]/)[0].slice(0, 120);   // logs never get query strings (tokens)
const AM_PERMS = ['mediaKeySystem', 'media', 'notifications', 'clipboard-sanitized-write', 'fullscreen', 'storage-access', 'top-level-storage-access'];

// Popups Apple opens for sign-in. MusicKit opens a blank window first and points it at Apple afterwards, so blank
// popups are allowed; anything that then tries to leave Apple's sites opens in the normal browser instead.
function applePopupHandler(ses) {
  return ({ url }) => {
    if (BLANK_URL(url) || APPLE_URL.test(url)) {
      log('apple', 'popup allowed: ' + (short(url) || 'about:blank'));
      return { action: 'allow', overrideBrowserWindowOptions: { width: 520, height: 720, autoHideMenuBar: true, title: `${APP_NAME}: Apple sign-in`, webPreferences: { session: ses, contextIsolation: true, sandbox: true } } };
    }
    log('apple', 'popup sent to browser: ' + short(url));
    shell.openExternal(url);
    return { action: 'deny' };
  };
}
function guardApplePopup(win, ses) {
  const wc = win.webContents;
  wc.setUserAgent(CHROME_UA);
  wc.setWindowOpenHandler(applePopupHandler(ses));
  wc.on('did-create-window', (child) => guardApplePopup(child, ses));
  wc.on('will-navigate', (e, url) => { if (!BLANK_URL(url) && !APPLE_URL.test(url)) { e.preventDefault(); log('apple', 'popup left Apple, opened in browser: ' + short(url)); shell.openExternal(url); } });
  wc.on('did-navigate', (_e, url) => log('apple', 'popup at ' + short(url)));
  wc.on('did-fail-load', (_e, code, desc, url, isMain) => { if (isMain) log('apple', `popup load failed: ${desc} (${code}) ${short(url)}`); });
  wc.on('console-message', (e) => { const l = e.level; if (l === 'error' || l === 3) log('apple-popup', String(e.message).slice(0, 300)); });
  win.on('closed', () => log('apple', 'popup closed'));
}

let amConsoleLines = 0;
function createAppleMusic() {
  const ses = session.fromPartition(AM_PARTITION);
  ses.setUserAgent(CHROME_UA);
  ses.setPermissionRequestHandler((_wc, perm, cb) => { const ok = AM_PERMS.includes(perm); if (!ok) log('apple', 'permission refused: ' + perm); cb(ok); });
  amWin = new BrowserWindow({
    width: 1100, height: 760, show: false, title: `${APP_NAME}: Apple Music sign-in`, autoHideMenuBar: true,
    icon: fs.existsSync(ICON) ? nativeImage.createFromPath(ICON) : undefined,
    webPreferences: { preload: path.join(__dirname, 'preload-am.js'), contextIsolation: true, sandbox: true, session: ses, backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required' }
  });
  amWin.webContents.setUserAgent(CHROME_UA);
  amWin.webContents.setWindowOpenHandler(applePopupHandler(ses));
  amWin.webContents.on('did-create-window', (child) => guardApplePopup(child, ses));
  // Apple Music's own errors go to the log (capped), so a failed sign-in can be diagnosed.
  amWin.webContents.on('console-message', (e) => { const l = e.level; if ((l === 'error' || l === 3) && amConsoleLines++ < 150) log('apple-console', String(e.message).slice(0, 300)); });
  const hook = fs.readFileSync(path.join(__dirname, 'am-hook.js'), 'utf8');
  const inject = () => { if (amWin && !amWin.isDestroyed()) amWin.webContents.executeJavaScript(hook, true).catch(e => send('am:evt', { type: 'error', where: 'inject', message: String(e) })); };
  amWin.webContents.on('did-finish-load', inject);
  amWin.webContents.on('did-navigate-in-page', inject);
  amWin.webContents.on('did-fail-load', (_e, code, desc, url, isMain) => { if (isMain) log('apple', `load failed: ${desc} (${code}) ${url}`); if (isMain) send('am:evt', { type: 'error', where: 'load', message: `${desc} (${code})` }); });
  amWin.on('close', (e) => { if (!quitting) { e.preventDefault(); amWin.hide(); amShownForSignIn = false; } });
  amWin.loadURL(AM_URL);
}

// ---------- IPC ----------
function wireIpc() {
  ipcMain.on('am:cmd', (_e, msg) => { if (msg && msg.type !== 'volume' && msg.type !== 'state') log('cmd', JSON.stringify(msg).slice(0, 200)); if (amWin && !amWin.isDestroyed()) amWin.webContents.send('am:cmd', msg); else log('cmd', 'Apple Music window not created'); });
  ipcMain.on('am:evt', (_e, msg) => {
    if (msg && msg.type !== 'state' && msg.type !== 'progress') log('apple', msg.type === 'library' ? `library: ${(msg.songs || []).length} songs, ${(msg.recent || []).length} recent` : JSON.stringify(msg).slice(0, 400));
    if (msg && msg.type === 'auth' && msg.authorized && amShownForSignIn && amWin) {
      setTimeout(() => { if (amWin && !amWin.isDestroyed()) amWin.hide(); amShownForSignIn = false; }, 1500);
    }
    send('am:evt', msg);
  });
  ipcMain.on('am:show', (_e, opts) => {
    if (!amWin || amWin.isDestroyed()) return;
    amShownForSignIn = !!(opts && opts.signIn);
    amWin.show(); amWin.focus();
    if (amShownForSignIn) startAppleSignIn();
  });
  ipcMain.on('am:reload', () => { if (amWin && !amWin.isDestroyed()) amWin.loadURL(AM_URL); });

  const artCache = new Map();
  ipcMain.handle('art:fetch', async (_e, url) => {
    if (!url || !/^https:\/\//.test(url)) return null;
    if (artCache.has(url)) return artCache.get(url);
    try {
      const r = await net.fetch(url, { session: session.fromPartition(AM_PARTITION) });
      if (!r.ok) return null;
      const buf = Buffer.from(await r.arrayBuffer());
      const data = `data:${r.headers.get('content-type') || 'image/jpeg'};base64,${buf.toString('base64')}`;
      if (artCache.size > 300) artCache.delete(artCache.keys().next().value);
      artCache.set(url, data);
      return data;
    } catch { return null; }
  });
  ipcMain.handle('local:art', async (_e, p) => {
    if (!allowedFiles.has(p)) return null;
    try {
      const { parseFile, selectCover } = await musicMetadata();
      const meta = await parseFile(p, { duration: false });
      const pic = selectCover ? selectCover(meta.common.picture) : (meta.common.picture || [])[0];
      if (!pic) return null;
      return `data:${pic.format || 'image/jpeg'};base64,${Buffer.from(pic.data).toString('base64')}`;
    } catch { return null; }
  });
  ipcMain.handle('local:get', () => { setTimeout(scanFolder, 500); return localLib; });
  ipcMain.handle('local:pick', async () => {
    const r = await dialog.showOpenDialog(playerWin, { title: 'Pick your music folder', properties: ['openDirectory'] });
    if (r.canceled || !r.filePaths[0]) return null;
    settings.folder = r.filePaths[0]; saveSettings();
    localLib = { folder: settings.folder, files: [] }; allowedFiles = new Set();
    scanFolder();
    return settings.folder;
  });
  ipcMain.handle('settings:get', () => settings);
  ipcMain.on('settings:set', (_e, patch) => { if (patch && typeof patch === 'object') { Object.assign(settings, patch); saveSettings(); } });

  ipcMain.on('win:minimize', () => playerWin && playerWin.minimize());
  ipcMain.on('win:close', () => { quitting = true; app.quit(); });
  // Custom drag. Always set the full bounds with the fixed size: moving with setPosition on a scaled
  // Windows display (125%, 150%) rounds the size each step and the window slowly grows.
  let dragTimer = null;
  ipcMain.on('win:drag-start', (_e, off) => {
    clearInterval(dragTimer);
    if (!playerWin) return;
    const [w, h] = playerSize();
    dragTimer = setInterval(() => {
      if (!playerWin) return clearInterval(dragTimer);
      const c = screen.getCursorScreenPoint();
      playerWin.setContentBounds({ x: Math.round(c.x - off.x), y: Math.round(c.y - off.y), width: w, height: h });
    }, 12);
  });
  ipcMain.on('win:drag-end', () => { clearInterval(dragTimer); dragTimer = null; lockSize(); });
  ipcMain.on('am:show-window', () => { if (amWin && !amWin.isDestroyed()) { amWin.show(); amWin.focus(); } });
  ipcMain.on('log:open', () => { shell.openPath(logPath()); });
  ipcMain.on('log:write', (_e, line) => log('player', line));
  ipcMain.on('win:scale', (_e, dir) => {
    if (!playerWin) return;
    const max = Math.max(1, Math.floor(Math.min(screen.getPrimaryDisplay().workAreaSize.width / BASE_W, screen.getPrimaryDisplay().workAreaSize.height / BASE_H)));
    settings.scale = Math.max(1, Math.min(max, (settings.scale || 2) + (dir > 0 ? 1 : -1)));
    playerWin.setContentSize(BASE_W * settings.scale, BASE_H * settings.scale);
    saveSettings();
  });
}

// v0.2.2 rename: turn the old "The Incinerator" shortcuts and the Apps & features entry into "Incinerator". Runs once.
function renameShortcuts() {
  if (process.platform !== 'win32' || settings.renamedTo === APP_NAME) return;
  const me = path.resolve(process.execPath).toLowerCase();
  const dirs = [app.getPath('desktop'), path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs')];
  for (const d of dirs) {
    const oldLnk = path.join(d, OLD_NAME + '.lnk'), newLnk = path.join(d, APP_NAME + '.lnk');
    try {
      if (!fs.existsSync(oldLnk)) continue;
      const det = shell.readShortcutLink(oldLnk);
      if (!det.target || path.resolve(det.target).toLowerCase() !== me) continue;   // only shortcuts to this app
      if (!fs.existsSync(newLnk)) shell.writeShortcutLink(newLnk, 'create', det);
      fs.unlinkSync(oldLnk);
      log('rename', `${oldLnk} -> ${newLnk}`);
    } catch (e) { log('rename', 'shortcut: ' + e.message); }
  }
  const KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\TheIncinerator';
  execFile('reg', ['query', KEY], { windowsHide: true }, (err) => {
    if (err) return;   // not installed by the installer (a dev run): leave the registry alone
    for (const v of ['DisplayName', 'Publisher']) execFile('reg', ['add', KEY, '/v', v, '/t', 'REG_SZ', '/d', APP_NAME, '/f'], { windowsHide: true }, (e) => { if (e) log('rename', 'registry: ' + e.message); });
  });
  settings.renamedTo = APP_NAME; saveSettings();
}

// Starts Apple's sign-in as if the user clicked: MusicKit opens a popup, and popups need a user gesture.
function startAppleSignIn() {
  if (!amWin || amWin.isDestroyed()) return;
  const js = `(async () => {
    const mk = window.MusicKit && MusicKit.getInstance && MusicKit.getInstance();
    if (!mk) return 'musickit not loaded yet';
    if (mk.isAuthorized) return 'already signed in';
    try { await mk.authorize(); return 'authorize finished, signed in: ' + mk.isAuthorized; }
    catch (e) { return 'authorize failed: ' + String((e && (e.errorCode || e.message || e.name)) || e).slice(0, 200); }
  })()`;
  log('apple', 'sign-in started');
  amWin.webContents.executeJavaScript(js, true).then((r) => log('apple', r)).catch((e) => log('apple', 'sign-in script failed: ' + String(e).slice(0, 200)));
}

function registerMediaKeys() {
  const map = { MediaPlayPause: 'toggle', MediaNextTrack: 'next', MediaPreviousTrack: 'prev', MediaStop: 'stop' };
  for (const [k, a] of Object.entries(map)) { try { globalShortcut.register(k, () => send('media-key', a)); } catch {} }
}

app.on('second-instance', () => { if (playerWin) { if (playerWin.isMinimized()) playerWin.restore(); playerWin.focus(); } });
app.on('before-quit', () => { quitting = true; });
app.on('will-quit', () => { globalShortcut.unregisterAll(); });
app.on('window-all-closed', () => app.quit());

if (single) app.whenReady().then(async () => {
  loadSettings();
  loadLocalCache();
  registerProtocol();
  wireIpc();
  signing.wireSigningIpc();
  ipcMain.on('setup:open', () => signing.openSetup(playerWin, settings, saveSettings));
  updater.init({ log, send, getSettings: () => settings, onQuit: (relaunch) => { quitting = true; if (relaunch) app.relaunch(); app.quit(); } });
  createPlayer();
  registerMediaKeys();
  renameShortcuts();
  // Music services through their own websites (SoundCloud; YouTube and Spotify come next).
  webplayer.wireIpc(log);
  const svcOpts = { log, send, chromeUA: CHROME_UA, appName: APP_NAME, icon: fs.existsSync(ICON) ? nativeImage.createFromPath(ICON) : undefined, isQuitting: () => quitting, getSetting: (k) => settings[k], setSetting: (p) => { Object.assign(settings, p); saveSettings(); } };
  const svcs = [webplayer.makeService(require('./services/soundcloud'), svcOpts)];
  const unsigned = signing.needsSigning();
  log('start', `v${VERSION} electron ${process.versions.electron} signed=${!unsigned} scale=${settings.scale} folder=${settings.folder ? 'yes' : 'no'}`);
  if (unsigned) {
    playerWin.webContents.once('did-finish-load', () => send('am:evt', { type: 'unsigned' }));
    if (!settings.signSkipped) setTimeout(() => { if (playerWin) signing.openSetup(playerWin, settings, saveSettings); }, settings.intro === false ? 800 : 5800);
  }
  // Widevine has to be installed before Apple Music can play anything (it downloads itself on first launch).
  let cdmOk = true;
  try { await components.whenReady(); } catch (e) { cdmOk = false; send('am:evt', { type: 'error', where: 'widevine', message: String(e && e.message || e) }); }
  if (cdmOk) { const cs = (components.status && components.status()) || null; log('widevine', JSON.stringify(cs)); send('am:evt', { type: 'cdm', status: cs }); } else log('widevine', 'failed');
  if (!unsigned) createAppleMusic();
  for (const s of svcs) s.start();
});

// Developer check: INCIN_SMOKE=<png path> saves a screenshot of the player and quits.
if (single && process.env.INCIN_SMOKE) {
  app.whenReady().then(() => {
    setTimeout(() => { if (playerWin) playerWin.webContents.on('console-message', (e) => console.log('[player]', e.message || e)); }, 100);
    setTimeout(async () => {
      try {
        if (process.env.INCIN_SMOKE_JS && playerWin) await playerWin.webContents.executeJavaScript(process.env.INCIN_SMOKE_JS, true);
        await new Promise(r => setTimeout(r, Number(process.env.INCIN_SMOKE_DELAY) || 2500));
        const shot = await playerWin.webContents.capturePage();
        fs.writeFileSync(process.env.INCIN_SMOKE, shot.toPNG());
        if (process.env.INCIN_SMOKE_SETUP_JS) {
          const sw = BrowserWindow.getAllWindows().find(w => w !== playerWin && w !== amWin);
          if (sw) {
            const res = await sw.webContents.executeJavaScript(process.env.INCIN_SMOKE_SETUP_JS, true);
            console.log('[setup-test]', JSON.stringify(res));
            const s2 = await sw.webContents.capturePage();
            fs.writeFileSync(process.env.INCIN_SMOKE.replace(/\.png$/, '-setup.png'), s2.toPNG());
          } else console.log('[setup-test] no setup window');
        }
      } catch (e) { console.error('smoke failed', e); }
      quitting = true; app.quit();
    }, 9000);
  });
}
