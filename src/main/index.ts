'use strict';
import electron, {
  app,
  globalShortcut,
  BrowserWindow,
  session,
  Tray,
} from 'electron';
import { main, guide } from './browsers';
import commonConst from '../common/utils/commonConst';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import API from './common/api';
import createTray from './common/tray';
import registerHotKey from './common/registerHotKey';
import localConfig from './common/initLocalConfig';
import { windowGeometryController } from './common/windowGeometryController';
import {
  getSearchFiles,
  putFileToFlick,
  macBeforeOpen,
} from './common/getSearchFiles';

import '../common/utils/localPlugin';

import checkVersion from './common/versionHandler';
import registerSystemPlugin from './common/registerSystemPlugin';
import registerCdwhereIpc from './common/registerCdwhereIpc';
import { warmupDevSubAppServers } from './common/devSubAppServers';
import { showStartupError, writeStartupLog } from './common/startupDiagnostics';
import { isSilentLoginStartup } from './common/startupMode';
import {
  installImageProtocol,
  registerImageProtocolPrivileges,
} from './common/imageProtocolService';

registerImageProtocolPrivileges();

class App {
  public windowCreator: { init: () => void; getWindow: () => BrowserWindow };
  private systemPlugins: any;
  private tray: Tray | null = null;

  constructor() {
    this.windowCreator = main();
    const gotTheLock = app.requestSingleInstanceLock();
    if (!gotTheLock) {
      app.quit();
    } else {
      this.systemPlugins = registerSystemPlugin();
      this.beforeReady();
      this.onReady();
      this.onRunning();
      this.onQuit();
    }
  }
  beforeReady() {
    // 系统托盘
    if (commonConst.macOS()) {
      macBeforeOpen();
      // Installation is handled by the DMG. Moving the running bundle here can
      // invalidate resource paths while Electron is still starting up.
      app.dock?.hide();
    } else {
      app.disableHardwareAcceleration();
    }
  }

  createWindow() {
    this.windowCreator.init();
  }
  onReady() {
    const readyFunction = async () => {
      try {
        writeStartupLog('ready initialization started');
        installImageProtocol(session.defaultSession);
        await warmupDevSubAppServers();
        writeStartupLog('sub-app server initialization completed');
        registerCdwhereIpc();
        await localConfig.init();
        writeStartupLog('local configuration initialized');
        const loginItemSettings = app.getLoginItemSettings();
        const silentLoginStartup = isSilentLoginStartup({
          platform: process.platform,
          argv: process.argv,
          wasOpenedAtLogin: loginItemSettings.wasOpenedAtLogin,
          forceSilent: process.env.FLICK_LOGIN_STARTUP === '1',
        });
        writeStartupLog('startup mode resolved', {
          silentLoginStartup,
          platform: process.platform,
        });
        if (!silentLoginStartup) {
          void checkVersion();
        }
        const config = await localConfig.getConfig();
        if (!silentLoginStartup && !config.perf.common.guide) {
          guide().init();
          config.perf.common.guide = true;
          localConfig.setConfig(config);
        }
        this.createWindow();
        writeStartupLog('main window created');
        const mainWindow = this.windowCreator.getWindow();
        API.init(mainWindow);
        const shouldShowForSmoke =
          (!app.isPackaged && process.env.FLICK_STARTUP_SHOW === '1') ||
          (app.isPackaged && process.env.FLICK_PACKAGED_SMOKE === '1');
        if (
          !silentLoginStartup &&
          shouldShowForSmoke &&
          !mainWindow.isDestroyed()
        ) {
          windowGeometryController.showMainWindow(mainWindow);
        }
        this.tray = await createTray(() => this.windowCreator.getWindow());
        writeStartupLog('tray created');
        registerHotKey(this.windowCreator.getWindow());
        this.systemPlugins.triggerReadyHooks(
          Object.assign(electron, {
            mainWindow: this.windowCreator.getWindow(),
            API,
          })
        );

        // Windows packaged app can otherwise end up with no visible entry point
        // if tray/hotkey/guide does not become visible in time.
        if (commonConst.windows() && app.isPackaged && !silentLoginStartup) {
          setTimeout(() => {
            const guideWindow = guide().getWindow();
            const hasVisibleGuide =
              !!guideWindow &&
              !guideWindow.isDestroyed() &&
              guideWindow.isVisible();
            const hasVisibleMain =
              !!mainWindow &&
              !mainWindow.isDestroyed() &&
              mainWindow.isVisible();
            if (!hasVisibleGuide && !hasVisibleMain) {
              writeStartupLog(
                'startup fallback showing main window on Windows packaged build'
              );
              mainWindow.setSkipTaskbar(false);
              windowGeometryController.showMainWindow(mainWindow);
            }
          }, 1800);
        }

        if (silentLoginStartup) {
          setTimeout(() => {
            const visibleWindowCount = BrowserWindow.getAllWindows().filter(
              (window) => !window.isDestroyed() && window.isVisible()
            ).length;
            writeStartupLog('silent login startup visibility verified', {
              trayAvailable: !!this.tray && !this.tray.isDestroyed(),
              visibleWindowCount,
            });
          }, 1000);
        }
      } catch (error) {
        showStartupError(
          'Flick Startup Error',
          'Failed while initializing the main process.',
          error
        );
      }
    };
    if (!app.isReady()) {
      app.on('ready', readyFunction);
    } else {
      readyFunction();
    }
  }

  onRunning() {
    app.on('second-instance', (event, commandLine, workingDirectory) => {
      const files = getSearchFiles(commandLine, workingDirectory);
      const win = this.windowCreator.getWindow();
      // 当运行第二个实例时,将会聚焦到myWindow这个窗口
      // 如果有文件列表作为参数，说明是命令行启动
      if (win) {
        if (win.isMinimized()) {
          win.restore();
        }
        // 第二实例被拒绝后，确保主窗口可见，避免仅 focus 但窗口仍隐藏
        windowGeometryController.showMainWindow(win);
        if (files.length > 0) {
          putFileToFlick(win.webContents, files);
        }
      }
    });
    app.on('activate', () => {
      if (!this.windowCreator.getWindow()) {
        this.createWindow();
      }
    });
    if (commonConst.windows()) {
      // app.setAppUserModelId(pkg.build.appId)
    }
  }

  onQuit() {
    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        app.quit();
      }
    });

    app.on('will-quit', () => {
      globalShortcut.unregisterAll();
      if (this.tray) {
        this.tray.destroy();
        this.tray = null;
      }
    });

    if (commonConst.dev()) {
      if (process.platform === 'win32') {
        process.on('message', (data) => {
          if (data === 'graceful-exit') {
            app.quit();
          }
        });
      } else {
        process.on('SIGTERM', () => {
          app.quit();
        });
      }
    }
  }
}

export default new App();
