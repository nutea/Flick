import {
  BrowserWindow,
  ipcMain,
  dialog,
  app,
  Notification,
  nativeImage,
  clipboard,
  screen,
  shell,
  IpcMainEvent,
} from 'electron';
import fs from 'fs';
import { screenCapture } from '@/core';
import plist from 'plist';
import { input } from 'flick-native';

import {
  DECODE_KEY,
  PLUGIN_INSTALL_DIR as baseDir,
} from '@/common/constans/main';
import getCopyFiles from '@/common/utils/getCopyFiles';
import common from '@/common/utils/commonConst';

import mainInstance from '../index';
import { runner, detach } from '../browsers';
import DBInstance from './db';
import getWinPosition from './getWinPosition';
import path from 'path';
import commonConst from '@/common/utils/commonConst';
import { copyFilesToWindowsClipboard } from './windowsClipboard';
import {
  exportPluginBundle,
  getExportDefaultFilename,
  importPluginBundle,
} from './pluginBundle';
import { applyMainWindowContentHeight } from './mainWindowContentResize';
import {
  readPluginFlickConfigSync,
  writePluginFlickConfigSync,
  flipPluginAutoDetachSync,
  flipPluginDetachAlwaysShowSearchSync,
} from './pluginFlickConfig';
import { executePluginSubInputChangeHook } from './pluginSubInputHook';
import {
  DEV_APP_PORTS,
  devSubAppHttpUrl,
  warmupDevSubAppServers,
} from './devSubAppServers';

/**
 *  sanitize input files 剪贴板文件合法性校验
 * @param input
 * @returns
 */
const sanitizeInputFiles = (input: unknown): string[] => {
  const candidates = Array.isArray(input)
    ? input
    : typeof input === 'string'
      ? [input]
      : [];
  return candidates
    .map((filePath) => (typeof filePath === 'string' ? filePath.trim() : ''))
    .filter((filePath) => {
      if (!filePath) return false;
      try {
        return fs.existsSync(filePath);
      } catch {
        return false;
      }
    });
};

const runnerInstance = runner();
const detachInstance = detach();

/** 与超级面板插件 node main、feature 设置页 dbStorage._id 一致 */
const SUPER_PANEL_HOTKEY_STORE_ID = 'flick-system-super-panel-store';

class API extends DBInstance {
  public async dbPut(arg: any) {
    const result = await super.dbPut(arg);
    const doc = arg?.data?.data;
    if (doc && doc._id === SUPER_PANEL_HOTKEY_STORE_ID) {
      const g = globalThis as typeof globalThis & {
        __superPanelReregister?: () => void;
      };
      if (typeof g.__superPanelReregister === 'function') {
        try {
          g.__superPanelReregister();
        } catch (err) {
          console.error('[flick-system-super-panel] hot reload failed:', err);
        }
      }
    }
    return result;
  }

