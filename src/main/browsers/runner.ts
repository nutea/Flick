import { app, BrowserView, BrowserWindow, session } from 'electron';
import path from 'path';
import commonConst from '../../common/utils/commonConst';
import { PLUGIN_INSTALL_DIR as baseDir } from '@/common/constans/main';
import localConfig from '@/main/common/initLocalConfig';
import {
  WINDOW_HEIGHT,
  WINDOW_PLUGIN_HEIGHT,
  WINDOW_WIDTH,
} from '@/common/constans/common';
import { applyMainWindowContentHeight } from '@/main/common/mainWindowContentResize';
import { DEV_APP_PORTS, devSubAppHttpUrl } from '@/main/common/devSubAppServers';

/** 与主窗口 webPreferences.preload 一致：须为 electron-vite 产物；勿用 public/preload.js（裸 require @electron/remote 在 session preload 中会解析失败） */
function flickSessionPreloadPath(): string {
  return path.join(app.getAppPath(), 'dist', 'preload', 'index.js');
}

const registeredSessionPreloads = new WeakMap<Electron.Session, string>();

function ensureSessionPreload(ses: Electron.Session): void {
  const filePath = flickSessionPreloadPath();
  if (typeof ses.registerPreloadScript === 'function') {
    if (registeredSessionPreloads.has(ses)) return;
    const id = ses.registerPreloadScript({ type: 'frame', filePath });
    registeredSessionPreloads.set(ses, id);
    return;
  }
  ses.setPreloads([filePath]);
}

const getRelativePath = (indexPath) => {
  return commonConst.windows()
    ? indexPath.replace('file://', '')
    : indexPath.replace('file:', '');
};

const getPreloadPath = (plugin, pluginIndexPath) => {
  const { name, preload, tplPath, indexPath } = plugin;
  if (!preload) return;
  if (name === 'flick-system-super-panel') {
    return path.join(__static, 'superx', preload || 'preload.js');
  }
  // 子项目走 Vite 时 indexPath 为 http://，不可用 path.resolve 相对其推导 preload，须固定磁盘路径
  if (name === 'flick-system-feature') {
    return path.join(__static, 'feature', preload || 'preload.js');
  }
  if (tplPath) {
    return path.resolve(getRelativePath(indexPath), `./`, preload);
  }
  return path.resolve(getRelativePath(pluginIndexPath), `../`, preload);
};

const viewPoolManager = () => {
  const viewPool: any = {
    views: [],
  };
  const maxLen = 4;
  return {
    getView(pluginName) {
      return viewPool.views.find((view) => view.pluginName === pluginName);
    },
    addView(pluginName, view) {
      if (this.getView(pluginName)) return;
      if (viewPool.views.length > maxLen) {
        viewPool.views.shift();
      }
      viewPool.views.push({
        pluginName,
        view,
      });
    },
  };
};

