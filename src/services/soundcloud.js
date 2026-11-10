'use strict';
// SoundCloud for Incinerator (runs on src/webplayer.js).
// soundcloud.com runs in a hidden window. Its own requests to api-v2.soundcloud.com carry the client_id and,
// once you're signed in, an "OAuth ..." token; both are read from those requests (or the oauth_token cookie)
// and used to load your likes and playlists. Songs play in the hidden page: it opens the song and presses play.

const LOCAL = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/.*)?$/;
// Developer testing only: a stand-in site and API on this computer.
const HOME = LOCAL.test(process.env.INCIN_SC_URL || '') ? process.env.INCIN_SC_URL : 'https://soundcloud.com/';
const API = LOCAL.test(process.env.INCIN_SC_API || '') ? process.env.INCIN_SC_API.replace(/\/$/, '') : 'https://api-v2.soundcloud.com';
const DEV = HOME.startsWith('http://');

const pathOf = (u) => { try { return new URL(u).pathname.replace(/\/$/, '').toLowerCase(); } catch { return ''; } };
const year = (s) => String(s || '').slice(0, 4);
function mapTrack(t, added) {
  const pm = t.publisher_metadata || {};
  const art = t.artwork_url || (t.user && t.user.avatar_url) || null;
  return {
    id: String(t.id), url: t.permalink_url, path: pathOf(t.permalink_url),
    title: t.title || '', artist: pm.artist || (t.user && t.user.username) || '', album: pm.album_title || '',
    year: year(t.release_date || t.display_date || t.created_at), duration: (t.duration || 0) / 1000,
    art: art ? art.replace(/-(large|t\d+x\d+)\./, '-t300x300.') : null, addedRaw: added || t.created_at || null,
    preview: t.policy === 'SNIP'
  };
}
const playable = (t) => t && t.kind === 'track' && t.permalink_url && t.policy !== 'BLOCK';

async function get(ctx, path) {
  const u = new URL(path.startsWith('http') ? path : API + path);
  if (ctx.auth.clientId && !u.searchParams.get('client_id')) u.searchParams.set('client_id', ctx.auth.clientId);
  const r = await ctx.fetch(u.toString(), { headers: { Accept: 'application/json', ...(ctx.auth.oauth ? { Authorization: ctx.auth.oauth } : {}) } });
  if (!r.ok) throw new Error(`SoundCloud said ${r.status} for ${u.pathname}`);
  return r.json();
}
async function pages(ctx, first, max, each) {
  let url = first, n = 0;
  while (url && n < max) {
    const r = await get(ctx, url);
    for (const it of r.collection || []) { if (each(it) !== false) n++; }
    url = r.next_href || null;
  }
}

