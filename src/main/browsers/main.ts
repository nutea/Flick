import { app, BrowserWindow, protocol, nativeTheme } from 'electron';
import path from 'path';
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
// eslint-disable-next-line @typescript-eslint/no-var-requires
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
    // eslint-disable-next-line @typescript-eslint/no-var-requires
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
        webSecurity: false,
        backgroundThrottling: false,
        contextIsolation: false,
        webviewTag: true,
        nodeIntegration: true,
        preload: path.join(__dirname, '../../preload/index.js'),
        spellcheck: false,
      },
    });
    const devServerUrl = process.env.ELECTRON_RENDERER_URL;
    if (devServerUrl) {
      // Load the url of the dev server if in development mode
      void win.loadURL(devServerUrl);
    } else {
      // 主进程在 dist/main/chunks 下时 __dirname 多一层，不能用相对 chunks 的 ../renderer
      void win.loadFile(
        path.join(app.getAppPath(), 'dist', 'renderer', 'index.html')
      );
    }
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

    win.webContents.on(
      'console-message',
      (_event, level, message, line, sourceId) => {
        if (!process.env.ELECTRON_RENDERER_URL && app.isPackaged) {
          return;
        }
        if (
          typeof sourceId === 'string' &&
          sourceId.startsWith('devtools://')
        ) {
          return;
        }
        if (level < 2) {
          return;
        }
        writeStartupLog('main window console-message', {
          level,
          message,
          line,
          sourceId,
        });
      }
    );

    win.webContents.on('render-process-gone', (_event, details) => {
      showStartupError(
        'Flick Window Error',
        'Main window render process exited unexpectedly.',
        details
      );
    });

    win.webContents.once('did-finish-load', () => {
      writeStartupLog('main window finished load');
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
