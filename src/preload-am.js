'use strict';
// Runs in the hidden Apple Music window (isolated world). It only relays messages between
// the injected MusicKit hook (page world) and the main process.
const { ipcRenderer } = require('electron');

window.addEventListener('message', (e) => {
  const d = e.data;
  if (!d || d.__incin !== 'evt') return;
  if (e.origin && e.origin !== location.origin) return;
  ipcRenderer.send('am:evt', d.payload);
});

ipcRenderer.on('am:cmd', (_e, msg) => {
  window.postMessage({ __incin: 'cmd', payload: msg }, location.origin);
});
