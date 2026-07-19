const { clipboard, ipcRenderer, nativeImage, shell } = require('electron');
const { BrowserWindow, nativeTheme, screen, app } = require('@electron/remote');
const os = require('os');
const path = require('path');

const appPath = app.getPath('userData');

const baseDir = path.join(appPath, './flick-plugins-new');
const enableStartupDiagnostics =
  !app.isPackaged || !!process.env.ELECTRON_RENDERER_URL;

if (enableStartupDiagnostics) {
  window.addEventListener('error', (event) => {
    const detail = event.error?.stack || event.message || 'unknown error';
    console.error('[main-renderer-error]', detail);
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const detail =
      reason?.stack ||
      (typeof reason === 'string' ? reason : JSON.stringify(reason));
    console.error('[main-renderer-unhandledrejection]', detail);
  });
}

const ipcSendSync = (type, data) => {
  const returnValue = ipcRenderer.sendSync('msg-trigger', {
    type,
    data,
  });
  if (returnValue instanceof Error) throw returnValue;
  return returnValue;
};

const ipcSend = (type, data) => {
  ipcRenderer.send('msg-trigger', {
    type,
    data,
  });
};

const ipcInvoke = (type, data) => {
  return ipcRenderer.invoke('msg-trigger-async', {
    type,
    data,
  });
};

const toFileIconUrl = (filePath) => {
  const value = String(filePath || '').trim();
  return value
    ? `image://file-icon/?src=${encodeURIComponent(value)}`
    : '';
};

