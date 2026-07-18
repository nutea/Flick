import { clipboard, contextBridge, ipcRenderer, nativeImage } from 'electron';
import path from 'path';
import type { MainFlickBridge } from '@/common/types/mainBridge';

type Callback = (...args: any[]) => void;
const callbacks: Record<string, Callback | undefined> = {};

const sendSync = (type: string, data?: unknown) => {
  const result = ipcRenderer.sendSync('msg-trigger', { type, data });
  if (result?.error) throw new Error(result.message || 'IPC request failed');
  return result;
};
const send = (type: string, data?: unknown) =>
  ipcRenderer.send('msg-trigger', { type, data });
const invoke = (type: string, data?: unknown) =>
  ipcRenderer.invoke('msg-trigger-async', { type, data });

const flick: MainFlickBridge = {
  db: {
    put: (data: unknown) => sendSync('dbPut', { data }),
    get: (id: string) => sendSync('dbGet', { id }),
    remove: (doc: unknown) => sendSync('dbRemove', { doc }),
    bulkDocs: (docs: unknown[]) => sendSync('dbBulkDocs', { docs }),
    allDocs: (key?: string) => sendSync('dbAllDocs', { key }),
  },
  clipboard: {
    availableFormats: () => clipboard.availableFormats(),
    clear: () => clipboard.clear(),
    readText: () => clipboard.readText(),
    readImageDataUrl: () => clipboard.readImage().toDataURL(),
    writeText: (text: unknown) => clipboard.writeText(String(text || '')),
    imageFileDataUrl: (filePath: unknown) =>
      nativeImage.createFromPath(String(filePath || '')).toDataURL(),
  },
  pathExtension: (filePath: unknown) => path.extname(String(filePath || '')),
  setExpendHeight: (height: unknown) => sendSync('setExpendHeight', height),
  hideMainWindow: () => sendSync('hideMainWindow'),
  showMainWindow: () => sendSync('showMainWindow'),
  removePlugin: () => invoke('removePlugin'),
  detachPlugin: () => send('detachPlugin'),
  openPluginDevTools: () => send('openPluginDevTools'),
  openPlugin: (plugin: unknown) => invoke('loadPlugin', plugin),
  launchApp: (filePath: unknown) => invoke('launchApp', { path: filePath }),
  getFileIcon: (filePath: unknown) => invoke('getFileIcon', { path: filePath }),
  getCopyedFiles: () => sendSync('getCopyFiles'),
  getPluginInfo: (pluginName: unknown, pluginPath: unknown) =>
    invoke('getPluginInfo', { pluginName, pluginPath }),
  getBuiltinPlugin: (name: unknown) => invoke('getBuiltinPlugin', { name }),
  getLocalPlugins: () => sendSync('getLocalPlugins'),
  getInstalledApps: () => invoke('getInstalledApps'),
  updateLocalPlugin: (plugin: unknown) => sendSync('updateLocalPlugin', plugin),
  upgradePlugin: (name: unknown) => invoke('upgradePlugin', { name }),
  resolveConfiguredLogo: (logo: unknown) =>
    sendSync('resolveConfiguredLogo', { logo }),
  sendPluginKeyDown: (keyCode: unknown, modifiers: unknown) =>
    send('sendPluginSomeKeyDownEvent', { keyCode, modifiers }),
  sendSubInputChange: (text: unknown) =>
    sendSync('sendSubInputChangeEvent', { text }),
  tryRedirectSingletonDetach: (plugin: unknown) =>
    ipcRenderer.invoke('flick:try-redirect-singleton-detach', plugin),
  getPluginFlickConfig: (name: unknown) =>
    ipcRenderer.invoke('flick:get-plugin-flick-config', name),
  flipPluginAutoDetach: (name: unknown) =>
    ipcRenderer.invoke('flick:flip-plugin-auto-detach', name),
  flipPluginDetachInputPolicy: (name: unknown) =>
    ipcRenderer.invoke('flick:flip-plugin-detach-input-policy', name),
  showContextMenu: (items: unknown, point?: unknown) =>
    invoke('showContextMenu', {
      items,
      ...(point && typeof point === 'object' ? point : {}),
    }),
  showMessageBox: (options: unknown) => invoke('showMessageBox', options),
  onShow: (callback: Callback) => (callbacks.show = callback),
  onHide: (callback: Callback) => (callbacks.hide = callback),
  onThemeChange: (callback: Callback) => (callbacks.theme = callback),
  changeTheme: () => callbacks.theme?.(),
  onOpenMenu: (callback: Callback) => (callbacks.openMenu = callback),
  onGlobalShortcut: (callback: Callback) => {
    const listener = (_event: Electron.IpcRendererEvent, value: unknown) =>
      callback(value);
    ipcRenderer.on('global-short-key', listener);
    return () => ipcRenderer.removeListener('global-short-key', listener);
  },
};

ipcRenderer.on('flick:window-show', () => callbacks.show?.());
ipcRenderer.on('flick:window-hide', () => callbacks.hide?.());
ipcRenderer.on('flick:open-menu', (_event, payload) =>
  callbacks.openMenu?.(payload)
);

contextBridge.exposeInMainWorld('flick', flick);