  init(mainWindow: BrowserWindow) {
    const flickIpcChannels = [
      'flick:get-plugin-flick-config',
      'flick:set-plugin-flick-config',
      'flick:flip-plugin-auto-detach',
      'flick:flip-plugin-detach-always-show-search',
      'flick:detach-adjust-plugin-zoom',
    ] as const;
    for (const ch of flickIpcChannels) {
      try {
        ipcMain.removeHandler(ch);
      } catch {
        /* 首次启动 */
      }
    }
    ipcMain.handle(
      'flick:get-plugin-flick-config',
      (_e, pluginName: unknown) => {
        const name = typeof pluginName === 'string' ? pluginName : '';
        if (!name) return { autoDetach: false, detachAlwaysShowSearch: false };
        const cfg = readPluginFlickConfigSync(name);
        return {
          autoDetach: !!cfg.autoDetach,
          detachAlwaysShowSearch: !!cfg.detachAlwaysShowSearch,
        };
      }
    );
    ipcMain.handle(
      'flick:set-plugin-flick-config',
      (_e, payload: unknown) => {
        const p = payload as {
          name?: string;
          pluginName?: string;
          autoDetach?: boolean;
          detachAlwaysShowSearch?: boolean;
        };
        const id =
          typeof p?.name === 'string'
            ? p.name
            : typeof p?.pluginName === 'string'
              ? p.pluginName
              : '';
        if (!id) return false;
        const patch: Record<string, boolean> = {};
        if (typeof p.autoDetach === 'boolean') patch.autoDetach = p.autoDetach;
        if (typeof p.detachAlwaysShowSearch === 'boolean')
          patch.detachAlwaysShowSearch = p.detachAlwaysShowSearch;
        if (!Object.keys(patch).length) return false;
        return writePluginFlickConfigSync(id, patch);
      }
    );
    ipcMain.handle(
      'flick:flip-plugin-auto-detach',
      (_e, pluginName: unknown) => {
        const name = typeof pluginName === 'string' ? pluginName : '';
        if (!name) return { autoDetach: false };
        return { autoDetach: flipPluginAutoDetachSync(name) };
      }
    );
    ipcMain.handle(
      'flick:flip-plugin-detach-always-show-search',
      (_e, pluginName: unknown) => {
        const name = typeof pluginName === 'string' ? pluginName : '';
        if (!name) return { detachAlwaysShowSearch: false };
        return {
          detachAlwaysShowSearch: flipPluginDetachAlwaysShowSearchSync(name),
        };
      }
    );
    ipcMain.handle(
      'flick:detach-adjust-plugin-zoom',
      (_e, payload: unknown) => {
        const p = payload as { action?: string; winId?: number };
        if (typeof p?.winId !== 'number') return false;
        return this.detachAdjustPluginZoom(
          { data: { action: p.action }, winId: p.winId },
          mainWindow,
          undefined
        );
      }
    );
    try {
      ipcMain.removeHandler('flick:try-redirect-singleton-detach');
    } catch {
      /* 首次启动 */
    }
    ipcMain.handle(
      'flick:try-redirect-singleton-detach',
      (_e, pluginPayload: unknown) =>
        this.tryRedirectSingletonDetach({ data: pluginPayload }, mainWindow)
    );
    try {
      ipcMain.removeHandler('msg-trigger-async');
    } catch {
      /* 首次启动 */
    }
    ipcMain.handle('msg-trigger-async', async (_event, arg) => {
      const window = arg.winId ? BrowserWindow.fromId(arg.winId) : mainWindow;
      return this[arg.type](arg, window, undefined);
    });
    // 响应 preload.js 事件
    ipcMain.on('msg-trigger', async (event, arg) => {
      const window = arg.winId ? BrowserWindow.fromId(arg.winId) : mainWindow;
      const data = await this[arg.type](arg, window, event);
      event.returnValue = data;
      // event.sender.send(`msg-back-${arg.type}`, data);
    });
    // 按 ESC 退出插件
    mainWindow.webContents.on('before-input-event', (event, input) =>
      this.__EscapeKeyDown(event, input, mainWindow)
    );
    // 设置主窗口的 show/hide 事件监听
    this.setupMainWindowHooks(mainWindow);
  }

  private setupMainWindowHooks(mainWindow: BrowserWindow) {
    mainWindow.on('show', () => {
      // 触发插件的 onShow hook
      runnerInstance.executeHooks('Show', null);
    });

    mainWindow.on('hide', () => {
      // 触发插件的 onHide hook
      runnerInstance.executeHooks('Hide', null);
    });
  }

  public getCurrentWindow = (window, e) => {
    let originWindow = BrowserWindow.fromWebContents(e.sender);
    if (originWindow !== window)
      originWindow = detachInstance.getWindow() ?? null;
    return originWindow;
  };

  public __EscapeKeyDown = (event, input, window) => {
    if (input.type !== 'keyDown') return;
    if (!(input.meta || input.control || input.shift || input.alt)) {
      if (input.key === 'Escape') {
        if (this.currentPlugin) {
          this.removePlugin(null, window);
        } else {
          mainInstance.windowCreator.getWindow().hide();
        }
      }

      return;
    }
  };

  public windowMoving({ data: { mouseX, mouseY, width, height } }, window, e) {
    const { x, y } = screen.getCursorScreenPoint();
    const originWindow = this.getCurrentWindow(window, e);
    if (!originWindow) return;
    const nx = x - mouseX;
    const ny = y - mouseY;
    originWindow.setContentBounds({ x: nx, y: ny, width, height });
    getWinPosition.setPosition(nx, ny);
  }

