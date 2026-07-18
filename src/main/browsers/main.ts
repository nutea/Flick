import { app, BrowserWindow, nativeTheme } from 'electron';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
// import versonHandler from '../common/versionHandler';
import localConfig from '@/main/common/initLocalConfig';
import {
  WINDOW_HEIGHT,
  WINDOW_MIN_HEIGHT,
  WINDOW_MIN_WIDTH,
  WINDOW_WIDTH,
} from '@/common/constans/common';
import commonConst from '@/common/utils/commonConst';
import {
  showStartupError,
  writeStartupLog,
} from '@/main/common/startupDiagnostics';
import { secureWebContentsNavigation } from '@/main/common/navigationSecurity';
import { windowGeometryController } from '@/main/common/windowGeometryController';

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
  };

  const createWindow = async () => {
    win = new BrowserWindow({
      height: WINDOW_HEIGHT,
      minHeight: WINDOW_MIN_HEIGHT,
      minWidth: WINDOW_MIN_WIDTH,
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
        contextIsolation: true,
        sandbox: false,
        webviewTag: false,
        nodeIntegration: false,
        navigateOnDragDrop: false,
        preload: path.join(__dirname, '../../preload/index.js'),
        spellcheck: false,
      },
    });
    windowGeometryController.attachMainWindow(win);
    const devServerUrl = process.env.ELECTRON_RENDERER_URL;
    const targetUrl = devServerUrl
      ? devServerUrl
      : pathToFileURL(
          path.join(app.getAppPath(), 'dist', 'renderer', 'index.html')
        ).toString();
    secureWebContentsNavigation(win.webContents, targetUrl);
    void win.loadURL(targetUrl);
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
            return {
              flickBridge: !!window.flick,
              nodeRequireType: typeof window.require
            };
          })()`
          )
          .then((result) => {
            const secure =
              preferences.nodeIntegration === false &&
              preferences.contextIsolation === true &&
              preferences.webviewTag === false &&
              result?.flickBridge === true &&
              result?.nodeRequireType === 'undefined';
            const payload = { secure, preferences, result };
            if (secure) console.log('[flick-main] smoke passed:', payload);
            else console.error('[flick-main] smoke failed:', payload);

            const smokeReportPath = process.env.FLICK_SMOKE_REPORT;
            if (smokeReportPath) {
              const report = {
                secure,
                platform: process.platform,
                arch: process.arch,
                packaged: app.isPackaged,
                preferences: {
                  contextIsolation: preferences.contextIsolation,
                  nodeIntegration: preferences.nodeIntegration,
                  sandbox: preferences.sandbox,
                  webSecurity: preferences.webSecurity,
                  webviewTag: preferences.webviewTag,
                },
                result,
              };
              fs.mkdirSync(path.dirname(smokeReportPath), {
                recursive: true,
              });
              fs.writeFileSync(
                smokeReportPath,
                JSON.stringify(report, null, 2),
                'utf8'
              );
              app.exit(secure ? 0 : 1);
            }
          })
          .catch((error) => {
            console.error('[flick-main] smoke failed to execute:', error);
            const smokeReportPath = process.env.FLICK_SMOKE_REPORT;
            if (smokeReportPath) {
              fs.mkdirSync(path.dirname(smokeReportPath), {
                recursive: true,
              });
              fs.writeFileSync(
                smokeReportPath,
                JSON.stringify(
                  {
                    secure: false,
                    platform: process.platform,
                    arch: process.arch,
                    packaged: app.isPackaged,
                    error: String(error),
                  },
                  null,
                  2
                ),
                'utf8'
              );
              app.exit(1);
            }
          });
      }
    });

    win.on('show', () => {
      if (!canUseWindow()) return;
      // 触发主窗口的 onShow hook
      win.webContents.send('flick:window-show');
      // versonHandler.checkUpdate();
      // win.webContents.openDevTools();
    });

    win.on('hide', () => {
      if (!canUseWindow()) return;
      // 触发主窗口的 onHide hook
      win.webContents.send('flick:window-hide');
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
