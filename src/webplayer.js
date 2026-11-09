'use strict';
// Incinerator: music services through their own websites (SoundCloud first; YouTube and Spotify next).
// Each service's site runs in a hidden window and is signed in once, like Apple Music. An adapter in src/services/
// says how to tell whether you're signed in, how to load your library, and how to start a song. This engine does
// the rest the same way for every service: the window, sign-in popups, reading the page's playback state, spotting
// the end of a song, and volume. Sign-in tokens are only kept in memory and never logged.

const { BrowserWindow, session, ipcMain, net, shell } = require('electron');

const short = (u) => String(u || '').split(/[?#]/)[0].slice(0, 120);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const services = {};

// Records every media element the page plays, so its volume and state can be read and set from outside.
const MEDIA_HOOK = `(() => {
  if (window.__incinMedia) return true;
  window.__incinMedia = new Set();
  const P = HTMLMediaElement.prototype, play = P.play;
  P.play = function () { window.__incinMedia.add(this); try { if (window.__incinVol != null) this.volume = window.__incinVol; } catch (_) {} return play.apply(this, arguments); };
  return true;
})()`;

function makeService(ad, o) {
  const S = { win: null, signedIn: null, name: '', loading: false, library: null, lists: null, want: null, pollTimer: null, polling: false, vol: 0.6, shownForSignIn: false, auth: {}, plCache: new Map(), authTimer: null };
  const log = (m) => o.log(ad.key, m);
  const evt = (m) => {
    o.send('svc:evt', { svc: ad.key, ...m });
    if (m.type !== 'state' && m.type !== 'progress') log(m.type === 'library' ? `library: ${(m.songs || []).length} songs, ${(m.playlists || []).length} playlists, ${(m.albums || []).length} albums` : JSON.stringify(m).slice(0, 300));
  };
  const js = (code) => (S.win && !S.win.isDestroyed() ? S.win.webContents.executeJavaScript(code, true) : Promise.reject(new Error(ad.name + ' window is closed')));

  // What adapters get to work with.
  const ctx = {
    auth: S.auth, js, log, sleep,
    loadURL: (u) => S.win.loadURL(u),
    session: () => session.fromPartition(ad.partition),
    async fetch(url, init = {}) { return net.fetch(url, { ...init, signal: AbortSignal.timeout(20000) }); }
  };

  function scheduleAuthCheck(ms) { clearTimeout(S.authTimer); S.authTimer = setTimeout(checkAuth, ms || 700); }

  function create() {
    if (S.win && !S.win.isDestroyed()) return S.win;
    const ses = session.fromPartition(ad.partition);
    ses.setUserAgent(o.chromeUA);
    ses.setPermissionRequestHandler((_wc, perm, cb) => cb(['mediaKeySystem', 'media', 'fullscreen', 'clipboard-sanitized-write', 'storage-access', 'top-level-storage-access'].includes(perm)));
    ses.webRequest.onBeforeSendHeaders({ urls: ad.watchUrls }, (d, cb) => {
      try { if (ad.onRequest(d, S.auth)) scheduleAuthCheck(); } catch (_) {}
      cb({ requestHeaders: d.requestHeaders });
    });
    S.win = new BrowserWindow({
      width: 1100, height: 760, show: false, title: `${o.appName}: ${ad.name}`, autoHideMenuBar: true, icon: o.icon,
      webPreferences: { contextIsolation: true, sandbox: true, session: ses, backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required' }
    });
    const wc = S.win.webContents;
    wc.setUserAgent(o.chromeUA);
    const popup = ({ url }) => {
      if (!url || url === 'about:blank' || ad.popupSites.test(url)) {
        log('popup allowed: ' + (short(url) || 'about:blank'));
        return { action: 'allow', overrideBrowserWindowOptions: { width: 520, height: 720, autoHideMenuBar: true, webPreferences: { session: ses, contextIsolation: true, sandbox: true } } };
      }
      log('popup sent to browser: ' + short(url));
      shell.openExternal(url);
      return { action: 'deny' };
    };
    wc.setWindowOpenHandler(popup);
    wc.on('did-create-window', (child) => { child.webContents.setUserAgent(o.chromeUA); child.webContents.setWindowOpenHandler(popup); child.on('closed', () => scheduleAuthCheck(1500)); });
    wc.on('dom-ready', () => js(MEDIA_HOOK).catch(() => {}));
    wc.on('did-finish-load', () => scheduleAuthCheck(2500));
    wc.on('did-navigate', (_e, url) => log('page: ' + short(url)));
    wc.on('did-fail-load', (_e, code, desc, url, isMain) => { if (isMain && code !== -3) { log(`load failed: ${desc} (${code}) ${short(url)}`); evt({ type: 'error', where: 'load', message: `${desc} (${code})` }); } });
    let lines = 0;
    wc.on('console-message', (e) => { const l = e.level; if ((l === 'error' || l === 3) && lines++ < 100) o.log(ad.key + '-console', String(e.message).slice(0, 300)); });
    S.win.on('close', (e) => { if (!o.isQuitting()) { e.preventDefault(); S.win.hide(); S.shownForSignIn = false; } });
    S.win.loadURL(ad.home);
    evt({ type: 'starting' });
    return S.win;
  }

  async function checkAuth() {
    let r;
    try { r = await ad.checkAuth(ctx); } catch (e) { log('sign-in check failed: ' + String(e.message || e).slice(0, 160)); return; }
    if (r && r.signedIn) {
      const was = S.signedIn;
      S.signedIn = true; S.name = r.name || '';
      if (!was) {
        evt({ type: 'auth', signedIn: true, name: S.name, plan: r.plan || null });
        o.setSetting({ [ad.key + 'On']: true });
        if (S.shownForSignIn) setTimeout(() => { if (S.win && !S.win.isDestroyed()) S.win.hide(); S.shownForSignIn = false; }, 1500);
        loadLibrary();
      }
    } else if (S.signedIn !== false) {
      S.signedIn = false;
      evt({ type: 'auth', signedIn: false });
    }
  }

  async function loadLibrary() {
    if (S.loading || !S.signedIn) return;
    S.loading = true;
    try {
      evt({ type: 'progress', count: 0 });
      const { songs, playlists, albums } = await ad.library(ctx, (n) => evt({ type: 'progress', count: n }));
      S.library = songs; S.lists = playlists; S.albums = albums || [];
      evt({ type: 'library', songs, playlists, albums: S.albums });
    } catch (e) {
      evt({ type: 'error', where: 'library', message: String((e && e.message) || e).slice(0, 200) });
    } finally { S.loading = false; }
  }

  // ---------- playback ----------
  async function poll() {
    if (S.polling || !S.win || S.win.isDestroyed() || !S.want) return;
    S.polling = true;
    try {
      const st = await js(ad.stateJs);
      const w = S.want;
      if (w && st) {
        const mine = st.key && st.key === w.key;
        if (mine && st.playing) { w.seen = true; if (st.pos != null) w.lastPos = st.pos; }
        const dur = w.dur || st.dur || 0;
        const nearEnd = dur && w.lastPos != null && w.lastPos >= dur - 3;
        const finished = w.seen && !st.ad && ((st.key && !mine) || (!st.playing && st.pos != null && dur && (st.pos >= dur - 2 || (nearEnd && st.pos < 2))));
        if (finished && !w.ended) { w.ended = true; evt({ type: 'ended', id: w.id }); }
        o.send('svc:evt', { svc: ad.key, type: 'state', playing: !!st.playing, time: mine ? (st.pos || 0) : 0, duration: dur, ad: !!st.ad, mine });
      }
    } catch (_) {} finally { S.polling = false; }
  }
  const startPolling = () => { if (!S.pollTimer) S.pollTimer = setInterval(poll, 600); };
  const stopPolling = () => { clearInterval(S.pollTimer); S.pollTimer = null; };

  async function play(t) {
    if (!t || !t.id) throw new Error('no song');
    create();
    S.want = { id: t.id, key: ad.keyOf(t), dur: t.duration || 0, seen: false, ended: false, lastPos: null };
    startPolling();
    const how = await ad.play(ctx, t);
    log(`playing ${t.id}${how ? ' via ' + how : ''}`);
  }
  async function setPaused(paused) {
    const r = await js(ad.pauseJs(paused));
    if (r === 'no button' && ad.pauseFallback) await ad.pauseFallback(ctx, paused);
  }
  function setVolume(v) {
    S.vol = Math.max(0, Math.min(1, Number(v) || 0));
    js(`(() => { window.__incinVol = ${S.vol}; for (const x of (window.__incinMedia || [])) { try { x.volume = ${S.vol}; } catch (_) {} } return true; })()`).catch(() => {});
  }
  function show(signIn) {
    create();
    S.shownForSignIn = !!signIn;
    S.win.show(); S.win.focus();
    if (signIn) log('sign-in window opened');
  }

  async function cmd(m) {
    try {
      switch (m.type) {
        case 'play': await play(m.track); break;
        case 'pause': if (S.want) await setPaused(true); break;
        case 'resume': if (S.want) await setPaused(false); break;
        case 'stop': if (S.want) await setPaused(true); S.want = null; stopPolling(); break;
        case 'seek': if (S.want) log('seek ' + Math.round(Number(m.time) || 0) + 's: ' + await js(ad.seekJs(Math.max(0, Number(m.time) || 0), S.want.dur || 0))); break;
        case 'volume': if (S.win) setVolume(m.value); else S.vol = Number(m.value) || 0; break;
        case 'signin': show(true); break;
        case 'show': show(false); break;
        case 'reload': create(); S.win.loadURL(ad.home); break;
        case 'library': await loadLibrary(); break;
        case 'ping':
          evt({ type: 'hello', signedIn: S.signedIn, started: !!S.win });
          if (S.library) o.send('svc:evt', { svc: ad.key, type: 'library', songs: S.library, playlists: S.lists, albums: S.albums });
          break;
      }
    } catch (e) {
      evt({ type: 'error', where: m.type, message: String((e && e.message) || e).slice(0, 200) });
    }
  }

  async function playlist(id) {
    if (S.plCache.has(String(id))) return S.plCache.get(String(id));
    const songs = await ad.playlist(ctx, id);
    S.plCache.set(String(id), songs);
    return songs;
  }

  // The hidden site is heavy, so it only starts at launch once the service has been signed in before.
  function start() { if (o.getSetting(ad.key + 'On')) create(); }

  return (services[ad.key] = { key: ad.key, cmd, playlist, start, show });
}

function wireIpc(log) {
  ipcMain.on('svc:cmd', (_e, svc, m) => { const s = services[svc]; if (s && m && typeof m === 'object') s.cmd(m); });
  ipcMain.handle('svc:playlist', async (_e, svc, id) => {
    const s = services[svc]; if (!s) return { error: 'unknown service' };
    try { return { songs: await s.playlist(id) }; } catch (e) { log(svc, 'playlist failed: ' + String(e.message || e).slice(0, 160)); return { error: String(e.message || e).slice(0, 160) }; }
  });
}

module.exports = { makeService, wireIpc, services, MEDIA_HOOK };