  public async loadPlugin({ data: plugin }, window) {
    if (this.tryRedirectSingletonDetach({ data: plugin }, window)) {
      return;
    }
    if (this.isSingletonAlreadyInMainWindow(plugin)) {
      window.show();
      return;
    }
    /** 与 preload 内联脚本同一 tick：先快照再 loadPlugin，避免仅走主进程打开时读不到启动关键词 */
    void window.webContents.executeJavaScript(
      `if (window.captureSearchSnapshotForNextDetach) window.captureSearchSnapshotForNextDetach();
void window.loadPlugin(${JSON.stringify(plugin)});`
    );
    await this.openPlugin({ data: plugin }, window);
  }

  /**
   * 单例且已存在分离窗时：应改走分离窗而不在主窗口再开插件（含已开「自动分离」的情形）。
   * 须在 loadPlugin 的 executeJavaScript 之前调用，否则渲染层会先 currentPlugin + 主进程 runner.init。
   */
  public tryRedirectSingletonDetach(
    { data: plugin }: { data?: unknown },
    window: BrowserWindow
  ): boolean {
    const p = plugin as {
      name?: string;
      originName?: string;
      platform?: string[];
      pluginSetting?: { single?: boolean };
    };
    const candidates = Array.from(
      new Set(
        [p?.originName, p?.name].filter(
          (x): x is string => typeof x === 'string' && x.length > 0
        )
      )
    );
    if (!candidates.length) return false;
    if (p.platform && !p.platform.includes(process.platform)) {
      return false;
    }
    const singleton = p.pluginSetting?.single !== false;
    if (!singleton) return false;

    let existing: BrowserWindow | undefined;
    let mapKey: string | undefined;
    for (const c of candidates) {
      const w = detachInstance.getExistingDetachWindow(c);
      if (w && !w.isDestroyed()) {
        existing = w;
        mapKey = c;
        break;
      }
    }
    if (!existing || !mapKey) return false;

    void this.redirectMainLaunchToSingletonDetach(
      window,
      existing,
      p as { ext?: { payload?: unknown } }
    );
    return true;
  }

  /**
   * 主页搜索框为空时，用本次打开插件的 ext.payload 补全（超级面板选中文本 / 文件路径等不经主页搜索框）。
   */
  private mergeMainInputWithPluginExt(
    mainInput: { value?: string; placeholder?: string } | null | undefined,
    plugin: { ext?: { payload?: unknown } } | null | undefined
  ): { value: string; placeholder: string } {
    let value = String(mainInput?.value ?? '');
    const placeholder = String(mainInput?.placeholder ?? '');
    if (value) {
      return { value, placeholder };
    }
    const payload = plugin?.ext?.payload;
    if (typeof payload === 'string') {
      value = payload;
    } else if (typeof payload === 'number' && !Number.isNaN(payload)) {
      value = String(payload);
    } else if (
      payload &&
      typeof payload === 'object' &&
      'path' in payload &&
      typeof (payload as { path?: unknown }).path === 'string'
    ) {
      value = (payload as { path: string }).path;
    } else if (
      payload &&
      typeof payload === 'object' &&
      'text' in payload &&
      typeof (payload as { text?: unknown }).text === 'string'
    ) {
      value = (payload as { text: string }).text;
    }
    return { value, placeholder };
  }

  /**
   * 单例插件已在主窗口运行时返回 true，防止 removePlugin + init 破坏当前实例。
   */
  private isSingletonAlreadyInMainWindow(plugin: {
    name?: string;
    originName?: string;
    pluginSetting?: { single?: boolean };
  }): boolean {
    if (plugin.pluginSetting?.single === false) return false;
    if (!this.currentPlugin) return false;
    const currentName =
      this.currentPlugin.originName || this.currentPlugin.name;
    if (!currentName) return false;
    const incoming = [plugin.originName, plugin.name].filter(
      (x): x is string => typeof x === 'string' && x.length > 0
    );
    return incoming.some((n) => n === currentName);
  }

