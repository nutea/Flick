import { contextBridge, ipcRenderer, webUtils } from 'electron';
import { toIpcPayload } from './ipcPayload';

type Callback = (...args: any[]) => void;

const callbacks: Record<string, Callback | undefined> = {};

const sendSync = (type: string, data?: unknown) => {
  const result = ipcRenderer.sendSync('msg-trigger', { type, data });
  if (result?.error) throw new Error(result.message || 'IPC request failed');
  return result;
};

const invoke = (type: string, data?: unknown) =>
  ipcRenderer.invoke('msg-trigger-async', { type, data });

const hooks = {
  onPluginEnter: (data: unknown) => callbacks.pluginEnter?.(data),
  onPluginReady: (data: unknown) => callbacks.pluginReady?.(data),
  onPluginOut: (data: unknown) => callbacks.pluginOut?.(data),
  onShow: (data: unknown) => callbacks.show?.(data),
  onHide: (data: unknown) => callbacks.hide?.(data),
  onSubInputChange: (data: unknown) => callbacks.subInput?.(data),
  onScreenCapture: (data: unknown) => callbacks.screenCapture?.(data),
};

const flick = {
  hooks,
  onPluginEnter: (callback: Callback) => {
    callbacks.pluginEnter = callback;
  },
  onPluginReady: (callback: Callback) => {
    callbacks.pluginReady = callback;
  },
  onPluginOut: (callback: Callback) => {
    callbacks.pluginOut = callback;
  },
  onShow: (callback: Callback) => {
    callbacks.show = callback;
  },
  onHide: (callback: Callback) => {
    callbacks.hide = callback;
  },
  onThemeChange: (callback: Callback) => {
    callbacks.theme = callback;
  },
  changeTheme: () => callbacks.theme?.(),
  openPlugin: (plugin: unknown) => invoke('loadPlugin', plugin),
  setSubInput: (callback: Callback, placeholder = '', isFocus?: boolean) => {
    callbacks.subInput = callback;
    return sendSync('setSubInput', { placeholder, isFocus });
  },
  detachInput: {
    show: (
      options: {
        value?: unknown;
        placeholder?: unknown;
        focus?: boolean;
        role?: 'search' | 'filter' | 'command';
      } = {},
      callback?: Callback
    ) => {
      if (callback) callbacks.subInput = callback;
      const result = sendSync('setSubInput', {
        placeholder: String(options.placeholder ?? ''),
        isFocus: options.focus === true,
        role: options.role ?? 'search',
      });
      if (Object.prototype.hasOwnProperty.call(options, 'value')) {
        sendSync('setSubInputValue', { text: String(options.value ?? '') });
      }
      return result;
    },
    hide: () => {
      delete callbacks.subInput;
      return sendSync('removeSubInput');
    },
    setValue: (text: unknown) =>
      sendSync('setSubInputValue', { text: String(text ?? '') }),
  },
  removeSubInput: () => {
    delete callbacks.subInput;
    return sendSync('removeSubInput');
  },
  showOpenDialog: (options: unknown) => sendSync('showOpenDialog', options),
  getFileIcon: (filePath: string) =>
    invoke('getFileIcon', { path: String(filePath || '') }),
  resolveConfiguredLogo: (logo: unknown) =>
    sendSync('resolveConfiguredLogo', { logo }),
  shellOpenExternal: (url: string) =>
    ipcRenderer.invoke('feature:open-external', String(url || '')),
  isWindows: () => process.platform === 'win32',
  isMacOs: () => process.platform === 'darwin',
  isLinux: () => process.platform === 'linux',
  db: {
    put: (data: unknown) => sendSync('dbPut', { data }),
    get: (id: string) => sendSync('dbGet', { id }),
    remove: (doc: unknown) => sendSync('dbRemove', { doc }),
    bulkDocs: (docs: unknown[]) => sendSync('dbBulkDocs', { docs }),
    allDocs: (key?: string) => sendSync('dbAllDocs', { key }),
  },
  dbStorage: {
    setItem: (key: string, value: unknown) => {
      const target: Record<string, unknown> = { _id: String(key), value };
      const current = sendSync('dbGet', { id: target._id });
      if (current?._rev) target._rev = current._rev;
      const result = sendSync('dbPut', { data: target });
      if (result?.error) throw new Error(result.message || 'DB write failed');
    },
    getItem: (key: string) => {
      const result = sendSync('dbGet', { id: String(key) });
      return result && 'value' in result ? result.value : null;
    },
    removeItem: (key: string) => {
      const current = sendSync('dbGet', { id: String(key) });
      if (current) sendSync('dbRemove', { doc: current });
    },
  },
};

const market = {
  getLocalPlugins: () =>
    ipcRenderer.sendSync('feature:get-local-plugins') as unknown[],
  downloadPlugin: (plugin: unknown) =>
    ipcRenderer.invoke('feature:download-plugin', toIpcPayload(plugin)),
  deletePlugin: (plugin: unknown) =>
    ipcRenderer.invoke('feature:delete-plugin', toIpcPayload(plugin)),
  refreshPlugin: (plugin: unknown) =>
    ipcRenderer.invoke('feature:refresh-plugin', toIpcPayload(plugin)),
  addLocalStartPlugin: (plugin: unknown) =>
    ipcRenderer.send('msg-trigger', {
      type: 'addLocalStartPlugin',
      data: { plugin },
    }),
  removeLocalStartPlugin: (plugin: unknown) =>
    ipcRenderer.send('msg-trigger', {
      type: 'removeLocalStartPlugin',
      data: { plugin },
    }),
  dbDump: (target: unknown) =>
    ipcRenderer.send('msg-trigger', { type: 'dbDump', data: { target } }),
  dbImport: (target: unknown) =>
    ipcRenderer.send('msg-trigger', { type: 'dbImport', data: { target } }),
  exportPluginsBundle: (payload: unknown) =>
    invoke('pluginExportBundle', payload || {}),
  importPluginsBundle: () => invoke('pluginImportBundle', {}),
  reregisterShortcuts: () => ipcRenderer.send('re-register'),
  pathExists: (filePath: string) =>
    ipcRenderer.invoke('feature:path-exists', String(filePath || '')),
  getPathForFile: (file: File) => webUtils.getPathForFile(file),
  platform: process.platform,
};

contextBridge.exposeInMainWorld('flick', flick);
contextBridge.exposeInMainWorld('market', market);
