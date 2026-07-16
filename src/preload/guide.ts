import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('guide', {
  close: () => ipcRenderer.send('guide:service', { type: 'close' }),
});