  public async openPlugin({ data: plugin }, window) {
    await warmupDevSubAppServers();
    if (plugin.platform && !plugin.platform.includes(process.platform)) {
      return new Notification({
        title: `插件不支持当前 ${process.platform} 系统`,
        body: `插件仅支持 ${plugin.platform.join(',')}`,
        icon: plugin.logo,
      }).show();
    }
    /** 超级面板等直开 openPlugin、不经主页 loadPlugin 的 capture；清掉旧快照，避免 getMainInputInfo 抢先返回非空 value 而忽略 ext.payload */
    const ep = (plugin as { ext?: { payload?: unknown } })?.ext?.payload;
    if (
      (typeof ep === 'string' && ep.length > 0) ||
      (ep &&
        typeof ep === 'object' &&
        !Array.isArray(ep) &&
        'path' in ep &&
        typeof (ep as { path?: unknown }).path === 'string')
    ) {
      void window.webContents.executeJavaScript(
        `window.clearSearchSnapshotAfterDetach && window.clearSearchSnapshotAfterDetach()`
      );
    }
    if (this.tryRedirectSingletonDetach({ data: plugin }, window)) {
      return;
    }
    if (this.isSingletonAlreadyInMainWindow(plugin)) {
      window.show();
      return;
    }
    applyMainWindowContentHeight(window, 60);
    this.removePlugin(null, window);

    // 模板文件
    if (!plugin.main) {
      plugin.tplPath = `file://${__static}/tpl/index.html`;
      const tplHttp = devSubAppHttpUrl(DEV_APP_PORTS.tpl, '/');
      if (tplHttp) plugin.tplPath = tplHttp;
    }
    if (plugin.name === 'flick-system-feature') {
      plugin.logo = plugin.logo || `file://${__static}/logo.png`;
      plugin.indexPath = `file://${__static}/feature/index.html`;
      const featureHttp = devSubAppHttpUrl(DEV_APP_PORTS.feature, '/');
      if (featureHttp) plugin.indexPath = featureHttp;
    } else if (plugin.name === 'flick-system-super-panel') {
      plugin.indexPath = `file://${path.join(__static, 'superx', 'main.html')}`;
      const superxHttp = devSubAppHttpUrl(DEV_APP_PORTS.superxWeb, '/main.html');
      if (superxHttp) plugin.indexPath = superxHttp;
    } else if (!plugin.indexPath) {
      const pluginPath = path.resolve(baseDir, 'node_modules', plugin.name);
      plugin.indexPath = `file://${path.join(
        pluginPath,
        './',
        plugin.main || ''
      )}`;
    }
    runnerInstance.init(plugin, window);
    this.currentPlugin = plugin;
    window.webContents.executeJavaScript(
      `window.setCurrentPlugin(${JSON.stringify({
        currentPlugin: this.currentPlugin,
      })})`
    );
    window.show();
    const view = runnerInstance.getView();
    if (!view.inited) {
      view.webContents.on('before-input-event', (event, input) =>
        this.__EscapeKeyDown(event, input, window)
      );
    }
    this.scheduleAutoDetachIfEnabled(plugin, window);
  }

  /**
   * 单例插件且已有分离窗时：从主页再次打开则把主页搜索内容写入分离窗顶栏并通知插件，清空主页并隐藏主窗口。
   */
  private redirectMainLaunchToSingletonDetach(
    mainWindow: BrowserWindow,
    detachWin: BrowserWindow,
    launchPlugin?: { ext?: { payload?: unknown } }
  ): void {
    void (async () => {
      const info = (await mainWindow.webContents.executeJavaScript(
        `window.getMainInputInfo()`
      )) as { value?: string; placeholder?: string };
      const merged = this.mergeMainInputWithPluginExt(info, launchPlugin);
      const value = merged.value;
      const placeholder = merged.placeholder;
      await mainWindow.webContents.executeJavaScript(
        `window.clearSearchSnapshotAfterDetach && window.clearSearchSnapshotAfterDetach()`
      );
      if (this.currentPlugin) {
        this.removePlugin(null, mainWindow);
      }
      const payload = JSON.stringify({ value, placeholder });
      await detachWin.webContents.executeJavaScript(
        `(() => {
          var p = ${payload};
          if (typeof window.setSubInputValue === 'function') {
            window.setSubInputValue({ value: p.value });
          }
          if (typeof window.setSubInput === 'function') {
            window.setSubInput({ placeholder: p.placeholder });
          }
        })()`
      );
      const bv = detachWin.getBrowserView();
      executePluginSubInputChangeHook(bv?.webContents ?? null, value);
      await mainWindow.webContents.executeJavaScript(`window.initFlick()`);
      applyMainWindowContentHeight(mainWindow, 60);
      mainWindow.hide();
      detachWin.show();
      if (detachWin.isMinimized()) detachWin.restore();
      detachWin.focus();
    })();
  }

