'use strict';
// One-time castLabs VMP signing, done from inside the app with a bundled copy of the castLabs tool.
// Apple Music's Widevine copy protection only works in apps carrying a castLabs production signature.

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawn } = require('child_process');

// Fingerprint of the development signature that ships with castLabs Electron v44.9.3+wvcus.
const DEV_SIG_SHA256 = '73c7d81a39e714024f5ecabae5d8e3fd82de5b0d56b91ec8bfedd295c1716284';

// INCIN_TEST_SIGNING=<folder> runs the flow against a fake tool for development checks.
const TEST = process.env.INCIN_TEST_SIGNING || null;
const exePath = () => TEST ? path.join(TEST, 'app.exe') : process.execPath;
const sigPath = () => exePath() + '.sig';
const pyExe = () => TEST ? 'python3' : path.join(process.resourcesPath, 'pyevs', 'python.exe');

function needsSigning() {
  if (!TEST && (process.platform !== 'win32' || !app.isPackaged)) return false;
  try { return crypto.createHash('sha256').update(fs.readFileSync(sigPath())).digest('hex') === DEV_SIG_SHA256; }
  catch { return true; }
}
const toolAvailable = () => !!TEST || fs.existsSync(pyExe());

function runEvs(mod, args, extraEnv, onLine) {
  return new Promise((resolve) => {
    const evsDir = path.join(app.getPath('userData'), 'evs');
    try { fs.mkdirSync(evsDir, { recursive: true }); } catch {}
    const env = { ...process.env, EVS_CONFIG_FILE: path.join(evsDir, 'config.json'), EVS_CACHE_FILE: path.join(evsDir, 'cache.json'), ...extraEnv };
    delete env.PYTHONHOME; delete env.PYTHONPATH;
    let out = '', p;
    try { p = spawn(pyExe(), ['-E', '-s', '-X', 'utf8', '-m', mod, '-n', ...args], { env, windowsHide: true, cwd: TEST || evsDir }); }
    catch (e) { resolve({ ok: false, out: String(e) }); return; }
    const onData = (d) => { const s = d.toString(); out += s; if (onLine) s.split(/\r?\n|\r/).forEach((l) => { if (l.trim()) onLine(l.trim()); }); };
    p.stdout.on('data', onData); p.stderr.on('data', onData);
    p.on('error', (e) => resolve({ ok: false, out: out + '\n' + e }));
    p.on('close', (code) => resolve({ ok: code === 0, out }));
  });
}

function friendlyError(out) {
  const t = String(out || '');
  if (/UsernameExists/i.test(t)) return 'That username is taken. Pick another one.';
  if (/InvalidPassword/i.test(t)) return 'castLabs wants a stronger password. Use at least 8 characters with upper and lower case letters and a number.';
  if (/CodeMismatch/i.test(t)) return "That code didn't match. Check the email and try again.";
  if (/ExpiredCode/i.test(t)) return 'That code expired. Send a new one.';
  if (/UserNotConfirmed/i.test(t)) return 'This account still needs the code from its email.';
  if (/NotAuthorized|Incorrect username or password/i.test(t)) return 'Wrong username or password.';
  if (/LimitExceeded|TooManyRequests/i.test(t)) return 'Too many tries. Wait a few minutes and try again.';
  if (/InvalidParameter.*email|invalid email/i.test(t)) return "That email address doesn't look right.";
  if (/connect|timed? ?out|NameResolution|getaddrinfo|EndpointConnection/i.test(t)) return "Couldn't reach castLabs. Check your internet connection and try again.";
  const lines = t.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  const err = lines.find((l) => /Error|Exception|failed/i.test(l)) || lines[lines.length - 1] || 'Something went wrong.';
  return err.slice(0, 220);
}

let setupWin = null, creds = null;

function openSetup(parent, settings, saveSettings) {
  if (setupWin && !setupWin.isDestroyed()) { setupWin.show(); setupWin.focus(); return; }
  setupWin = new BrowserWindow({
    width: 480, height: 660, useContentSize: true, frame: false, resizable: false, maximizable: false, fullscreenable: false,
    parent, modal: false, show: false, backgroundColor: '#140b0b', title: 'Incinerator: one-time setup',
    webPreferences: { preload: path.join(__dirname, 'preload-setup.js'), contextIsolation: true, sandbox: true }
  });
  setupWin.loadFile(path.join(__dirname, 'setup', 'setup.html'), { query: { tool: toolAvailable() ? '1' : '0' } });
  setupWin.once('ready-to-show', () => setupWin.show());
  setupWin.on('closed', () => { setupWin = null; });
  setupWin.__skip = () => { settings.signSkipped = true; saveSettings(); };
}

function wireSigningIpc() {
  const acct = () => (creds ? { EVS_ACCOUNT_NAME: creds.user, EVS_PASSWD: creds.pass } : {});
  ipcMain.handle('setup:signup', async (_e, f) => {
    creds = { user: f.user, pass: f.pass, email: f.email };
    const r = await runEvs('castlabs_evs.account', ['signup'], { ...acct(), EVS_EMAIL: f.email, EVS_FIRST_NAME: f.first, EVS_LAST_NAME: f.last, EVS_ORGANIZATION: 'Personal', EVS_NO_CONFIRM: '1' });
    return r.ok ? { ok: true } : { ok: false, error: friendlyError(r.out) };
  });
  ipcMain.handle('setup:confirm', async (_e, code) => {
    const r = await runEvs('castlabs_evs.account', ['confirm-signup'], { ...acct(), EVS_CODE: String(code || '').trim() });
    return r.ok ? { ok: true } : { ok: false, error: friendlyError(r.out) };
  });
  ipcMain.handle('setup:resend', async () => {
    const r = await runEvs('castlabs_evs.account', ['resend'], { ...acct(), EVS_NO_CONFIRM: '1' });
    return r.ok ? { ok: true } : { ok: false, error: friendlyError(r.out) };
  });
  ipcMain.handle('setup:login', async (_e, f) => {
    creds = { user: f.user, pass: f.pass };
    const r = await runEvs('castlabs_evs.account', ['reauth'], acct());
    return r.ok ? { ok: true } : { ok: false, error: friendlyError(r.out) };
  });
  ipcMain.handle('setup:sign', async (e) => {
    const r = await runEvs('castlabs_evs.vmp', ['sign', exePath(), sigPath()], { ...acct(), EVS_GZ: '1', EVS_FORCE: '1' }, (line) => { if (!e.sender.isDestroyed()) e.sender.send('setup:log', line); });
    if (r.ok && !needsSigning()) { creds = null; return { ok: true }; }
    return { ok: false, error: r.ok ? 'castLabs answered, but the signature didn\'t change. Try again.' : friendlyError(r.out) };
  });
  ipcMain.on('setup:skip', (e) => { const w = BrowserWindow.fromWebContents(e.sender); if (w && w.__skip) w.__skip(); if (w) w.close(); });
  ipcMain.on('setup:close', (e) => { const w = BrowserWindow.fromWebContents(e.sender); if (w) w.close(); });
  ipcMain.on('setup:restart', () => { if (TEST) { console.log('[signing] restart requested'); return; } app.relaunch(); app.exit(0); });
}

module.exports = { needsSigning, toolAvailable, openSetup, wireSigningIpc };
