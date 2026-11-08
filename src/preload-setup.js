'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('setup', {
  signup: (f) => ipcRenderer.invoke('setup:signup', f),
  confirm: (code) => ipcRenderer.invoke('setup:confirm', code),
  resend: () => ipcRenderer.invoke('setup:resend'),
  login: (f) => ipcRenderer.invoke('setup:login', f),
  sign: () => ipcRenderer.invoke('setup:sign'),
  skip: () => ipcRenderer.send('setup:skip'),
  close: () => ipcRenderer.send('setup:close'),
  restart: () => ipcRenderer.send('setup:restart'),
  onLog: (fn) => { const h = (_e, l) => fn(l); ipcRenderer.on('setup:log', h); return () => ipcRenderer.removeListener('setup:log', h); }
});