  /** 读取合并配置 flick-plugin-ui-settings.json，开启 autoDetach 时在首屏 dom-ready 后自动分离 */
  private scheduleAutoDetachIfEnabled(
    plugin: { name?: string },
    mainWindow: BrowserWindow
  ) {
    const name = plugin?.name;
    if (!name || name === 'flick-system-super-panel') {
      return;
    }
    const view = runnerInstance.getView();
    if (!view?.webContents || view.webContents.isDestroyed()) return;

    const runDetach = () => {
      if (this.currentPlugin?.name !== name) return;
      const cfg = readPluginFlickConfigSync(name);
      if (!cfg.autoDetach) return;
      queueMicrotask(() => {
        if (this.currentPlugin?.name === name) {
          this.detachPlugin(null, mainWindow);
        }
      });
    };

    const wc = view.webContents;
    /** 若 dom-ready 早于本监听注册（缓存秒开等），仅用 once 会漏掉，导致自动分离不再触发 */
    if (wc.isLoading()) {
      wc.once('dom-ready', runDetach);
    } else {
      queueMicrotask(runDetach);
    }
  }

  public getPluginFlickConfig({
    data,
  }: {
    data?: { name?: string; pluginName?: string };
  }) {
    const id =
      typeof data?.name === 'string'
        ? data.name
        : typeof data?.pluginName === 'string'
          ? data.pluginName
          : '';
    if (!id) return { autoDetach: false, detachAlwaysShowSearch: false };
    const cfg = readPluginFlickConfigSync(id);
    return {
      autoDetach: !!cfg.autoDetach,
      detachAlwaysShowSearch: !!cfg.detachAlwaysShowSearch,
    };
  }

  public setPluginFlickConfig({
    data,
  }: {
    data?: {
      name?: string;
      pluginName?: string;
      autoDetach?: boolean;
      detachAlwaysShowSearch?: boolean;
    };
  }) {
    const id =
      typeof data?.name === 'string'
        ? data.name
        : typeof data?.pluginName === 'string'
          ? data.pluginName
          : '';
    const { autoDetach, detachAlwaysShowSearch } = data || {};
    if (!id) return false;
    const patch: Record<string, boolean> = {};
    if (typeof autoDetach === 'boolean') patch.autoDetach = autoDetach;
    if (typeof detachAlwaysShowSearch === 'boolean')
      patch.detachAlwaysShowSearch = detachAlwaysShowSearch;
    if (!Object.keys(patch).length) return false;
    return writePluginFlickConfigSync(id, patch);
  }

  /** 分离窗口内调整插件 BrowserView 缩放（通过 detach 壳 webContents 发 IPC，需带 winId） */
  public detachAdjustPluginZoom(
    arg: { data?: { action?: string }; winId?: number },
    _mainWindow: BrowserWindow,
    event?: IpcMainEvent
  ) {
    const { data, winId } = arg;
    const w = winId
      ? BrowserWindow.fromId(winId)
      : event && BrowserWindow.fromWebContents(event.sender);
    if (!w || w.isDestroyed()) return false;
    const bv = w.getBrowserView();
    if (!bv || bv.webContents.isDestroyed()) return false;
    const wc = bv.webContents;
    const cur = wc.getZoomFactor();
    const act = data?.action;
    if (act === 'in')
      wc.setZoomFactor(Math.min(3, Math.round((cur + 0.1) * 100) / 100));
    else if (act === 'out')
      wc.setZoomFactor(Math.max(0.5, Math.round((cur - 0.1) * 100) / 100));
    else if (act === 'reset') wc.setZoomFactor(1);
    return true;
  }

  public removePlugin(e, window) {
    runnerInstance.removeView(window);
    this.currentPlugin = null;
  }

  public openPluginDevTools(
    _arg: unknown,
    _window: BrowserWindow,
    event?: IpcMainEvent
  ) {
    if (event) {
      const w = BrowserWindow.fromWebContents(event.sender);
      if (w && !w.isDestroyed()) {
        const bv = w.getBrowserView();
        if (bv && !bv.webContents.isDestroyed()) {
          bv.webContents.openDevTools({ mode: 'detach' });
          return;
        }
      }
    }
    const v = runnerInstance.getView();
    if (v && !v.webContents.isDestroyed()) {
      v.webContents.openDevTools({ mode: 'detach' });
    }
  }

  public hideMainWindow(arg, window) {
    window.hide();
  }

  public showMainWindow(arg, window) {
    const { x, y } = getWinPosition.getPosition();
    window.setPosition(x, y);
    window.show();
  }

  public showOpenDialog({ data }, window) {
    return dialog.showOpenDialogSync(window, data);
  }