window.flick = {
  hooks: {},
  __event__: {},
  // 事件
  onPluginEnter(cb) {
    typeof cb === 'function' && (window.flick.hooks.onPluginEnter = cb);
  },
  onPluginReady(cb) {
    typeof cb === 'function' && (window.flick.hooks.onPluginReady = cb);
  },
  onPluginOut(cb) {
    typeof cb === 'function' && (window.flick.hooks.onPluginOut = cb);
  },
  openPlugin(plugin) {
    ipcSendSync('loadPlugin', plugin);
  },
  onShow(cb) {
    typeof cb === 'function' && (window.flick.hooks.onShow = cb);
  },
  onHide(cb) {
    typeof cb === 'function' && (window.flick.hooks.onHide = cb);
  },
  onThemeChange(cb) {
    typeof cb === 'function' && (window.flick.hooks.onThemeChange = cb);
  },
  changeTheme() {
    window.flick.hooks.onThemeChange?.();
  },
  onOpenMenu(cb) {
    typeof cb === 'function' && (window.flick.hooks.onOpenMenu = cb);
  },
  // 窗口交互
  hideMainWindow() {
    ipcSendSync('hideMainWindow');
  },
  showMainWindow() {
    ipcSendSync('showMainWindow');
  },
  showOpenDialog(options) {
    return ipcSendSync('showOpenDialog', options);
  },
  showSaveDialog(options) {
    return ipcSendSync('showSaveDialog', options);
  },
  showContextMenu(items, point) {
    return ipcInvoke('showContextMenu', { items, ...(point || {}) });
  },
  showMessageBox(options) {
    return ipcInvoke('showMessageBox', options);
  },

  setExpendHeight(height) {
    ipcSendSync('setExpendHeight', height);
  },
  setSubInput(onChange, placeholder = '', isFocus) {
    typeof onChange === 'function' &&
      (window.flick.hooks.onSubInputChange = onChange);
    ipcSendSync('setSubInput', {
      placeholder,
      isFocus,
    });
  },
  detachInput: {
    show(options = {}, onChange) {
      typeof onChange === 'function' &&
        (window.flick.hooks.onSubInputChange = onChange);
      ipcSendSync('setSubInput', {
        placeholder: String(options.placeholder || ''),
        isFocus: options.focus === true,
        role: options.role || 'search',
      });
      if (Object.prototype.hasOwnProperty.call(options, 'value')) {
        ipcSendSync('setSubInputValue', { text: String(options.value ?? '') });
      }
    },
    hide() {
      window.flick.removeSubInput();
    },
    setValue(text) {
      window.flick.setSubInputValue(text);
    },
  },
  removeSubInput() {
    delete window.flick.hooks.onSubInputChange;
    ipcSendSync('removeSubInput');
  },
  setSubInputValue(text) {
    ipcSendSync('setSubInputValue', { text });
  },
  sendSubInputChange(text) {
    return ipcSendSync('sendSubInputChangeEvent', { text });
  },
  sendPluginKeyDown(keyCode, modifiers) {
    ipcSend('sendPluginSomeKeyDownEvent', { keyCode, modifiers });
  },
  subInputBlur() {
    ipcSendSync('subInputBlur');
  },
  getPath(name) {
    return ipcSendSync('getPath', { name });
  },
  showNotification(body, clickFeatureCode) {
    ipcSend('showNotification', { body, clickFeatureCode });
  },
  copyImage(img) {
    return ipcSendSync('copyImage', { img });
  },
  copyText(text) {
    return ipcSendSync('copyText', { text });
  },
  copyFile: (file) => {
    return ipcSendSync('copyFile', { file });
  },
  clipboard: {
    availableFormats: () => clipboard.availableFormats(),
    clear: () => clipboard.clear(),
    readText: () => clipboard.readText(),
    readImageDataUrl: () => clipboard.readImage().toDataURL(),
    writeText: (text) => clipboard.writeText(String(text || '')),
    imageFileDataUrl: (filePath) =>
      nativeImage.createFromPath(String(filePath || '')).toDataURL(),
  },
  pathExtension: (filePath) => path.extname(String(filePath || '')),
  db: {
    put: (data) => ipcSendSync('dbPut', { data }),
    get: (id) => ipcSendSync('dbGet', { id }),
    remove: (doc) => ipcSendSync('dbRemove', { doc }),
    bulkDocs: (docs) => ipcSendSync('dbBulkDocs', { docs }),
    allDocs: (key) => ipcSendSync('dbAllDocs', { key }),
    postAttachment: (docId, attachment, type) =>
      ipcSendSync('dbPostAttachment', { docId, attachment, type }),
    getAttachment: (docId) => ipcSendSync('dbGetAttachment', { docId }),
    getAttachmentType: (docId) => ipcSendSync('dbGetAttachmentType', { docId }),
  },
  dbStorage: {
    setItem: (key, value) => {
      const target = { _id: String(key) };
      const result = ipcSendSync('dbGet', { id: target._id });
      result && (target._rev = result._rev);
      target.value = value;
      const res = ipcSendSync('dbPut', { data: target });
      if (res.error) throw new Error(res.message);
    },
    getItem: (key) => {
      const res = ipcSendSync('dbGet', { id: key });
      return res && 'value' in res ? res.value : null;
    },
    removeItem: (key) => {
      const res = ipcSendSync('dbGet', { id: key });
      res && ipcSendSync('dbRemove', { doc: res });
    },
  },
  isDarkColors() {
    return false;
  },
  getFeatures() {
    return ipcSendSync('getFeatures');
  },
  setFeature(feature) {
    return ipcSendSync('setFeature', { feature });
  },
  screenCapture(cb) {
    typeof cb === 'function' &&
      (window.flick.hooks.onScreenCapture = ({ data }) => {
        cb(data);
      });
    ipcSendSync('screenCapture');
  },
  removeFeature(code) {
    return ipcSendSync('removeFeature', { code });
  },

  // 系统
  shellOpenExternal(url) {
    shell.openExternal(url);
  },

  isMacOs() {
    return os.type() === 'Darwin';
  },

  isWindows() {
    return os.type() === 'Windows_NT';
  },

  isLinux() {
    return os.type() === 'Linux';
  },

  shellOpenPath(path) {
    shell.openPath(path);
  },

  launchApp(path) {
    return ipcInvoke('launchApp', { path });
  },

  getLocalId: () => ipcSendSync('getLocalId'),

  removePlugin() {
    ipcSend('removePlugin');
  },
  detachPlugin() {
    ipcSend('detachPlugin');
  },
  openPluginDevTools() {
    ipcSend('openPluginDevTools');
  },
  moveWindow(bounds) {
    ipcSend('windowMoving', bounds);
  },
  tryRedirectSingletonDetach(plugin) {
    return ipcRenderer.invoke('flick:try-redirect-singleton-detach', plugin);
  },
  getPluginFlickConfig(name) {
    return ipcRenderer.invoke('flick:get-plugin-flick-config', name);
  },
  flipPluginAutoDetach(name) {
    return ipcRenderer.invoke('flick:flip-plugin-auto-detach', name);
  },
  flipPluginDetachAlwaysShowSearch(name) {
    return ipcRenderer.invoke(
      'flick:flip-plugin-detach-always-show-search',
      name
    );
  },
  onGlobalShortcut(callback) {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, value) => callback(value);
    ipcRenderer.on('global-short-key', listener);
    return () => ipcRenderer.removeListener('global-short-key', listener);
  },

  shellShowItemInFolder: (path) => {
    ipcSend('shellShowItemInFolder', { path });
  },

  redirect: (label, payload) => {
    // todo
  },

  shellBeep: () => {
    ipcSend('shellBeep');
  },

  // Rubick plugins expect this legacy API to return an img.src string
  // synchronously. The custom protocol performs the native icon lookup later.
  getFileIcon: (path) => toFileIconUrl(path),

  getPluginInfo: (pluginName, pluginPath) =>
    ipcInvoke('getPluginInfo', { pluginName, pluginPath }),
  getBuiltinPlugin: (name) => ipcInvoke('getBuiltinPlugin', { name }),

  getLocalPlugins: () => ipcSendSync('getLocalPlugins'),
  getInstalledApps: () => ipcInvoke('getInstalledApps'),

  updateLocalPlugin: (plugin) => ipcSendSync('updateLocalPlugin', plugin),

  resolveConfiguredLogo: (logo) =>
    ipcSendSync('resolveConfiguredLogo', { logo }),

  upgradePlugin: (name) => ipcInvoke('upgradePlugin', { name }),

  getCopyedFiles: () => {
    return ipcSendSync('getCopyFiles');
  },

  simulateKeyboardTap: (key, ...modifier) => {
    ipcSend('simulateKeyboardTap', { key, modifier });
  },

  getCursorScreenPoint: () => {
    return screen.getCursorScreenPoint();
  },

  getDisplayNearestPoint: (point) => {
    return screen.getDisplayNearestPoint(point);
  },

  outPlugin: () => {
    return ipcSend('removePlugin');
  },

  createBrowserWindow: (url, options, callback) => {
    const winUrl = path.resolve(baseDir, 'node_modules', options.name);
    const winIndex = `file://${path.join(winUrl, './', url || '')}`;
    const preloadPath = path.join(
      winUrl,
      './',
      options.webPreferences.preload || ''
    );
    let win = new BrowserWindow({
      useContentSize: true,
      resizable: true,
      title: '拉比克',
      show: false,
      backgroundColor: nativeTheme.shouldUseDarkColors ? '#1c1c28' : '#fff',
      ...options,
      webPreferences: {
        webSecurity: false,
        backgroundThrottling: false,
        contextIsolation: false,
        webviewTag: true,
        nodeIntegration: true,
        spellcheck: false,
        partition: null,
        ...(options.webPreferences || {}),
        preload: preloadPath,
      },
    });
    win.loadURL(winIndex);

    win.on('closed', () => {
      win = undefined;
    });
    win.once('ready-to-show', () => {
      win.show();
    });
    win.webContents.on('dom-ready', () => {
      callback && callback();
    });
    return win;
  },
};

// Backward compatibility for legacy Rubick plugins.
// Many existing plugins still access window.rubick.* APIs.
if (!window.rubick) {
  window.rubick = window.flick;
}

ipcRenderer.on('flick:open-menu', (_event, payload) => {
  window.flick.hooks.onOpenMenu?.(payload);
});
