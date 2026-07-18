import { contextBridge, ipcRenderer } from 'electron';

const allowedWindowActions = new Set([
  'minimize',
  'maximize',
  'close',
  'endFullScreen',
]);
contextBridge.exposeInMainWorld('detach', {
  platform: process.platform,
  sendInput: (text: string) =>
    ipcRenderer.send('msg-trigger', {
      type: 'detachInputChange',
      data: { text: String(text ?? '') },
    }),
  windowAction: (type: string) => {
    if (allowedWindowActions.has(type)) {
      ipcRenderer.send('detach:service', { type });
    }
  },
  setPinned: (pinned: boolean) =>
    ipcRenderer.invoke('detach:set-pinned', Boolean(pinned)),
  toggleDevTools: () => ipcRenderer.invoke('detach:toggle-devtools'),
  getDevToolsState: () => ipcRenderer.invoke('detach:get-devtools-state'),
  focusPlugin: () => ipcRenderer.invoke('detach:focus-plugin'),
  onDevToolsState: (callback: (opened: boolean) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, opened: unknown) =>
      callback(Boolean(opened));
    ipcRenderer.on('detach:devtools-state', listener);
    return () => ipcRenderer.removeListener('detach:devtools-state', listener);
  },
  openPluginMenu: (pluginInfo: unknown) =>
    ipcRenderer.invoke('detach:open-plugin-menu', pluginInfo),
  onInputPolicy: (callback: (policy: 'auto' | 'always') => void) => {
    const listener = (_event: Electron.IpcRendererEvent, policy: unknown) =>
      callback(policy === 'always' ? 'always' : 'auto');
    ipcRenderer.on('detach:input-policy', listener);
    return () => ipcRenderer.removeListener('detach:input-policy', listener);
  },
});
