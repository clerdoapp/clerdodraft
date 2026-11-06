import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('clerdo', {
  open: () => ipcRenderer.invoke('file:open'),
  save: (path: string | null, name: string, data: Uint8Array) => ipcRenderer.invoke('file:save', path, name, data),
});
