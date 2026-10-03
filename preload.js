/**
 * Preload bridge - the ONLY channel between renderer and Node/Electron.
 * contextIsolation=true + sandbox=true, so renderer has zero Node access.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('gamenet', {
  isElectron: true,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
  backup: {
    write: (name, data) => ipcRenderer.invoke('gamenet:backup-write', { name, data }),
    read: (name) => ipcRenderer.invoke('gamenet:backup-read', { name }),
  },
  paths: () => ipcRenderer.invoke('gamenet:get-paths'),
  device: {
    fingerprint: () => ipcRenderer.invoke('gamenet:device-fingerprint'),
  },
  openExternal: (url) => ipcRenderer.invoke('gamenet:open-external', url),
  /* sms and agent used to sit inside the backup object, so the real path was
     window.gamenet.backup.sms.send while every caller asked for
     window.gamenet.sms.send. Both were undefined: SMS silently returned
     {ok:false, error:'no-ipc'} and the panel looked like it was working. */
  sms: {
    send: (opts) => ipcRenderer.invoke('gamenet:sms-send', opts),
  },
  agent: {
    request: (ip, path) => ipcRenderer.invoke('gamenet:agent-request', { ip, path }),
  },
});