module.exports = {
  key: 'sc', name: 'SoundCloud', partition: 'persist:soundcloud', home: HOME,
  popupSites: /^https:\/\/([a-z0-9-]+\.)*(soundcloud\.com|sndcdn\.com|google\.com|gstatic\.com|apple\.com|facebook\.com)([\/?#:]|$)/i,
  watchUrls: ['https://*.soundcloud.com/*', ...(DEV ? [`${new URL(API).protocol}//${new URL(API).hostname}/*`] : [])],

  // Pick the client_id and sign-in token off soundcloud.com's own API requests.
  onRequest(d, auth) {
    let changed = false;
    const h = d.requestHeaders, a = h.Authorization || h.authorization;
    if (a && /^OAuth\s+\S{8,}$/.test(a) && a !== auth.oauth) { auth.oauth = a; changed = true; }
    const m = /[?&]client_id=([A-Za-z0-9]{16,})/.exec(d.url);
    if (m && m[1] !== auth.clientId) { auth.clientId = m[1]; changed = true; }
    return changed;
  },

  async checkAuth(ctx) {
    if (!ctx.auth.oauth) {
      // soundcloud.com also keeps the token in a cookie.
      try { const c = await ctx.session().cookies.get({ name: 'oauth_token' }); const v = c.find(x => /soundcloud\.com$|127\.0\.0\.1|localhost/.test(x.domain || '')); if (v && v.value) ctx.auth.oauth = 'OAuth ' + v.value; } catch (_) {}
    }
    if (!ctx.auth.oauth || !ctx.auth.clientId) return { signedIn: false };
    const me = await get(ctx, '/me');
    ctx.auth.userId = me.id;
    return { signedIn: true, name: me.username || '' };
  },

  async library(ctx, progress) {
    const songs = [], seen = new Set();
    await pages(ctx, `/users/${ctx.auth.userId}/track_likes?limit=200&linked_partitioning=1`, 20000, (it) => {
      const t = it.track; if (!playable(t) || seen.has(t.id)) return false;
      seen.add(t.id); songs.push(mapTrack(t, it.created_at)); if (songs.length % 200 === 0) progress(songs.length);
    });
    // Playlists and albums, yours and the ones you've liked (SoundCloud keeps both as "sets").
    const playlists = [], albums = [], pseen = new Set();
    const isAlbum = (p, type) => /album/.test(type || '') || p.is_album === true || p.set_type === 'album' || p.set_type === 'ep' || p.set_type === 'single' || p.set_type === 'compilation';
    const addSet = (p, sys, type) => {
      if (!p) return; const id = sys ? p.urn : String(p.id); if (!id || pseen.has(id)) return; pseen.add(id);
      const it = { id, name: p.title || (isAlbum(p, type) ? 'ALBUM' : 'PLAYLIST'), count: p.track_count || (p.tracks ? p.tracks.length : 0), system: !!sys, artist: (p.user && p.user.username) || '' };
      (!sys && isAlbum(p, type) ? albums : playlists).push(it);
    };
    try {
      await pages(ctx, '/me/library/all?limit=200&linked_partitioning=1', 4000, (it) => { if (it.playlist) addSet(it.playlist, false, it.type); else if (it.system_playlist) addSet(it.system_playlist, true, it.type); });
    } catch (e) {
      ctx.log('library list failed (' + String(e.message).slice(0, 80) + '), loading sets one kind at a time');
      const uid = ctx.auth.userId;
      for (const [path, type] of [[`/users/${uid}/playlists_without_albums`, 'playlist'], [`/users/${uid}/albums`, 'album'], [`/users/${uid}/playlist_likes`, 'like']]) {
        try { await pages(ctx, `${path}?limit=200&linked_partitioning=1`, 2000, (it) => addSet(it.playlist || it, false, type === 'like' ? (it.playlist && it.playlist.is_album ? 'album' : 'playlist') : type)); }
        catch (e2) { ctx.log(`${type} sets failed: ` + String(e2.message).slice(0, 80)); }
      }
    }
    progress(songs.length);
    return { songs, playlists, albums };
  },

  async playlist(ctx, id) {
    const sys = String(id).includes(':');
    const p = await get(ctx, sys ? `/system-playlists/${encodeURIComponent(id)}` : `/playlists/${encodeURIComponent(id)}?representation=full`);
    const tracks = p.tracks || [];
    // Long playlists only include the first few songs in full; the rest come back as ids to look up.
    const stubs = tracks.filter(t => !t.permalink_url).map(t => t.id);
    const full = new Map();
    for (let i = 0; i < stubs.length; i += 50) {
      const r = await get(ctx, '/tracks?ids=' + stubs.slice(i, i + 50).join(','));
      for (const t of (Array.isArray(r) ? r : r.collection || [])) full.set(t.id, t);
    }
    return tracks.map(t => t.permalink_url ? t : full.get(t.id)).filter(playable).map(t => mapTrack(t));
  },

  keyOf: (t) => t.path || pathOf(t.url),

  // The song's audio stream, so the player can play it itself.
  async streamUrl(ctx, t) {
    if (!/^\d+$/.test(String(t.id))) return null;
    const full = await get(ctx, `/tracks/${t.id}`);
    const tcs = ((full.media && full.media.transcodings) || []).filter(x => x && x.url && x.format && !x.snipped === !(full.policy === 'SNIP'));
    const kind = (x) => x.format.protocol, mime = (x) => x.format.mime_type || '';
    const pick = tcs.find(x => kind(x) === 'progressive')
      || tcs.find(x => kind(x) === 'hls' && /mpeg/.test(mime(x)))
      || tcs.find(x => kind(x) === 'hls' && /mp4|aac/.test(mime(x)));
    if (!pick) return null;
    const u = new URL(pick.url);
    if (full.track_authorization) u.searchParams.set('track_authorization', full.track_authorization);
    const r = await get(ctx, u.toString());
    return r && r.url ? { url: r.url, hls: kind(pick) === 'hls', duration: (full.duration || 0) / 1000 } : null;
  },

  // Open the song in the hidden page and press its big play button.
  async play(ctx, t) {
    const path = t.path || pathOf(t.url);
    const code = `(async () => {
      const want = ${JSON.stringify(path)};
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      const here = () => location.pathname.replace(/\\/$/, '').toLowerCase() === want;
      if (!here()) { history.pushState(null, '', want); dispatchEvent(new PopStateEvent('popstate', { state: null })); }
      for (let t0 = Date.now(); Date.now() - t0 < 5000; await sleep(120)) {
        if (!here()) continue;
        const b = document.querySelector('.fullHero .sc-button-play, .l-listen-hero .sc-button-play, .soundTitle .sc-button-play, .fullHero__title .sc-button-play');
        if (b) { if (!b.classList.contains('sc-button-pause')) b.click(); return 'clicked'; }
      }
      return 'no play button';
    })()`;
    let r = await ctx.js(code);
    if (r !== 'clicked') {
      ctx.log('opening the song page directly');
      await ctx.loadURL(t.url);
      r = await ctx.js(code);
    }
    if (r !== 'clicked') throw new Error("couldn't find SoundCloud's play button");
    return 'page';
  },

  // What the hidden page is playing (the player bar at the bottom of soundcloud.com).
  stateJs: `(() => {
    const q = (s) => document.querySelector(s);
    const a = q('.playbackSoundBadge__titleLink');
    const key = a ? (a.getAttribute('href') || '').split(/[?#]/)[0].replace(/\\/$/, '').toLowerCase() : null;
    const media = [...(window.__incinMedia || [])], live = media.find(x => !x.paused);
    const pp = q('.playControls__play');
    const toS = (el) => { const m = el && String(el.textContent).match(/(\\d+:)?\\d+:\\d\\d(?!.*\\d:\\d\\d)/); if (!m) return null; return m[0].split(':').map(Number).reduce((x, y) => x * 60 + y, 0); };
    if (window.__incinVol != null) for (const x of media) { try { if (Math.abs(x.volume - window.__incinVol) > 0.01) x.volume = window.__incinVol; } catch (_) {} }
    const pos = toS(q('.playbackTimeline__timePassed'));
    return {
      key,
      playing: media.length ? !!live : (pp ? pp.classList.contains('playing') : false),
      pos: pos != null ? pos : (live ? live.currentTime : null),
      dur: toS(q('.playbackTimeline__duration')),
      ad: !!q('.playControls .sc-ad, .playbackSoundBadge__ad, .playControls [class*="adBadge"]')
    };
  })()`,

  pauseJs: (paused) => `(() => {
    const media = [...(window.__incinMedia || [])], playing = media.length ? media.some(x => !x.paused) : !!document.querySelector('.playControls__play.playing');
    if (${!!paused} === !playing) return 'already';
    const b = document.querySelector('.playControls__play');
    if (!b) return 'no button';
    b.click(); return 'clicked';
  })()`,

  // Click the progress bar at the right spot; if the song didn't move, move the media element itself.
  seekJs: (t, dur) => `(async () => {
    const media = () => [...(window.__incinMedia || [])].find(x => !x.paused) || [...(window.__incinMedia || [])][0];
    const bar = document.querySelector('.playbackTimeline__progressWrapper');
    const f = ${dur ? Math.min(0.999, t / dur) : 0};
    if (bar && f > 0) {
      const r = bar.getBoundingClientRect(), x = r.left + r.width * f, y = r.top + r.height / 2;
      for (const type of ['mousedown', 'mouseup', 'click']) bar.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 }));
      await new Promise(r => setTimeout(r, 350));
    }
    const m = media();
    if (m && Math.abs(m.currentTime - ${t}) > 2) { m.currentTime = ${t}; return 'media'; }
    return m ? 'bar' : 'nothing to seek';
  })()`
};
