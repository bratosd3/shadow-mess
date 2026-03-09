const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  isDesktop: true,
  showNotification: (title, body) => ipcRenderer.send('show-notification', { title, body }),
  setBadge: (count) => ipcRenderer.send('set-badge', count),
  getVersion: () => ipcRenderer.invoke('get-version'),
  onDownloadComplete: (cb) => ipcRenderer.on('download-complete', (_e, filename) => cb(filename)),
});
