import { BrowserWindow, ipcMain, nativeTheme } from 'electron';
import localConfig from '../common/initLocalConfig';
import path from 'path';
import commonConst from '@/common/utils/commonConst';
import { WINDOW_MIN_HEIGHT } from '@/common/constans/common';
import { executePluginSubInputChangeHook } from '@/main/common/pluginSubInputHook';
import { resolveDetachWindowIcon } from '@/main/common/detachWindowIcon';
import {
  DEV_APP_PORTS,
  devSubAppHttpUrl,
  shouldOpenSubAppShellDevTools,
} from '@/main/common/devSubAppServers';

const DETACH_TITLEBAR_HEIGHT = 50;

export default () => {
  let win: BrowserWindow | undefined;

  /** pluginSetting.single 非 false 时同一插件仅保留一个分离窗；key 为插件 `name` */
  const singleDetachWindowByPlugin = new Map<string, BrowserWindow>();

  const getExistingDetachWindow = (pluginName: string): BrowserWindow | undefined => {
    const w = singleDetachWindowByPlugin.get(pluginName);
    if (!w || w.isDestroyed()) {
      if (w) singleDetachWindowByPlugin.delete(pluginName);
      return undefined;
    }
    return w;
  };

  const init = async (
    pluginInfo: { name?: string; logo?: string },
    viewInfo: Electron.Rectangle,
    view: Electron.BrowserView,
    allowMultipleDetachWindows?: boolean
  ) => {
    const createWin = await createWindow(
      pluginInfo,
      viewInfo,
      view,
      !!allowMultipleDetachWindows
    );
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('@electron/remote/main').enable(createWin.webContents);
  };

  /** 插件 BrowserView 不可铺满整个客户区，否则会盖住 detach 页顶栏（无法拖动/关闭）。 */
  const layoutDetachPluginView = (w: BrowserWindow) => {
    const bv = w.getBrowserView();
    if (!bv) return;
    const [cw, ch] = w.getContentSize();
    bv.setBounds({
      x: 0,
      y: DETACH_TITLEBAR_HEIGHT,
      width: cw,
      height: Math.max(0, ch - DETACH_TITLEBAR_HEIGHT),
    });
  };

  const createWindow = async (
    pluginInfo: { name?: string; pluginName?: string; logo?: string },
    viewInfo: Electron.Rectangle,
    view: Electron.BrowserView,
    allowMultipleDetachWindows: boolean
  ) => {
    const pluginKey = pluginInfo.name || '';
    const winIcon = await resolveDetachWindowIcon(
      pluginInfo.logo,
      pluginInfo.name
    );
    const createWin = new BrowserWindow({
      height: viewInfo.height,
      minHeight: DETACH_TITLEBAR_HEIGHT,
      width: viewInfo.width,
      autoHideMenuBar: true,
      titleBarStyle: 'hidden',
      trafficLightPosition: { x: 12, y: 16 },
      title: pluginInfo.pluginName,
      resizable: true,
      frame: true,
      show: false,
      enableLargerThanScreen: true,
      backgroundColor: nativeTheme.shouldUseDarkColors ? '#1c1c28' : '#fff',
      x: viewInfo.x,
      y: viewInfo.y,
      ...(winIcon ? { icon: winIcon } : {}),
      webPreferences: {
        webSecurity: false,
        backgroundThrottling: false,
        contextIsolation: false,
        webviewTag: true,
        devTools: true,
        nodeIntegration: true,
        navigateOnDragDrop: true,
        spellcheck: false,
      },
    });

    if (!allowMultipleDetachWindows && pluginKey) {
      singleDetachWindowByPlugin.set(pluginKey, createWin);
    }

    const detachFile = `file://${path.join(__static, './detach/index.html')}`;
    const detachUrl = devSubAppHttpUrl(DEV_APP_PORTS.detach, '/') ?? detachFile;
    void createWin.loadURL(detachUrl);
    if (shouldOpenSubAppShellDevTools()) {
      createWin.webContents.once('did-finish-load', () => {
        if (!createWin || createWin.isDestroyed()) return;
        if (createWin.webContents.isDevToolsOpened()) return;
        createWin.webContents.openDevTools({ mode: 'detach' });
      });
    }
    createWin.on('close', () => {
      executeHooks('PluginOut', null);
    });
    createWin.on('closed', () => {
      view.webContents?.destroy();
      if (!allowMultipleDetachWindows && pluginKey) {
        const cur = singleDetachWindowByPlugin.get(pluginKey);
        if (cur === createWin) {
          singleDetachWindowByPlugin.delete(pluginKey);
        }
      }
      if (win === createWin) win = undefined;
    });
    createWin.on('focus', () => {
      win = createWin;
      view && win.webContents?.focus();
    });

    createWin.once('ready-to-show', async () => {
      const config = await localConfig.getConfig();
      const darkMode = config.perf.common.darkMode;
      darkMode &&
        createWin.webContents.executeJavaScript(
          `document.body.classList.add("dark");window.flick.theme="dark"`
        );
      createWin.setBrowserView(view);
      view.inDetach = true;
      layoutDetachPluginView(createWin);
      createWin.webContents.executeJavaScript(
        `window.initDetach(${JSON.stringify(pluginInfo)})`
      );
      const subVal = String(
        (pluginInfo as { subInput?: { value?: string } }).subInput?.value ?? ''
      );
      if (subVal) {
        executePluginSubInputChangeHook(view.webContents, subVal);
      }
      win = createWin;
      createWin.show();
    });

    createWin.on('resize', () => layoutDetachPluginView(createWin));

    createWin.on('maximize', () => {
      createWin.webContents.executeJavaScript('window.maximizeTrigger()');
      layoutDetachPluginView(createWin);
    });
    createWin.on('unmaximize', () => {
      createWin.webContents.executeJavaScript('window.unmaximizeTrigger()');
      layoutDetachPluginView(createWin);
    });

    createWin.on('page-title-updated', (e) => {
      e.preventDefault();
    });
    createWin.webContents.once('render-process-gone', () => {
      createWin.close();
    });

    if (commonConst.macOS()) {
      createWin.on('enter-full-screen', () => {
        createWin.webContents.executeJavaScript(
          'window.enterFullScreenTrigger()'
        );
      });
      createWin.on('leave-full-screen', () => {
        createWin.webContents.executeJavaScript(
          'window.leaveFullScreenTrigger()'
        );
      });
    }

    view.webContents.on('before-input-event', (event, input) => {
      if (input.type !== 'keyDown') return;
      if (!(input.meta || input.control || input.shift || input.alt)) {
        if (input.key === 'Escape') {
          if (createWin.isFullScreen()) createWin.setFullScreen(false);
        }
        return;
      }
    });

    const executeHooks = (hook: string, data: unknown) => {
      if (!view) return;
      const evalJs = `console.log(window.flick);if(window.flick && window.flick.hooks && typeof window.flick.hooks.on${hook} === 'function' ) {
          try {
            window.flick.hooks.on${hook}(${data ? JSON.stringify(data) : ''});
          } catch(e) {console.log(e)}
        }
      `;
      view.webContents.executeJavaScript(evalJs);
    };
    return createWin;
  };

  const getWindow = () => win;

  /** 分离窗壳页发 IPC，按 sender 定位窗口，多开时互不影响 */
  ipcMain.removeAllListeners('detach:service');
  ipcMain.on('detach:service', async (event, arg: { type: string }) => {
    const w = BrowserWindow.fromWebContents(event.sender);
    if (!w || w.isDestroyed()) return;
    switch (arg.type) {
      case 'minimize':
        w.focus();
        w.minimize();
        break;
      case 'maximize':
        w.isMaximized() ? w.unmaximize() : w.maximize();
        break;
      case 'close':
        w.close();
        break;
      case 'endFullScreen':
        if (w.isFullScreen()) w.setFullScreen(false);
        break;
      default:
        break;
    }
  });

  return {
    init,
    getWindow,
    getExistingDetachWindow,
  };
};
