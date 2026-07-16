import { contextBridge, ipcRenderer } from 'electron';

const ALLOWED_DOCUMENT_IDS = new Set([
  'super-panel-user-plugins',
  'flick-system-super-panel-preferences',
]);

function sendSync<T>(type: string, data?: unknown): T {
  const result = ipcRenderer.sendSync('msg-trigger', { type, data });
  if (result && typeof result === 'object' && result.error === true) {
    throw new Error(String(result.message || 'SuperX IPC request failed'));
  }
  return result as T;
}

contextBridge.exposeInMainWorld('superPanel', {
  platform: process.platform,
  getDocument: (id: string) => {
    if (!ALLOWED_DOCUMENT_IDS.has(id)) return null;
    return sendSync('dbGet', { id });
  },
  getDesktopPath: () => sendSync<string>('getPath', { name: 'desktop' }),
  copyText: (text: string) => sendSync('copyText', { text: String(text) }),
  openPlugin: (payload: unknown) =>
    ipcRenderer.send('msg-trigger', { type: 'openPlugin', data: payload }),
  showMainWindow: () =>
    ipcRenderer.send('msg-trigger', { type: 'showMainWindow' }),
  hide: () => ipcRenderer.send('superPanel-hidden'),
  contentApplied: () => ipcRenderer.send('superPanel-content-applied'),
  setHeight: (height: number) => {
    if (Number.isFinite(height)) ipcRenderer.send('superPanel-setSize', height);
  },
  setPinned: (pinned: boolean) =>
    ipcRenderer.send('trigger-pin', Boolean(pinned)),
  getPinState: () => ipcRenderer.invoke('superPanel-get-pin-state'),
  createFile: (directory: string) =>
    ipcRenderer.invoke('superPanel-create-file', String(directory ?? '')),
  openTerminal: (directory: string) =>
    ipcRenderer.invoke('superPanel-open-terminal', String(directory ?? '')),
  getCurrentFolder: () => ipcRenderer.invoke('get-path-async'),
  requestTranslation: (request: unknown) =>
    ipcRenderer.invoke('superPanel-translate', request),
  onTrigger: (callback: (payload: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: unknown) =>
      callback(payload);
    ipcRenderer.on('trigger-super-panel', listener);
    return () => ipcRenderer.removeListener('trigger-super-panel', listener);
  },
  onPinState: (callback: (pinned: boolean) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, pinned: unknown) =>
      callback(Boolean(pinned));
    ipcRenderer.on('superPanel-pin-state', listener);
    return () => ipcRenderer.removeListener('superPanel-pin-state', listener);
  },
  onDismissed: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('super-panel-dismissed', listener);
    return () => ipcRenderer.removeListener('super-panel-dismissed', listener);
  },
});
