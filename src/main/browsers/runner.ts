import { app, BrowserView, BrowserWindow, session } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import commonConst from '../../common/utils/commonConst';
import localConfig from '@/main/common/initLocalConfig';
import { WINDOW_HEIGHT, WINDOW_PLUGIN_HEIGHT } from '@/common/constans/common';
import { applyMainWindowContentHeight } from '@/main/common/mainWindowContentResize';
import {
  DEV_APP_PORTS,
  devSubAppHttpUrl,
} from '@/main/common/devSubAppServers';
import { secureWebContentsNavigation } from '@/main/common/navigationSecurity';
import { registerFeatureBridgeIpc } from '@/main/common/featureBridgeIpc';
import { installImageProtocol } from '@/main/common/imageProtocolService';
import { windowGeometryController } from '@/main/common/windowGeometryController';
import {
  isFlickFeaturePlugin,
  isFlickSuperPanelPlugin,
  normalizeRubickRuntimePlugin,
  rubickRuntimePluginName,
} from '@/compat/rubick/runtime';
import { resolveInstalledPluginRoot } from '@/main/common/pluginStorage';

/** 通用插件 API 的编译后 preload；脚本自身会跳过 DevTools 与子 frame。 */
function flickSessionPreloadPath(): string {
  return path.join(app.getAppPath(), 'dist', 'preload', 'plugin.js');
}

const registeredSessionPreloads = new WeakMap<Electron.Session, string>();
const PLUGIN_NAME_RE = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i;

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

function isPathInside(root: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return (
    relative === '' ||
    (!relative.startsWith(`..${path.sep}`) &&
      relative !== '..' &&
      !path.isAbsolute(relative))
  );
}

function assertSafePluginEntryUrl(
  rawUrl: string,
  plugin: { name?: unknown; tplPath?: unknown }
): void {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Plugin entry URL is invalid');
  }

  if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
    const isLoopback = ['localhost', '127.0.0.1', '::1'].includes(
      parsed.hostname
    );
    if (
      commonConst.dev() &&
      isLoopback &&
      !parsed.username &&
      !parsed.password
    ) {
      return;
    }
    throw new Error('Node-enabled plugin views cannot load remote URLs');
  }

  if (parsed.protocol !== 'file:') {
    throw new Error(`Plugin entry protocol is not allowed: ${parsed.protocol}`);
  }

  const name = typeof plugin.name === 'string' ? plugin.name : '';
  if (!PLUGIN_NAME_RE.test(name) || name.length > 214) {
    throw new Error('Plugin name is invalid');
  }
  const entryPath = fileURLToPath(parsed);
  const allowedRoot =
    name === 'flick-system-feature'
      ? path.join(__static, 'feature')
      : name === 'flick-system-super-panel'
        ? path.join(__static, 'superx')
        : plugin.tplPath
          ? path.join(__static, 'tpl')
          : resolveInstalledPluginRoot(name);
  if (!isPathInside(allowedRoot, entryPath)) {
    throw new Error('Plugin entry is outside its allowed directory');
  }
}

const getRelativePath = (indexPath) => {
  return commonConst.windows()
    ? indexPath.replace('file://', '')
    : indexPath.replace('file:', '');
};

const getPreloadPath = (plugin, pluginIndexPath) => {
  const { preload, tplPath, indexPath } = plugin;
  if (!preload) return;
  if (isFlickSuperPanelPlugin(plugin)) {
    return path.join(__static, 'superx', preload || 'preload.js');
  }
  // 子项目走 Vite 时 indexPath 为 http://，不可用 path.resolve 相对其推导 preload，须固定磁盘路径
  if (isFlickFeaturePlugin(plugin)) {
    return path.join(__static, 'feature', preload || 'preload.js');
  }
  if (tplPath) {
    return path.resolve(getRelativePath(indexPath), `./`, preload);
  }
  return path.resolve(getRelativePath(pluginIndexPath), `../`, preload);
};

