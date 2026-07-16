import * as path from 'path';
import * as fs from 'fs';

/** Flick 注入的 ctx，与历史 `panel-window.js` 一致 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function createPanelWindow(ctx: any) {
  const { BrowserWindow, ipcMain, mainWindow, dialog, nativeImage } = ctx;
  // 打包后 NODE_ENV 常未设置，不能用 !== 'production'（会误开 DevTools）
  const shouldOpenPanelDevtools =
    process.env.NODE_ENV === 'development' ||
    Boolean(process.env.VITE_DEV_SERVER_URL) ||
    Boolean(process.env.ELECTRON_RENDERER_URL) ||
    Boolean(process.env.FLICK_SUPERX_PANEL_DEV_URL);

  let win: InstanceType<typeof BrowserWindow> | undefined;
  let pinned = false;
  let ipcHandlersAttached = false;
  /** 主进程 placePanelAtCursor 算出的意图坐标；Win 高 DPI 下 getBounds 与 setBounds 舍入不一致，勿用 b.x/b.y 做二次缩放锚点 */
  let panelPositionAnchor: { x: number; y: number } | null = null;

  const syncPanelPositionAnchorFromWindow = () => {
    if (!win || (typeof win.isDestroyed === 'function' && win.isDestroyed())) return;
    try {
      const b = win.getBounds();
      panelPositionAnchor = { x: Math.round(b.x), y: Math.round(b.y) };
    } catch {
      /* ignore */
    }
  };

  const emitPinState = (pin: boolean) => {
    win?.webContents.send('superPanel-pin-state', pin);
  };

  const resetPin = () => {
    if (!pinned) return;
    pinned = false;
    emitPinState(false);
  };

  const hideWindow = () => {
    if (!win || (typeof win.isDestroyed === 'function' && win.isDestroyed())) return;
    resetPin();
    win.hide();
  };

  function needsNewWindow(): boolean {
    if (win == null) return true;
    try {
      return typeof win.isDestroyed === 'function' && win.isDestroyed();
    } catch {
      return true;
    }
  }

  const createWindow = () => {
    win = new BrowserWindow({
      frame: false,
      autoHideMenuBar: true,
      width: 240,
      height: 50,
      show: false,
      alwaysOnTop: true,
      webPreferences: {
        contextIsolation: false,
        webviewTag: true,
        webSecurity: false,
        backgroundThrottling: false,
        nodeIntegration: true,
        preload: path.join(__dirname, 'panel-preload.js'),
      },
    });
    const panelDev = process.env.FLICK_SUPERX_PANEL_DEV_URL;
    const panelUrl =
      typeof panelDev === 'string' &&
      (panelDev.startsWith('http://') || panelDev.startsWith('https://'))
        ? panelDev
        : `file://${path.join(__dirname, 'main.html')}`;
    win.loadURL(panelUrl);
    if (shouldOpenPanelDevtools) {
      win.webContents.once('did-finish-load', () => {
        if (!win || (typeof win.isDestroyed === 'function' && win.isDestroyed())) return;
        if (win.webContents.isDevToolsOpened()) return;
        win.webContents.openDevTools({ mode: 'detach' });
      });
    }
    win.on('closed', () => {
      win = undefined;
      panelPositionAnchor = null;
    });
    // 拖动后同步锚点，避免后续 superPanel-setSize 仍按旧坐标 setBounds 导致闪回原位
    win.on('move', syncPanelPositionAnchorFromWindow);
    win.on('blur', () => {
      if (!pinned) hideWindow();
    });
    win.on('hide', () => {
      resetPin();
      if (!win || (typeof win.isDestroyed === 'function' && win.isDestroyed())) return;
      win.webContents.send('super-panel-dismissed');
    });
  };

  /** 窗口被关闭/销毁后再次调用即可重建，供 getWindow / init 使用 */
  const ensurePanelWindow = () => {
    if (!needsNewWindow()) return;
    createWindow();
  };

  const attachIpcOnce = () => {
    if (ipcHandlersAttached) return;
    ipcHandlersAttached = true;

    ipcMain.on('superPanel-hidden', () => {
      hideWindow();
    });
    ipcMain.on('superPanel-setSize', (_e: unknown, height: number) => {
      if (!win || typeof height !== 'number' || !Number.isFinite(height)) return;
      const h = Math.max(50, Math.round(height));
      const ax = panelPositionAnchor?.x;
      const ay = panelPositionAnchor?.y;
      if (ax != null && ay != null) {
        win.setBounds({ x: ax, y: ay, width: 240, height: h }, false);
        return;
      }
      const b = win.getBounds();
      win.setBounds({ x: b.x, y: b.y, width: 240, height: h }, false);
    });
    ipcMain.on('superPanel-openPlugin', (_e: unknown, args: unknown) => {
      mainWindow.webContents.send('superPanel-openPlugin', args);
    });
    ipcMain.on('create-file', (_e: unknown, args: { filePath?: string }) => {
      dialog.showSaveDialog(args).then((result: { filePath?: string }) => {
        if (result.filePath) {
          fs.writeFileSync(result.filePath, '');
        }
      });
    });
    ipcMain.on('get-file-base64', (event: { returnValue?: string }, filePath: string) => {
      const data = nativeImage.createFromPath(filePath).toDataURL();
      event.returnValue = data;
    });
    ipcMain.on('trigger-pin', (_event: unknown, pin: boolean) => {
      pinned = pin;
      win?.setAlwaysOnTop(true);
      emitPinState(pinned);
    });
    ipcMain.handle('superPanel-get-pin-state', () => pinned);
  };

  const init = () => {
    attachIpcOnce();
    ensurePanelWindow();
  };

  const getWindow = () => {
    ensurePanelWindow();
    return win;
  };

  const setPanelPositionAnchor = (x: number, y: number) => {
    panelPositionAnchor = { x: Math.round(x), y: Math.round(y) };
  };

  const isPinned = () => pinned;

  return { init, getWindow, setPanelPositionAnchor, isPinned, resetPin };
}
