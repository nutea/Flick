import { app, BrowserWindow, protocol, nativeTheme } from 'electron';
import path from 'path';
import { pathToFileURL } from 'url';
// import versonHandler from '../common/versionHandler';
import localConfig from '@/main/common/initLocalConfig';
import {
  WINDOW_HEIGHT,
  WINDOW_MIN_HEIGHT,
  WINDOW_WIDTH,
} from '@/common/constans/common';
import commonConst from '@/common/utils/commonConst';
import {
  showStartupError,
  writeStartupLog,
} from '@/main/common/startupDiagnostics';
import { secureWebContentsNavigation } from '@/main/common/navigationSecurity';

require('@electron/remote/main').initialize();

export default () => {
  let win: any;
  const canUseWindow = () =>
    !!win &&
    !win.isDestroyed() &&
    !!win.webContents &&
    !win.webContents.isDestroyed();

  const init = () => {
    createWindow();

    require('@electron/remote/main').enable(win.webContents);
  };

  const createWindow = async () => {
    win = new BrowserWindow({
      height: WINDOW_HEIGHT,
      minHeight: WINDOW_MIN_HEIGHT,
      useContentSize: true,
      resizable: true,
      width: WINDOW_WIDTH,
      frame: false,
      title: '拉比克',
      show: false,
      skipTaskbar: commonConst.macOS(),
      backgroundColor: nativeTheme.shouldUseDarkColors ? '#1c1c28' : '#fff',
      webPreferences: {
        webSecurity: true,
        backgroundThrottling: false,
        contextIsolation: false,
        sandbox: false,
        webviewTag: false,
        nodeIntegration: false,
        navigateOnDragDrop: false,
        preload: path.join(__dirname, '../../preload/index.js'),
        spellcheck: false,
      },
    });
    const devServerUrl = process.env.ELECTRON_RENDERER_URL;
    const targetUrl = devServerUrl
      ? devServerUrl
      : pathToFileURL(
          path.join(app.getAppPath(), 'dist', 'renderer', 'index.html')
        ).toString();
    secureWebContentsNavigation(win.webContents, targetUrl);
    void win.loadURL(targetUrl);
    protocol.interceptFileProtocol('image', (req, callback) => {
      const url = req.url.substr(8);
      callback(decodeURI(url));
    });
    win.on('closed', () => {
      win = undefined;
    });

    win.webContents.on(
      'did-fail-load',
      (_event, code, desc, validatedURL, isMainFrame) => {
        if (!isMainFrame) return;
        showStartupError(
          'Flick Window Error',
          `Main window failed to load: ${validatedURL || 'unknown URL'}`,
          `${code}: ${desc}`
        );
      }
    );

    win.webContents.on('console-message', (details) => {
      const { level, message, lineNumber, sourceId } = details;
      if (!process.env.ELECTRON_RENDERER_URL && app.isPackaged) {
        return;
      }
      if (typeof sourceId === 'string' && sourceId.startsWith('devtools://')) {
        return;
      }
      if (level !== 'warning' && level !== 'error') {
        return;
      }
      writeStartupLog('main window console-message', {
        level,
        message,
        line: lineNumber,
        sourceId,
      });
    });

    win.webContents.on('render-process-gone', (_event, details) => {
      showStartupError(
        'Flick Window Error',
        'Main window render process exited unexpectedly.',
        details
      );
    });

    win.webContents.once('did-finish-load', () => {
      writeStartupLog('main window finished load');
      if (process.env.FLICK_MAIN_SMOKE === '1') {
        const preferences = win.webContents.getLastWebPreferences();
        void win.webContents
          .executeJavaScript(
            `(() => {
            const denied = (name) => {
              try { window.require(name); return false; } catch { return true; }
            };
            return {
              flickBridge: !!window.flick,
              pathFacade: typeof window.require('path').join === 'function',
              childProcessDenied: denied('child_process'),
              fsExtraDenied: denied('fs-extra')
            };
          })()`
          )
          .then((result) => {
            const secure =
              preferences.nodeIntegration === false &&
              preferences.webviewTag === false &&
              result?.flickBridge === true &&
              result?.pathFacade === true &&
              result?.childProcessDenied === true &&
              result?.fsExtraDenied === true;
            const payload = { secure, preferences, result };
            if (secure) console.log('[flick-main] smoke passed:', payload);
            else console.error('[flick-main] smoke failed:', payload);
          })
          .catch((error) =>
            console.error('[flick-main] smoke failed to execute:', error)
          );
      }
    });

    win.on('show', () => {
      if (!canUseWindow()) return;
      // 触发主窗口的 onShow hook
      void win.webContents.executeJavaScript(
        `window.flick && window.flick.hooks && typeof window.flick.hooks.onShow === "function" && window.flick.hooks.onShow()`
      );
      // versonHandler.checkUpdate();
      // win.webContents.openDevTools();
    });

    win.on('hide', () => {
      if (!canUseWindow()) return;
      // 触发主窗口的 onHide hook
      void win.webContents.executeJavaScript(
        `window.flick && window.flick.hooks && typeof window.flick.hooks.onHide === "function" && window.flick.hooks.onHide()`
      );
    });

    // 判断失焦是否隐藏
    win.on('blur', async () => {
      if (!canUseWindow()) return;
      const config = await localConfig.getConfig();
      if (config.perf.common.hideOnBlur && canUseWindow()) {
        win.hide();
      }
    });
  };

  const getWindow = () => win;

  return {
    init,
    getWindow,
  };
};