  public showSaveDialog({ data }, window) {
    return dialog.showSaveDialogSync(window, data);
  }

  public setExpendHeight({ data: height }, window: BrowserWindow, e) {
    const originWindow = this.getCurrentWindow(window, e);
    if (!originWindow) return;
    applyMainWindowContentHeight(originWindow, Number(height));
  }

  public setSubInput({ data }, window, e) {
    const originWindow = this.getCurrentWindow(window, e);
    if (!originWindow) return;
    originWindow.webContents.executeJavaScript(
      `window.setSubInput(${JSON.stringify({
        placeholder: data.placeholder,
      })})`
    );
  }

  public subInputBlur(_arg, window: BrowserWindow) {
    const v = runnerInstance.getView();
    if (
      !v?.webContents ||
      v.webContents.isDestroyed() ||
      window.getBrowserView() !== v
    ) {
      return;
    }
    v.webContents.focus();
  }

  public sendSubInputChangeEvent({ data }) {
    runnerInstance.executeHooks('SubInputChange', data);
  }

  public removeSubInput(data, window, e) {
    const originWindow = this.getCurrentWindow(window, e);
    if (!originWindow) return;
    originWindow.webContents.executeJavaScript(`window.removeSubInput()`);
  }

  public setSubInputValue({ data }, window, e) {
    const originWindow = this.getCurrentWindow(window, e);
    if (!originWindow) return;
    originWindow.webContents.executeJavaScript(
      `window.setSubInputValue(${JSON.stringify({
        value: data.text,
      })})`
    );
    this.sendSubInputChangeEvent({ data });
  }

  public getPath({ data }) {
    return app.getPath(data.name);
  }

  public showNotification({ data: { body } }) {
    if (!Notification.isSupported()) return;
    'string' != typeof body && (body = String(body));
    const plugin = this.currentPlugin;
    const notify = new Notification({
      title: plugin ? plugin.pluginName : null,
      body,
      icon: plugin ? plugin.logo : null,
    });
    notify.show();
  }

  public copyImage = ({ data }) => {
    const image = nativeImage.createFromDataURL(data.img);
    clipboard.writeImage(image);
  };

  public copyText({ data }) {
    clipboard.writeText(String(data.text));
    return true;
  }

  public copyFile({ data }) {
    const targetFiles = sanitizeInputFiles(data?.file);

    if (!targetFiles.length) {
      return false;
    }

    if (process.platform === 'darwin') {
      try {
        clipboard.writeBuffer(
          'NSFilenamesPboardType',
          Buffer.from(plist.build(targetFiles))
        );
        return true;
      } catch {
        return false;
      }
    }

    if (process.platform === 'win32') {
      return copyFilesToWindowsClipboard(targetFiles);
    }

    return false;
  }

  public getFeatures() {
    return this.currentPlugin?.features;
  }

  public setFeature({ data }, window) {
    this.currentPlugin = {
      ...this.currentPlugin,
      features: (() => {
        let has = false;
        this.currentPlugin.features.some((feature) => {
          has = feature.code === data.feature.code;
          return has;
        });
        if (!has) {
          return [...this.currentPlugin.features, data.feature];
        }
        return this.currentPlugin.features;
      })(),
    };
    window.webContents.executeJavaScript(
      `window.updatePlugin(${JSON.stringify({
        currentPlugin: this.currentPlugin,
      })})`
    );
    return true;
  }

  public removeFeature({ data }, window) {
    this.currentPlugin = {
      ...this.currentPlugin,
      features: this.currentPlugin.features.filter((feature) => {
        if (data.code.type) {
          return feature.code.type !== data.code.type;
        }
        return feature.code !== data.code;
      }),
    };
    window.webContents.executeJavaScript(
      `window.updatePlugin(${JSON.stringify({
        currentPlugin: this.currentPlugin,
      })})`
    );
    return true;
  }

  public sendPluginSomeKeyDownEvent(
    { data: { modifiers, keyCode } },
    window: BrowserWindow
  ) {
    const code = DECODE_KEY[keyCode];
    const v = runnerInstance.getView();
    if (
      !code ||
      !v?.webContents ||
      v.webContents.isDestroyed() ||
      window.getBrowserView() !== v
    ) {
      return;
    }
    if (modifiers.length > 0) {
      v.webContents.sendInputEvent({
        type: 'keyDown',
        modifiers,
        keyCode: code,
      });
    } else {
      v.webContents.sendInputEvent({
        type: 'keyDown',
        keyCode: code,
      });
    }
  }

