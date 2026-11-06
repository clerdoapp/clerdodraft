import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('clerdo', {
  open: () => ipcRenderer.invoke('file:open'),
  fonts: () => ipcRenderer.invoke('fonts:list'),
  newWindow: () => ipcRenderer.send('window:new'),
  save: (path: string | null, name: string, data: Uint8Array) => ipcRenderer.invoke('file:save', path, name, data),
});
