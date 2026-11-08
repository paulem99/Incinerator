// Injected into music.apple.com (page world). Drives Apple's own MusicKit player for The Incinerator.
(function () {
  if (window.__incinHook) return true;
  window.__incinHook = true;

  const post = (payload) => window.postMessage({ __incin: 'evt', payload }, location.origin);
  let mk = null, lastEndedKey = null, lastTimePost = 0;

  const artUrl = (a, s) => (a && a.url) ? a.url.replace('{w}', s).replace('{h}', s).replace('{f}', 'jpg').replace('{c}', '') : null;
  const year = (d) => (d || '').slice(0, 4);

  function itemInfo(it) {
    if (!it) return null;
    const a = it.attributes || {};
    return {
      id: it.id,
      title: a.name || it.title || '',
      artist: a.artistName || it.artistName || '',
      album: a.albumName || it.albumName || '',
      year: year(a.releaseDate),
      art: artUrl(a.artwork || it.artwork, 300),
      duration: (a.durationInMillis || it.playbackDuration || 0) / 1000
    };
  }

  function sendState() {
    if (!mk) return;
    post({
      type: 'state',
      item: itemInfo(mk.nowPlayingItem),
      time: mk.currentPlaybackTime || 0,
      duration: mk.currentPlaybackDuration || 0,
      playing: !!mk.isPlaying,
      state: mk.playbackState,
      volume: mk.volume
    });
  }

  async function api(path, params) {
    if (mk.api && typeof mk.api.music === 'function') {
      const r = await mk.api.music(path, params);
      return (r && r.data) || r;
    }
    throw new Error('This version of Apple Music on the web has no library API');
  }

  async function pageAll(path, params, limit, maxPages, onPage) {
    const out = [];
    let offset = 0;
    for (let page = 0; page < maxPages; page++) {
      const r = await api(path, Object.assign({}, params, { limit, offset }));
      const data = (r && r.data) || [];
      out.push(...data);
      if (onPage) onPage(out.length);
      if (!r || !r.next || data.length === 0) break;
      offset += data.length;
    }
    return out;
  }

  let loading = false;
  async function loadLibrary() {
    if (loading || !mk) return;
    if (!mk.isAuthorized) { post({ type: 'library', songs: [], recent: [], signedIn: false }); return; }
    loading = true;
    try {
      post({ type: 'progress', count: 0 });
      const raw = await pageAll('/v1/me/library/songs', {}, 100, 400, (n) => post({ type: 'progress', count: n }));
      const songs = raw.map((s) => {
        const a = s.attributes || {};
        return {
          id: s.id,
          catalogId: (a.playParams && (a.playParams.catalogId || a.playParams.purchasedId)) || null,
          title: a.name || '',
          artist: a.artistName || '',
          album: a.albumName || '',
          year: year(a.releaseDate),
          duration: (a.durationInMillis || 0) / 1000,
          art: artUrl(a.artwork, 300),
          track: a.trackNumber || 0,
          disc: a.discNumber || 0,
          added: a.dateAdded || a.libraryAddedDate || null
        };
      });
      let recent = [];
      try {
        const ra = await pageAll('/v1/me/library/recently-added', {}, 10, 8);
        recent = ra.map((r, i) => {
          const a = r.attributes || {};
          return { type: r.type, id: r.id, name: a.name || '', artist: a.artistName || '', added: a.dateAdded || null, rank: i };
        });
      } catch (e) { post({ type: 'error', where: 'recent', message: String(e && e.message || e) }); }
      post({ type: 'library', songs, recent, signedIn: true });
    } catch (e) {
      post({ type: 'error', where: 'library', message: String(e && e.message || e) });
    } finally { loading = false; }
  }

  async function playSong(id, catalogId) {
    // Catalog IDs are the most reliable way to queue a song; library IDs ("i.xxxx") are the fallback.
    const attempts = [
      catalogId ? ['catalog song', () => mk.setQueue({ song: catalogId, startPlaying: true })] : null,
      ['library songs', () => mk.setQueue({ songs: [id], startPlaying: true })],
      ['library song', () => mk.setQueue({ song: id, startPlaying: true })]
    ].filter(Boolean);
    let lastErr = null;
    for (const [how, attempt] of attempts) {
      try {
        await attempt();
        lastEndedKey = null;
        try { await mk.play(); } catch (e) { post({ type: 'error', where: 'play-call', message: how + ': ' + String((e && e.message) || e) }); }
        post({ type: 'queued', how, id, catalogId });
        setTimeout(() => { if (mk && !mk.isPlaying) post({ type: 'error', where: 'playback-check', message: `not playing 5s after queueing (${how}), state ${mk.playbackState}` }); }, 5000);
        return;
      } catch (e) { lastErr = e; post({ type: 'error', where: 'queue-attempt', message: how + ': ' + String((e && e.message) || e) }); }
    }
    throw lastErr || new Error('Could not queue that song');
  }

  function init() {
    const E = (name, fn) => { try { mk.addEventListener(name, fn); } catch (_) {} };
    E('playbackStateDidChange', (e) => {
      sendState();
      const s = (e && e.state !== undefined) ? e.state : mk.playbackState;
      // 5 = ended, 10 = completed
      if (s === 5 || s === 10) {
        const it = mk.nowPlayingItem;
        const key = (it && it.id) || 'none';
        if (key !== lastEndedKey) { lastEndedKey = key; post({ type: 'ended' }); }
      }
    });
    E('nowPlayingItemDidChange', sendState);
    E('playbackVolumeDidChange', sendState);
    E('playbackTimeDidChange', () => { const now = Date.now(); if (now - lastTimePost > 240) { lastTimePost = now; sendState(); } });
    E('authorizationStatusDidChange', () => {
      post({ type: 'auth', authorized: !!mk.isAuthorized });
      if (mk.isAuthorized) loadLibrary();
    });
    E('mediaPlaybackError', (e) => post({ type: 'error', where: 'playback', message: String((e && (e.message || e.description)) || 'playback error') }));
    post({ type: 'ready', authorized: !!mk.isAuthorized });
    if (mk.isAuthorized) loadLibrary();
  }

  window.addEventListener('message', async (e) => {
    const d = e.data;
    if (!d || d.__incin !== 'cmd') return;
    const m = d.payload || {};
    if (!mk && m.type !== 'ping') { post({ type: 'error', where: m.type, message: 'Apple Music is still loading' }); return; }
    try {
      switch (m.type) {
        case 'ping': post({ type: 'ready', authorized: !!(mk && mk.isAuthorized) }); if (mk) sendState(); break;
        case 'play': await mk.play(); break;
        case 'pause': await mk.pause(); break;
        case 'stop': await mk.stop(); break;
        case 'seek': await mk.seekToTime(m.time); break;
        case 'volume': mk.volume = Math.max(0, Math.min(1, m.value)); break;
        case 'playSong': await playSong(m.id, m.catalogId); break;
        case 'loadLibrary': await loadLibrary(); break;
        case 'authorize': await mk.authorize(); post({ type: 'auth', authorized: !!mk.isAuthorized }); break;
        case 'state': sendState(); break;
      }
    } catch (err) {
      post({ type: 'error', where: m.type, message: String((err && err.message) || err) });
    }
  });

  const started = Date.now();
  const wait = setInterval(() => {
    try {
      const inst = window.MusicKit && typeof window.MusicKit.getInstance === 'function' ? window.MusicKit.getInstance() : null;
      if (inst) { clearInterval(wait); mk = inst; init(); }
      else if (Date.now() - started > 60000) { clearInterval(wait); post({ type: 'error', where: 'musickit', message: 'Apple Music never finished loading' }); }
    } catch (_) {}
  }, 300);
  return true;
})();
