import { BrowserWindow, dialog, ipcMain, Menu, nativeTheme } from 'electron';
import localConfig from '../common/initLocalConfig';
import path from 'path';
import commonConst from '@/common/utils/commonConst';
import { executePluginSubInputChangeHook } from '@/main/common/pluginSubInputHook';
import { resolveDetachWindowIcon } from '@/main/common/detachWindowIcon';
import {
  DEV_APP_PORTS,
  devSubAppHttpUrl,
  shouldOpenSubAppShellDevTools,
} from '@/main/common/devSubAppServers';
import { secureWebContentsNavigation } from '@/main/common/navigationSecurity';
import {
  flipPluginAutoDetachSync,
  flipPluginDetachInputPolicySync,
  readPluginFlickConfigSync,
} from '@/main/common/pluginFlickConfig';
import { presentPlugin } from '@/main/common/pluginPresentation';
import { normalizeDetachInputCapability } from '@/common/utils/detachInput';

const DETACH_TITLEBAR_HEIGHT = 50;

export default () => {
  let win: BrowserWindow | undefined;

  /** pluginSetting.single 非 false 时同一插件仅保留一个分离窗；key 为插件 `name` */
  const singleDetachWindowByPlugin = new Map<string, BrowserWindow>();

  const getExistingDetachWindow = (
    pluginName: string
  ): BrowserWindow | undefined => {
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
    await createWindow(
      pluginInfo,
      viewInfo,
      view,
      !!allowMultipleDetachWindows
    );
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
        webSecurity: true,
        backgroundThrottling: false,
        contextIsolation: true,
        sandbox: true,
        webviewTag: false,
        devTools: true,
        nodeIntegration: false,
        navigateOnDragDrop: false,
        preload: path.join(__dirname, '../../preload/detach.js'),
        spellcheck: false,
      },
    });

    if (!allowMultipleDetachWindows && pluginKey) {
      singleDetachWindowByPlugin.set(pluginKey, createWin);
    }

    const detachFile = `file://${path.join(__static, './detach/index.html')}`;
    const detachUrl = devSubAppHttpUrl(DEV_APP_PORTS.detach, '/') ?? detachFile;
    secureWebContentsNavigation(createWin.webContents, detachUrl);
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
      if (!view.webContents.isDestroyed()) view.webContents.close();
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
      if (!view.webContents.isDestroyed()) view.webContents.focus();
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
      const presentation = presentPlugin(pluginInfo as Record<string, unknown>);
      createWin.webContents.executeJavaScript(
        `window.initDetach(${JSON.stringify(presentation)})`
      );
      const detachInput = (
        pluginInfo as {
          detachInput?: { visible?: boolean; value?: string };
        }
      ).detachInput;
      const subVal = String(detachInput?.value ?? '');
      if (detachInput?.visible && subVal) {
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

    const sendDevToolsState = (opened: boolean) => {
      if (createWin.isDestroyed() || createWin.webContents.isDestroyed()) {
        return;
      }
      createWin.webContents.send('detach:devtools-state', opened);
    };
    view.webContents.on('devtools-opened', () => sendDevToolsState(true));
    view.webContents.on('devtools-closed', () => sendDevToolsState(false));

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

  const windowFromSender = (sender: Electron.WebContents) => {
    const w = BrowserWindow.fromWebContents(sender);
    return w && !w.isDestroyed() ? w : null;
  };
  const pluginContents = (w: BrowserWindow) => {
    const contents = w.getBrowserView()?.webContents;
    return contents && !contents.isDestroyed() ? contents : null;
  };

  for (const channel of [
    'detach:set-pinned',
    'detach:toggle-devtools',
    'detach:get-devtools-state',
    'detach:open-plugin-menu',
    'detach:focus-plugin',
  ]) {
    try {
      ipcMain.removeHandler(channel);
    } catch {
      /* first registration */
    }
  }

  ipcMain.handle('detach:set-pinned', (event, pinned: unknown) => {
    const w = windowFromSender(event.sender);
    if (!w) return false;
    w.setAlwaysOnTop(pinned === true);
    return true;
  });

  ipcMain.handle('detach:get-devtools-state', (event) => {
    const w = windowFromSender(event.sender);
    return !!(w && pluginContents(w)?.isDevToolsOpened());
  });

  ipcMain.handle('detach:toggle-devtools', (event) => {
    const w = windowFromSender(event.sender);
    const contents = w && pluginContents(w);
    if (!contents) return false;
    const shouldOpen = !contents.isDevToolsOpened();
    if (shouldOpen) contents.openDevTools({ mode: 'detach' });
    else contents.closeDevTools();
    event.sender.send('detach:devtools-state', shouldOpen);
    return shouldOpen;
  });

  ipcMain.handle('detach:focus-plugin', (event) => {
    const w = windowFromSender(event.sender);
    const contents = w && pluginContents(w);
    if (!contents) return false;
    contents.focus();
    return true;
  });

  ipcMain.handle('detach:open-plugin-menu', (event, rawInfo: unknown) => {
    const w = windowFromSender(event.sender);
    if (!w || !rawInfo || typeof rawInfo !== 'object') return false;
    const source = rawInfo as Record<string, unknown>;
    const info = {
      name: typeof source.name === 'string' ? source.name : '',
      pluginName:
        typeof source.pluginName === 'string' ? source.pluginName : '',
      version: typeof source.version === 'string' ? source.version : '',
      description:
        typeof source.description === 'string' ? source.description : '',
      detachInputCapability: normalizeDetachInputCapability(
        source.detachInputCapability
      ),
    };
    const canConfigure =
      !!info.name && info.name !== 'flick-system-super-panel';
    const config = canConfigure
      ? readPluginFlickConfigSync(info.name)
      : { autoDetach: false, detachInputPolicy: 'auto' as const };
    const zoom = (action: 'in' | 'out' | 'reset') => {
      const contents = pluginContents(w);
      if (!contents) return;
      const current = contents.getZoomFactor();
      if (action === 'in')
        contents.setZoomFactor(
          Math.min(3, Math.round((current + 0.1) * 100) / 100)
        );
      else if (action === 'out')
        contents.setZoomFactor(
          Math.max(0.5, Math.round((current - 0.1) * 100) / 100)
        );
      else contents.setZoomFactor(1);
    };
    const template: Electron.MenuItemConstructorOptions[] = [
      {
        label: '关于插件应用',
        click: () => {
          const lines = [
            info.pluginName || info.name,
            info.version ? `版本：${info.version}` : '',
            info.description,
          ].filter(Boolean);
          dialog.showMessageBoxSync(w, {
            type: 'info',
            title: '关于插件应用',
            message: lines[0] || info.name,
            detail: lines.slice(1).join('\n') || undefined,
            buttons: ['确定'],
            noLink: true,
          });
        },
      },
    ];
    if (canConfigure) {
      template.push({
        label: '插件应用设置',
        submenu: [
          {
            label: '自动分离为独立窗口',
            type: 'checkbox',
            checked: !!config.autoDetach,
            click: () => void flipPluginAutoDetachSync(info.name),
          },
          {
            ...(info.detachInputCapability === 'required'
              ? {
                  label: '标题栏输入框（插件需要）',
                  type: 'checkbox' as const,
                  checked: true,
                  enabled: false,
                }
              : {
                  label: '始终显示标题栏输入框',
                  type: 'checkbox' as const,
                  checked: config.detachInputPolicy === 'always',
                  visible: info.detachInputCapability === 'optional',
                  click: () => {
                    const policy = flipPluginDetachInputPolicySync(info.name);
                    if (!event.sender.isDestroyed()) {
                      event.sender.send('detach:input-policy', policy);
                    }
                  },
                }),
          },
        ],
      });
    }
    template.push({
      label: '缩放比例',
      submenu: [
        { label: '放大', click: () => zoom('in') },
        { label: '缩小', click: () => zoom('out') },
        { label: '重置为 100%', click: () => zoom('reset') },
      ],
    });
    Menu.buildFromTemplate(template).popup({ window: w });
    return true;
  });

  return {
    init,
    getWindow,
    getExistingDetachWindow,
  };
};
