const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const remoteMain = require('@electron/remote/main');

process.env.ELECTRON_RENDERER_URL = 'plugin-preload-smoke';
remoteMain.initialize();

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true,
      sandbox: false,
      preload: path.join(process.cwd(), 'dist', 'preload', 'plugin.js'),
    },
  });
  remoteMain.enable(win.webContents);
  ipcMain.on('msg-trigger', (event) => {
    event.returnValue = null;
  });

  try {
    await win.loadURL('data:text/html,<title>plugin-preload-smoke</title>');
    const result = await win.webContents.executeJavaScript(`({
      flick: typeof window.flick === 'object',
      onPluginEnter: typeof window.flick?.onPluginEnter,
      dbGet: typeof window.flick?.db?.get,
      rubickAlias: window.rubick === window.flick,
      legacyRemote: typeof require('electron').remote?.getCurrentWindow,
      missingApis: window.__flickRubickCompatibility?.missingApis || null
    })`);
    const passed =
      result.flick === true &&
      result.onPluginEnter === 'function' &&
      result.dbGet === 'function' &&
      result.rubickAlias === true &&
      result.legacyRemote === 'function' &&
      Array.isArray(result.missingApis) &&
      result.missingApis.length === 0;
    console.log('[flick-plugin] preload smoke:', { passed, result });
    app.exit(passed ? 0 : 1);
  } catch (error) {
    console.error('[flick-plugin] preload smoke failed:', error);
    app.exit(1);
  }
});
