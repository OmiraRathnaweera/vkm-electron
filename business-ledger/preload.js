const { contextBridge, ipcRenderer } = require('electron');

/* The only door between the web page and the system. */
contextBridge.exposeInMainWorld('api', {
  loadData: () => ipcRenderer.invoke('data:load'),
  saveData: (data) => ipcRenderer.invoke('data:save', data),
  exportBackup: () => ipcRenderer.invoke('backup:export'),
  importBackup: () => ipcRenderer.invoke('backup:import'),
  saveTextFile: (opts) => ipcRenderer.invoke('file:save-text', opts),
  loadFragments: () => ipcRenderer.invoke('ui:fragments'),
  appInfo: () => ipcRenderer.invoke('app:info'),
  openDataFolder: () => ipcRenderer.invoke('app:open-data-folder'),
});
