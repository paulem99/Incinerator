'use strict';
// The Incinerator: startup loader.
// Runs the newest verified copy of the app: a downloaded update in the user's AppData, or the copy the
// installer shipped. An update that fails to start three times is set aside, and the copy before it runs instead.

const { app } = require('electron');
const path = require('path');
const fs = require('fs');

app.setName('The Incinerator');
const SHIPPED = require('./package.json').version;

function cmp(a, b) {
  const pa = String(a).split('.').map(n => parseInt(n, 10) || 0), pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0) ? 1 : -1; }
  return 0;
}

const updDir = path.join(app.getPath('userData'), 'updates');
const statePath = path.join(updDir, 'state.json');
function readState() { try { return JSON.parse(fs.readFileSync(statePath, 'utf8')); } catch { return {}; } }
function writeState(s) { try { fs.mkdirSync(updDir, { recursive: true }); fs.writeFileSync(statePath, JSON.stringify(s, null, 2)); } catch {} }
const shellOf = (v) => String(v || '').split('+')[0];
// Set an update aside and go back to the one before it (or the shipped copy).
function setAside(s, v, err) {
  s.bad = [...new Set([...(s.bad || []), v])];
  s.active = (s.prev && s.prev !== v && !s.bad.includes(s.prev)) ? s.prev : null;
  s.prev = null; s.tries = 0;
  if (err) s.lastError = String(err).slice(0, 2000);
  writeState(s);
}

function chooseRoot() {
  const s = readState();
  const v = s.active;
  if (!v || !/^\d+\.\d+\.\d+$/.test(v) || cmp(v, SHIPPED) <= 0) return null;
  if ((s.bad || []).includes(v)) return null;
  const dir = path.join(updDir, 'app-' + v);
  let pkg;
  try { pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')); } catch { return null; }
  if (pkg.version !== v || !fs.existsSync(path.join(dir, 'src', 'main.js'))) return null;
  // An app update is built for one Electron shell. If the installed shell is different, wait for the full installer.
  const need = pkg.incinerator && pkg.incinerator.shell;
  if (need && shellOf(need) !== shellOf(process.versions.electron)) return null;
  if ((s.tries || 0) >= 3) { setAside(s, v, 'did not start 3 times'); return chooseRoot(); }
  s.tries = (s.tries || 0) + 1;
  writeState(s);
  return dir;
}

let root = null;
try { root = chooseRoot(); } catch { root = null; }
global.__incinBoot = { root: root || __dirname, shipped: SHIPPED, fromUpdate: !!root };

if (root) {
  try {
    require(path.join(root, 'src', 'main.js'));
  } catch (e) {
    // The update would not even load: set it aside and start again on the shipped copy.
    const s = readState();
    setAside(s, s.active, e && e.stack || e);
    app.relaunch();
    app.exit(0);
  }
} else {
  require('./src/main.js');
}
