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
});
