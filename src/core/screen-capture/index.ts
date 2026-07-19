import {
  BrowserWindow,
  clipboard,
  ipcMain,
  nativeImage,
  Notification,
  screen,
  type IpcMainEvent,
} from 'electron';
import { randomUUID } from 'crypto';
import path from 'path';
import { pathToFileURL } from 'url';
import { nativeRuntime, type NativeScreenRegion } from 'flick-native';
import { writeStartupLog } from '@/main/common/startupDiagnostics';
import { secureWebContentsNavigation } from '@/main/common/navigationSecurity';
import { normalizeCaptureRegion } from './region';

type CaptureCallback = (dataUrl: string) => void;
const COMPLETE_CHANNEL = 'screen-capture:complete';
const CANCEL_CHANNEL = 'screen-capture:cancel';
const INIT_CHANNEL = 'screen-capture:init';
const OVERLAY_DISMISS_DELAY_MS = 90;

let activeCapture: Promise<string> | null = null;

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

async function selectRegion(): Promise<NativeScreenRegion | null> {
  const displays = screen.getAllDisplays();
  if (!displays.length) throw new Error('No display is available for capture');

  const token = randomUUID();
  const overlayUrl = pathToFileURL(
    path.join(__static, 'screen-capture', 'index.html')
  ).toString();
  const overlays = displays.map((display) => {
    const window = new BrowserWindow({
      ...display.bounds,
      alwaysOnTop: true,
      backgroundColor: '#00000000',
      enableLargerThanScreen: true,
      focusable: true,
      frame: false,
      fullscreenable: false,
      hasShadow: false,
      maximizable: false,
      minimizable: false,
      movable: false,
      resizable: false,
      show: false,
      skipTaskbar: true,
      transparent: true,
      webPreferences: {
        backgroundThrottling: false,
        contextIsolation: true,
        navigateOnDragDrop: false,
        nodeIntegration: false,
        preload: path.join(__dirname, '../../preload/screenCapture.js'),
        sandbox: false,
        spellcheck: false,
        webSecurity: true,
        webviewTag: false,
      },
    });
    window.setAlwaysOnTop(true, 'screen-saver');
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    secureWebContentsNavigation(window.webContents, overlayUrl);
    return { display, window };
  });

  return new Promise<NativeScreenRegion | null>((resolve, reject) => {
    let settled = false;

    const destroyOverlays = () => {
      for (const overlay of overlays) {
        if (!overlay.window.isDestroyed()) overlay.window.destroy();
      }
    };
    const cleanup = () => {
      ipcMain.removeListener(COMPLETE_CHANNEL, onComplete);
      ipcMain.removeListener(CANCEL_CHANNEL, onCancel);
    };
    const finish = (region: NativeScreenRegion | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      destroyOverlays();
      resolve(region);
    };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      destroyOverlays();
      reject(error);
    };
    const findSenderOverlay = (event: IpcMainEvent) =>
      overlays.find(({ window }) => window.webContents === event.sender);

    function onComplete(event: IpcMainEvent, payload: unknown) {
      const senderOverlay = findSenderOverlay(event);
      if (!senderOverlay || !payload || typeof payload !== 'object') return;
      const candidate = payload as Record<string, unknown>;
      if (candidate.token !== token) return;
      const region = normalizeCaptureRegion(
        candidate,
        senderOverlay.display.bounds
      );
      if (region) finish(region);
    }

    function onCancel(event: IpcMainEvent, payload: unknown) {
      if (
        !findSenderOverlay(event) ||
        !payload ||
        typeof payload !== 'object'
      ) {
        return;
      }
      if ((payload as Record<string, unknown>).token === token) finish(null);
    }

    ipcMain.on(COMPLETE_CHANNEL, onComplete);
    ipcMain.on(CANCEL_CHANNEL, onCancel);

    void Promise.all(
      overlays.map(async ({ display, window }) => {
        await window.loadURL(overlayUrl);
        if (settled || window.isDestroyed()) return;
        window.webContents.send(INIT_CHANNEL, {
          token,
          display: display.bounds,
        });
      })
    )
      .then(() => {
        if (settled) return;
        for (const { window } of overlays) window.showInactive();
        const cursor = screen.getCursorScreenPoint();
        const focused = overlays.find(({ display }) => {
          const { x, y, width, height } = display.bounds;
          return (
            cursor.x >= x &&
            cursor.x < x + width &&
            cursor.y >= y &&
            cursor.y < y + height
          );
        });
        (focused || overlays[0]).window.focus();
      })
      .catch(fail);
  });
}

async function runCapture(): Promise<string> {
  if (!nativeRuntime.screen.isAvailable()) {
    throw new Error('This Flick build does not include native screen capture');
  }

  const region = await selectRegion();
  if (!region) return '';

  // Transparent windows are destroyed synchronously, but compositors may need
  // another frame before they disappear from the desktop image.
  await delay(OVERLAY_DISMISS_DELAY_MS);
  const png = await nativeRuntime.screen.captureRegion(region);
  const image = nativeImage.createFromBuffer(png);
  if (image.isEmpty())
    throw new Error('Native screen capture returned no image');

  clipboard.writeImage(image);
  return image.toDataURL();
}

export default function screenCapture(
  _mainWindow?: BrowserWindow,
  callback?: CaptureCallback
): Promise<string> {
  if (!activeCapture) {
    activeCapture = runCapture()
      .catch((error) => {
        writeStartupLog('native screen capture failed', error);
        new Notification({
          title: '截图失败',
          body: '无法访问屏幕，请检查系统的屏幕录制权限后重试。',
        }).show();
        return '';
      })
      .finally(() => {
        activeCapture = null;
      });
  }

  return activeCapture.then((dataUrl) => {
    callback?.(dataUrl);
    return dataUrl;
  });
}
