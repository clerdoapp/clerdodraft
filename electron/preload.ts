import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('clerdo', {
  open: () => ipcRenderer.invoke('file:open'),
  launchFile: () => ipcRenderer.invoke('file:launch'),
  fetchImage: (url: string) => ipcRenderer.invoke('net:image', url),
  fonts: () => ipcRenderer.invoke('fonts:list'),
  newWindow: () => ipcRenderer.send('window:new'),
  save: (path: string | null, name: string, data: Uint8Array) => ipcRenderer.invoke('file:save', path, name, data),
});
