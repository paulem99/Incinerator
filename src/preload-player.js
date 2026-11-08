'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const on = (ch) => (fn) => { const h = (_e, d) => fn(d); ipcRenderer.on(ch, h); return () => ipcRenderer.removeListener(ch, h); };

contextBridge.exposeInMainWorld('incin', {
  amCmd: (msg) => ipcRenderer.send('am:cmd', msg),
  onAm: on('am:evt'),
  showAppleMusic: (signIn) => ipcRenderer.send('am:show', { signIn: !!signIn }),
  reloadAppleMusic: () => ipcRenderer.send('am:reload'),
  openSetup: () => ipcRenderer.send('setup:open'),
  showAppleMusicWindow: () => ipcRenderer.send('am:show-window'),
  openLog: () => ipcRenderer.send('log:open'),
  log: (line) => ipcRenderer.send('log:write', String(line).slice(0, 500)),
  fetchArt: (url) => ipcRenderer.invoke('art:fetch', url),
  localArt: (p) => ipcRenderer.invoke('local:art', p),
  getLocal: () => ipcRenderer.invoke('local:get'),
  pickFolder: () => ipcRenderer.invoke('local:pick'),
  onLocal: on('local:library'),
  onLocalProgress: on('local:progress'),
  onLocalError: on('local:error'),
  fileUrl: (p) => 'incin://file/?p=' + encodeURIComponent(p),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.send('settings:set', patch),
  minimize: () => ipcRenderer.send('win:minimize'),
  close: () => ipcRenderer.send('win:close'),
  dragStart: (off) => ipcRenderer.send('win:drag-start', off),
  dragEnd: () => ipcRenderer.send('win:drag-end'),
  scale: (dir) => ipcRenderer.send('win:scale', dir),
  onMediaKey: on('media-key'),
  updateGet: () => ipcRenderer.invoke('update:get'),
  updateCheck: () => ipcRenderer.send('update:check'),
  updateInstall: () => ipcRenderer.send('update:install'),
  updateDecline: () => ipcRenderer.send('update:decline'),
  onUpdate: on('update:status')
});
