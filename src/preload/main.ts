// Session preloads are also offered to DevTools and subframes. The legacy API
// must only exist in a plugin/main window's top-level document.
if (process.isMainFrame && globalThis.location?.protocol !== 'devtools:') {
  const path = require('path') as typeof import('path');
  const { clipboard, ipcRenderer, nativeImage } =
    require('electron') as typeof import('electron');
  const fs = require('fs') as typeof import('fs');
  const os = require('os') as typeof import('os');
  const remote =
    require('@electron/remote') as typeof import('@electron/remote');
  const staticDir = process.env.ELECTRON_RENDERER_URL
    ? path.join(process.cwd(), 'public')
    : path.join(process.resourcesPath, 'app.asar', 'public');

  (globalThis as typeof globalThis & { __static: string }).__static = staticDir;

  // Keep legacy preload API surface while renderer consumers migrate to
  // explicit contextBridge contracts.
  require(path.join(staticDir, 'preload.js'));

  const allowedSendChannels = new Set(['msg-trigger']);
  const allowedInvokeChannels = new Set([
    'flick:get-plugin-flick-config',
    'flick:flip-plugin-auto-detach',
    'flick:flip-plugin-detach-always-show-search',
    'flick:try-redirect-singleton-detach',
  ]);
  const allowedReceiveChannels = new Set(['global-short-key']);
  const safeIpcRenderer = Object.freeze({
    send(channel: string, ...args: unknown[]) {
      if (!allowedSendChannels.has(channel))
        throw new Error('IPC channel is not allowed');
      ipcRenderer.send(channel, ...args);
    },
    sendSync(channel: string, ...args: unknown[]) {
      if (!allowedSendChannels.has(channel))
        throw new Error('IPC channel is not allowed');
      return ipcRenderer.sendSync(channel, ...args);
    },
    invoke(channel: string, ...args: unknown[]) {
      if (!allowedInvokeChannels.has(channel))
        throw new Error('IPC channel is not allowed');
      return ipcRenderer.invoke(channel, ...args);
    },
    on(
      channel: string,
      listener: (_event: undefined, ...args: unknown[]) => void
    ) {
      if (
        !allowedReceiveChannels.has(channel) ||
        typeof listener !== 'function'
      ) {
        throw new Error('IPC channel is not allowed');
      }
      ipcRenderer.on(channel, (_event, ...args) =>
        listener(undefined, ...args)
      );
    },
  });
  const safeElectron = Object.freeze({
    clipboard: Object.freeze({
      availableFormats: () => clipboard.availableFormats(),
      clear: () => clipboard.clear(),
      readImage: () => clipboard.readImage(),
      readText: () => clipboard.readText(),
      writeText: (text: string) => clipboard.writeText(String(text)),
    }),
    ipcRenderer: safeIpcRenderer,
    nativeImage: Object.freeze({
      createFromPath: (filePath: string) =>
        nativeImage.createFromPath(filePath),
    }),
    shell: Object.freeze({
      readShortcutLink: (filePath: string) => {
        if (process.platform !== 'win32') {
          throw new Error('Shortcut inspection is only available on Windows');
        }
        return require('electron').shell.readShortcutLink(filePath);
      },
    }),
  });
  const safeRemote = Object.freeze({
    getGlobal(name: string) {
      if (name !== 'LOCAL_PLUGINS')
        throw new Error('Remote global is not allowed');
      return remote.getGlobal(name);
    },
    Menu: Object.freeze({
      buildFromTemplate: (template: Electron.MenuItemConstructorOptions[]) =>
        remote.Menu.buildFromTemplate(template),
    }),
    dialog: Object.freeze({
      showMessageBoxSync: (options: Electron.MessageBoxSyncOptions) =>
        remote.dialog.showMessageBoxSync(options),
    }),
  });
  const safePath = Object.freeze({
    extname: (value: string) => path.extname(value),
    join: (...parts: string[]) => path.join(...parts),
    resolve: (...parts: string[]) => path.resolve(...parts),
  });
  const allowedModules = new Map<string, unknown>([
    ['electron', safeElectron],
    ['@electron/remote', safeRemote],
    ['path', safePath],
  ]);
  if (process.platform === 'win32') {
    allowedModules.set(
      'fs',
      Object.freeze({
        promises: Object.freeze({
          readdir: fs.promises.readdir.bind(fs.promises),
          stat: fs.promises.stat.bind(fs.promises),
        }),
      })
    );
    allowedModules.set('os', Object.freeze({ homedir: () => os.homedir() }));
  }
  Object.defineProperty(globalThis, 'require', {
    configurable: false,
    enumerable: false,
    writable: false,
    value(moduleName: string) {
      if (!allowedModules.has(moduleName)) {
        throw new Error(
          `Renderer module is not allowed: ${String(moduleName)}`
        );
      }
      return allowedModules.get(moduleName);
    },
  });
}
