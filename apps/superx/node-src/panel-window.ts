import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';

/** Flick 注入的 ctx，与历史 `panel-window.js` 一致 */

export default function createPanelWindow(ctx: any) {
  const { BrowserWindow, ipcMain, dialog, shell } = ctx;
  const shouldOpenPanelDevtools =
    process.env.FLICK_OPEN_SUBAPP_DEVTOOLS === '1';

  let win: InstanceType<typeof BrowserWindow> | undefined;
  let pinned = false;
  let ipcHandlersAttached = false;
  /** 主进程 placePanelAtCursor 算出的意图坐标；Win 高 DPI 下 getBounds 与 setBounds 舍入不一致，勿用 b.x/b.y 做二次缩放锚点 */
  let panelPositionAnchor: { x: number; y: number } | null = null;

  const syncPanelPositionAnchorFromWindow = () => {
    if (!win || (typeof win.isDestroyed === 'function' && win.isDestroyed()))
      return;
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
    if (!win || (typeof win.isDestroyed === 'function' && win.isDestroyed()))
      return;
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
        contextIsolation: true,
        sandbox: true,
        webviewTag: false,
        webSecurity: true,
        backgroundThrottling: false,
        nodeIntegration: false,
        navigateOnDragDrop: false,
        preload: path.join(__dirname, 'panel-preload.js'),
      },
    });
    const panelDev = process.env.FLICK_SUPERX_PANEL_DEV_URL;
    const panelUrl =
      typeof panelDev === 'string' &&
      (panelDev.startsWith('http://') || panelDev.startsWith('https://'))
        ? panelDev
        : `file://${path.join(__dirname, 'main.html')}`;
    const isAllowedPanelUrl = (target: string) => {
      try {
        const allowed = new URL(panelUrl);
        const candidate = new URL(target);
        return (
          candidate.protocol === allowed.protocol &&
          candidate.host === allowed.host &&
          candidate.pathname === allowed.pathname
        );
      } catch {
        return false;
      }
    };
    win.webContents.on('will-navigate', (event: any, target: string) => {
      if (!isAllowedPanelUrl(target)) event.preventDefault();
    });
    win.webContents.setWindowOpenHandler(({ url }: { url: string }) => {
      try {
        const target = new URL(url);
        if (target.protocol === 'https:' || target.protocol === 'http:') {
          void shell.openExternal(target.toString());
        }
      } catch {
        /* deny malformed links */
      }
      return { action: 'deny' };
    });
    win.webContents.on(
      'did-fail-load',
      (_event: unknown, code: number, description: string, url: string) => {
        console.error(
          `[flick-system-super-panel] failed to load ${url}: ${code} ${description}`
        );
      }
    );
    win.webContents.on(
      'render-process-gone',
      (_event: unknown, details: { reason?: string; exitCode?: number }) => {
        console.error(
          '[flick-system-super-panel] renderer exited:',
          details.reason,
          details.exitCode
        );
      }
    );
    win.webContents.on(
      'console-message',
      (details: { level?: string; message?: string }) => {
        if (details.level !== 'warning' && details.level !== 'error') return;
        console.warn(
          `[flick-system-super-panel] renderer ${details.level}: ${details.message || ''}`
        );
      }
    );
    win.loadURL(panelUrl);
    if (shouldOpenPanelDevtools) {
      win.webContents.once('did-finish-load', () => {
        if (
          !win ||
          (typeof win.isDestroyed === 'function' && win.isDestroyed())
        )
          return;
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
      if (!win || (typeof win.isDestroyed === 'function' && win.isDestroyed()))
        return;
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

    for (const channel of [
      'superPanel-hidden',
      'superPanel-setSize',
      'trigger-pin',
    ]) {
      ipcMain.removeAllListeners(channel);
    }

    for (const channel of [
      'superPanel-get-pin-state',
      'superPanel-create-file',
      'superPanel-open-terminal',
      'superPanel-translate',
    ]) {
      try {
        ipcMain.removeHandler(channel);
      } catch {
        /* first registration */
      }
    }

    const isPanelSender = (event: { sender?: { id?: number } }) =>
      !!win && !win.isDestroyed() && event.sender?.id === win.webContents.id;

    ipcMain.on('superPanel-hidden', (event: { sender?: { id?: number } }) => {
      if (!isPanelSender(event)) return;
      hideWindow();
    });
    ipcMain.on('superPanel-setSize', (event: any, height: number) => {
      if (!isPanelSender(event)) return;
      if (!win || typeof height !== 'number' || !Number.isFinite(height))
        return;
      const h = Math.max(50, Math.min(900, Math.round(height)));
      const ax = panelPositionAnchor?.x;
      const ay = panelPositionAnchor?.y;
      if (ax != null && ay != null) {
        win.setBounds({ x: ax, y: ay, width: 240, height: h }, false);
        return;
      }
      const b = win.getBounds();
      win.setBounds({ x: b.x, y: b.y, width: 240, height: h }, false);
    });
    ipcMain.on('trigger-pin', (event: any, pin: boolean) => {
      if (!isPanelSender(event)) return;
      pinned = pin === true;
      win?.setAlwaysOnTop(true);
      emitPinState(pinned);
    });
    ipcMain.handle('superPanel-get-pin-state', (event: any) =>
      isPanelSender(event) ? pinned : false
    );

    ipcMain.handle(
      'superPanel-create-file',
      async (event: any, rawDirectory: unknown) => {
        if (!isPanelSender(event) || typeof rawDirectory !== 'string')
          return false;
        const directory = path.resolve(rawDirectory.replace(/^file:\/\//, ''));
        try {
          if (!fs.statSync(directory).isDirectory()) return false;
        } catch {
          return false;
        }
        const result = await dialog.showSaveDialog(win, {
          title: '请选择要保存的文件名',
          buttonLabel: '保存',
          defaultPath: directory,
          showsTagField: false,
          nameFieldLabel: '',
        });
        if (!result.filePath) return false;
        fs.writeFileSync(result.filePath, '');
        return true;
      }
    );

    ipcMain.handle(
      'superPanel-open-terminal',
      (event: any, rawDirectory: unknown) => {
        if (!isPanelSender(event) || typeof rawDirectory !== 'string')
          return false;
        const directory = path.resolve(rawDirectory.replace(/^file:\/\//, ''));
        try {
          if (!fs.statSync(directory).isDirectory()) return false;
        } catch {
          return false;
        }
        const options = {
          cwd: directory,
          detached: true,
          stdio: 'ignore',
        } as const;
        const child =
          process.platform === 'darwin'
            ? spawn('open', ['-a', 'Terminal', directory], options)
            : process.platform === 'win32'
              ? spawn('cmd.exe', [], options)
              : spawn('x-terminal-emulator', [], options);
        child.unref();
        return true;
      }
    );

    ipcMain.handle(
      'superPanel-translate',
      async (event: any, rawRequest: unknown) => {
        if (
          !isPanelSender(event) ||
          !rawRequest ||
          typeof rawRequest !== 'object'
        ) {
          throw new Error('Invalid translation request');
        }
        const request = rawRequest as {
          url?: unknown;
          headers?: unknown;
          body?: unknown;
        };
        if (typeof request.url !== 'string' || request.url.length > 2048) {
          throw new Error('Invalid translation URL');
        }
        const url = new URL(request.url);
        const localHttp =
          url.protocol === 'http:' &&
          ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
        if (url.protocol !== 'https:' && !localHttp) {
          throw new Error(
            'Translation URL must use HTTPS (HTTP is limited to localhost)'
          );
        }
        if (url.username || url.password) {
          throw new Error('Translation URL must not contain credentials');
        }
        if (typeof request.body !== 'string' || request.body.length > 262144) {
          throw new Error('Translation request body is too large');
        }
        const headers: Record<string, string> = {};
        if (request.headers && typeof request.headers === 'object') {
          for (const [key, value] of Object.entries(request.headers)) {
            if (
              /^[A-Za-z0-9-]{1,64}$/.test(key) &&
              typeof value === 'string' &&
              value.length <= 8192 &&
              !['host', 'content-length', 'connection'].includes(
                key.toLowerCase()
              )
            ) {
              headers[key] = value;
            }
          }
        }
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 20000);
        try {
          const response = await fetch(url, {
            method: 'POST',
            headers,
            body: request.body,
            signal: controller.signal,
            redirect: 'error',
          });
          const text = await response.text();
          if (text.length > 1048576) {
            throw new Error('Translation response is too large');
          }
          return { ok: response.ok, status: response.status, text };
        } finally {
          clearTimeout(timer);
        }
      }
    );
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