  public detachPlugin(e, window) {
    if (!this.currentPlugin) return;
    const pluginName = this.currentPlugin.name;
    /** pluginSetting.single 默认为 true（单例）；仅当为 false 时可开多个独立窗口 */
    const allowMultipleDetachWindows =
      this.currentPlugin.pluginSetting?.single === false;
    if (!allowMultipleDetachWindows && pluginName) {
      const existing = detachInstance.getExistingDetachWindow(pluginName);
      if (existing && !existing.isDestroyed()) {
        if (existing.isMinimized()) existing.restore();
        existing.show();
        existing.focus();
        return;
      }
    }
    const view = window.getBrowserView();
    window.setBrowserView(null);
    window.webContents
      .executeJavaScript(`window.getMainInputInfo()`)
      .then((res) => {
        void window.webContents.executeJavaScript(
          `window.clearSearchSnapshotAfterDetach && window.clearSearchSnapshotAfterDetach()`
        );
        const subInput = this.mergeMainInputWithPluginExt(
          res as { value?: string; placeholder?: string },
          this.currentPlugin
        );
        detachInstance.init(
          {
            ...this.currentPlugin,
            subInput,
            detachAlwaysShowSearch:
              !!readPluginFlickConfigSync(pluginName).detachAlwaysShowSearch,
          },
          window.getBounds(),
          view,
          allowMultipleDetachWindows
        );
        window.webContents.executeJavaScript(`window.initFlick()`);
        applyMainWindowContentHeight(window, 60);
        this.currentPlugin = null;
      });
  }

  public detachInputChange({ data }) {
    this.sendSubInputChangeEvent({ data });
  }

  public getLocalId() {
    return encodeURIComponent(app.getPath('home'));
  }

  public shellShowItemInFolder({ data }) {
    shell.showItemInFolder(data.path);
    return true;
  }

  public async getFileIcon({ data }) {
    const nativeImage = await app.getFileIcon(data.path, { size: 'normal' });
    return nativeImage.toDataURL();
  }

  public shellBeep() {
    shell.beep();
    return true;
  }

  public screenCapture(arg, window) {
    screenCapture(window, (img) => {
      runnerInstance.executeHooks('ScreenCapture', {
        data: img,
      });
    });
  }

  public getCopyFiles() {
    return getCopyFiles();
  }

  public simulateKeyboardTap({ data: { key, modifier } }) {
    return input.sendKeyboardTap(
      String(key || ''),
      Array.isArray(modifier) ? modifier.map((item) => String(item)) : []
    );
  }

  public addLocalStartPlugin({ data: { plugin } }, window) {
    window.webContents.executeJavaScript(
      `window.addLocalStartPlugin(${JSON.stringify({
        plugin,
      })})`
    );
  }

  public removeLocalStartPlugin({ data: { plugin } }, window) {
    window.webContents.executeJavaScript(
      `window.removeLocalStartPlugin(${JSON.stringify({
        plugin,
      })})`
    );
  }

  public async pluginExportBundle(arg, window) {
    const pluginName = arg?.data?.pluginName;
    if (!pluginName || typeof pluginName !== 'string') {
      return { ok: false, error: 'NO_PLUGIN_NAME' };
    }
    const resolved = getExportDefaultFilename(pluginName);
    if (!resolved.ok) {
      return { ok: false, error: resolved.error };
    }
    const { canceled, filePath } = await dialog.showSaveDialog(window, {
      title: 'Flick',
      defaultPath: resolved.filename,
      filters: [{ name: 'ZIP', extensions: ['zip'] }],
    });
    if (canceled || !filePath) {
      return { canceled: true };
    }
    return exportPluginBundle(filePath, pluginName);
  }

  public async pluginImportBundle(_arg, window) {
    const { canceled, filePaths } = await dialog.showOpenDialog(window, {
      title: 'Flick',
      filters: [{ name: 'Flick plugin bundle', extensions: ['zip'] }],
      properties: ['openFile'],
    });
    if (canceled || !filePaths?.[0]) {
      return { canceled: true };
    }
    const result = await importPluginBundle(filePaths[0]);
    if (result.ok) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (global as any).LOCAL_PLUGINS?.reloadPluginsFromDisk?.();
    }
    return result;
  }
}

export default new API();