export default () => {
  let view;

  const layoutView = (
    window: BrowserWindow,
    targetView: BrowserView,
    pluginSetting?: { height?: number }
  ) => {
    const height = pluginSetting?.height || WINDOW_PLUGIN_HEIGHT;
    applyMainWindowContentHeight(window, height);
    const { width } = window.getContentBounds();
    targetView.setBounds({
      x: 0,
      y: WINDOW_HEIGHT,
      width,
      height: height - WINDOW_HEIGHT,
    });
    targetView.setAutoResize({ width: true, height: true });
  };

  const viewReadyFn = async (window, { ext }) => {
    if (!view) return;
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
    plugin = normalizeRubickRuntimePlugin(plugin);
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

      if (!isFlickFeaturePlugin(plugin)) {
        require('@electron/remote/main').enable(view.webContents);
      }
    }
  };

  const createView = (plugin, window: BrowserWindow) => {
    plugin = normalizeRubickRuntimePlugin(plugin);
    const { tplPath, indexPath, development, main = 'index.html' } = plugin;
    const name = rubickRuntimePluginName(plugin);
    const runtimePlugin = { ...plugin, name };
    let pluginIndexPath = tplPath || indexPath;
    let preloadPath;
    // 开发环境
    if (commonConst.dev() && development) {
      pluginIndexPath = development;
      const pluginPath = resolveInstalledPluginRoot(name);
      preloadPath = `file://${path.join(pluginPath, './', main)}`;
    }
    // 系统插件入口由主进程权威决定，不能信任历史记录或渲染进程携带的旧 URL。
    if (isFlickFeaturePlugin(runtimePlugin)) {
      pluginIndexPath = `file://${__static}/feature/index.html`;
    }
    if (isFlickSuperPanelPlugin(runtimePlugin)) {
      pluginIndexPath = `file://${path.join(__static, 'superx', main)}`;
    }
    if (!pluginIndexPath) {
      const pluginPath = resolveInstalledPluginRoot(name);
      pluginIndexPath = `file://${path.join(pluginPath, './', main)}`;
    }
    if (isFlickFeaturePlugin(runtimePlugin)) {
      const h = devSubAppHttpUrl(DEV_APP_PORTS.feature, '/');
      if (h) pluginIndexPath = h;
    } else if (isFlickSuperPanelPlugin(runtimePlugin)) {
      const h = devSubAppHttpUrl(DEV_APP_PORTS.superxWeb, `/${main}`);
      if (h) pluginIndexPath = h;
    }
    assertSafePluginEntryUrl(pluginIndexPath, runtimePlugin);
    const secureFeature = isFlickFeaturePlugin(runtimePlugin);
    const preload = secureFeature
      ? path.join(app.getAppPath(), 'dist', 'preload', 'feature.js')
      : getPreloadPath(runtimePlugin, preloadPath || pluginIndexPath);

    const ses = session.fromPartition('<' + name + '>');
    installImageProtocol(ses);
    if (!secureFeature) ensureSessionPreload(ses);

    view = new BrowserView({
      webPreferences: {
        webSecurity: secureFeature,
        nodeIntegration: !secureFeature,
        contextIsolation: secureFeature,
        sandbox: secureFeature,
        devTools: true,
        webviewTag: !secureFeature,
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
    if (secureFeature) registerFeatureBridgeIpc(view.webContents);
    const createdView = view;
    createdView.webContents.on(
      'did-fail-load',
      (_event, code, description, url, isMainFrame) => {
        if (!isMainFrame) return;
        console.error(
          `[plugin-view] failed to load ${url}: ${code} ${description}`
        );
      }
    );
    createdView.webContents.on('render-process-gone', (_event, details) => {
      console.error('[plugin-view] renderer exited:', name, details);
    });
    createdView.webContents.on('console-message', (details) => {
      if (details.level !== 'warning' && details.level !== 'error') return;
      console.warn(
        `[plugin-view:${String(name)}] ${details.level}: ${details.message}`
      );
    });
    window.setBrowserView(view);
    windowGeometryController.setPluginViewActive(window, true);
    layoutView(window, view, plugin.pluginSetting);
    secureWebContentsNavigation(view.webContents, pluginIndexPath);
    view.webContents.loadURL(pluginIndexPath);
    view.webContents.once('dom-ready', () => {
      void viewReadyFn(window, plugin);
      if (
        secureFeature &&
        process.env.FLICK_FEATURE_SMOKE === '1' &&
        !createdView.webContents.isDestroyed()
      ) {
        void createdView.webContents
          .executeJavaScript(
            `({
            flickBridge: typeof window.flick === 'object',
            marketBridge: typeof window.market === 'object',
            nodeRequireType: typeof window.require,
            renderedText: document.body.innerText.slice(0, 300)
          })`
          )
          .then((result) => {
            const preferences = createdView.webContents.getLastWebPreferences();
            const secure =
              result.flickBridge === true &&
              result.marketBridge === true &&
              result.nodeRequireType === 'undefined' &&
              preferences.contextIsolation === true &&
              preferences.nodeIntegration === false &&
              preferences.sandbox === true &&
              preferences.webSecurity === true;
            const report = { secure, preferences, result };
            const method = secure ? console.info : console.error;
            method(
              `[flick-system-feature] smoke ${secure ? 'passed' : 'failed'}:`,
              JSON.stringify(report)
            );
          })
          .catch((error) => {
            console.error('[flick-system-feature] smoke failed:', error);
          });
      }
    });
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
        const responseHeaders = { ...details.responseHeaders };
        const hasCorsHeader = Object.keys(responseHeaders).some(
          (key) => key.toLowerCase() === 'access-control-allow-origin'
        );
        if (!hasCorsHeader) {
          responseHeaders['Access-Control-Allow-Origin'] = ['*'];
        }
        callback({
          responseHeaders,
        });
      }
    );
  };

  const removeView = (window: BrowserWindow, resetRenderer = true) => {
    if (!view) {
      if (resetRenderer) {
        windowGeometryController.setPluginViewActive(window, false);
      }
      return;
    }
    if (view.inDetach) {
      view = undefined;
      if (resetRenderer) {
        windowGeometryController.setPluginViewActive(window, false);
      }
      return;
    }
    executeHooks('PluginOut', null);
    const snapshotView = view;

    /**
     * 先同步释放 runner 槽位和 BrowserWindow 绑定，再延后销毁 webContents。
     * 超级面板会在同一个 IPC tick 内 remove -> init；若把释放也放进
     * setTimeout，新插件会被误判为“已有 view”，随后旧清理还会重置主页。
     */
    if (window.getBrowserView?.() === snapshotView) {
      window.setBrowserView(null);
    }
    if (view === snapshotView) {
      view = undefined;
      if (resetRenderer) {
        windowGeometryController.setPluginViewActive(window, false);
        void window.webContents?.executeJavaScript(`window.initFlick()`);
      }
    }

    setTimeout(() => {
      if (!snapshotView.webContents?.isDestroyed()) {
        snapshotView.webContents.destroy();
      }
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