export default () => {
  let view;
  const viewInstance = viewPoolManager();

  const viewReadyFn = async (window, { pluginSetting, ext }) => {
    if (!view) return;
    const height = pluginSetting && pluginSetting.height;
    applyMainWindowContentHeight(window, height || WINDOW_PLUGIN_HEIGHT);
    view.setBounds({
      x: 0,
      y: WINDOW_HEIGHT,
      width: WINDOW_WIDTH,
      height: height || WINDOW_PLUGIN_HEIGHT - WINDOW_HEIGHT,
    });
    view.setAutoResize({ width: true, height: true });
    executeHooks('PluginEnter', ext);
    executeHooks('PluginReady', ext);
    const config = await localConfig.getConfig();
    const darkMode = config.perf.common.darkMode;
    darkMode &&
      view.webContents.executeJavaScript(
        `document.body.classList.add("dark");window.flick.theme="dark"`
      );
    window.webContents.executeJavaScript(`window.pluginLoaded()`);
  };

  const init = (plugin, window: BrowserWindow) => {
    if (
      view == null ||
      view.inDetach ||
      !view.webContents ||
      view.webContents.isDestroyed()
    ) {
      createView(plugin, window);
      // if (viewInstance.getView(plugin.name) && !commonConst.dev()) {
      //   view = viewInstance.getView(plugin.name).view;
      //   window.setBrowserView(view);
      //   view.inited = true;
      //   viewReadyFn(window, plugin);
      // } else {
      //   createView(plugin, window);
      //   viewInstance.addView(plugin.name, view);
      // }
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require('@electron/remote/main').enable(view.webContents);
    }
  };

  const createView = (plugin, window: BrowserWindow) => {
    const {
      tplPath,
      indexPath,
      development,
      name,
      main = 'index.html',
      pluginSetting,
      ext,
    } = plugin;
    let pluginIndexPath = tplPath || indexPath;
    let preloadPath;
    let darkMode;
    // 开发环境
    if (commonConst.dev() && development) {
      pluginIndexPath = development;
      const pluginPath = path.resolve(baseDir, 'node_modules', name);
      preloadPath = `file://${path.join(pluginPath, './', main)}`;
    }
    // 再尝试去找
    if (plugin.name === 'flick-system-feature' && !pluginIndexPath) {
      pluginIndexPath = `file://${__static}/feature/index.html`;
    }
    if (plugin.name === 'flick-system-super-panel' && !pluginIndexPath) {
      pluginIndexPath = `file://${path.join(__static, 'superx', main)}`;
    }
    if (!pluginIndexPath) {
      const pluginPath = path.resolve(baseDir, 'node_modules', name);
      pluginIndexPath = `file://${path.join(pluginPath, './', main)}`;
    }
    if (name === 'flick-system-feature') {
      const h = devSubAppHttpUrl(DEV_APP_PORTS.feature, '/');
      if (h) pluginIndexPath = h;
    } else if (name === 'flick-system-super-panel') {
      const h = devSubAppHttpUrl(DEV_APP_PORTS.superxWeb, `/${main}`);
      if (h) pluginIndexPath = h;
    }
    const preload = getPreloadPath(plugin, preloadPath || pluginIndexPath);

    const ses = session.fromPartition('<' + name + '>');
    ensureSessionPreload(ses);

    view = new BrowserView({
      webPreferences: {
        webSecurity: false,
        nodeIntegration: true,
        contextIsolation: false,
        devTools: true,
        webviewTag: true,
        preload,
        session: ses,
        defaultFontSize: 14,
        defaultFontFamily: {
          standard: 'system-ui',
          serif: 'system-ui',
        },
        spellcheck: false,
      },
    });
    window.setBrowserView(view);
    view.webContents.loadURL(pluginIndexPath);
    view.webContents.once('dom-ready', () => viewReadyFn(window, plugin));
    // 修复请求跨域问题
    view.webContents.session.webRequest.onBeforeSendHeaders(
      (details, callback) => {
        callback({
          requestHeaders: { referer: '*', ...details.requestHeaders },
        });
      }
    );

    view.webContents.session.webRequest.onHeadersReceived(
      (details, callback) => {
        callback({
          responseHeaders: {
            'Access-Control-Allow-Origin': ['*'],
            ...details.responseHeaders,
          },
        });
      }
    );
  };

  const removeView = (window: BrowserWindow) => {
    if (!view) return;
    if (view.inDetach) {
      view = undefined;
      return;
    }
    executeHooks('PluginOut', null);
    const snapshotView = view;
    setTimeout(() => {
      const currentView = window.getBrowserView?.();
      window.removeBrowserView(snapshotView);

      if (currentView === snapshotView) {
        window.setBrowserView(null);
        if (view === snapshotView) {
          window.webContents?.executeJavaScript(`window.initFlick()`);
          view = undefined;
        }
      }
      snapshotView.webContents?.destroy();
    }, 0);
  };

  const getView = () => view;

  const executeHooks = (hook, data) => {
    if (!view) return;
    const evalJs = `if(window.flick && window.flick.hooks && typeof window.flick.hooks.on${hook} === 'function' ) {
          try {
            window.flick.hooks.on${hook}(${data ? JSON.stringify(data) : ''});
          } catch(e) {}
        }
      `;
    view.webContents?.executeJavaScript(evalJs);
  };

  return {
    init,
    getView,
    removeView,
    executeHooks,
  };
};
