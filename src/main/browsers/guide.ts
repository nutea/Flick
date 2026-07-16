import { BrowserWindow, ipcMain, nativeTheme, screen } from 'electron';
import path from 'path';
import {
  GUIDE_WIDTH,
  WINDOW_MIN_HEIGHT,
  GUIDE_HEIGHT,
} from '@/common/constans/common';
import {
  DEV_APP_PORTS,
  devSubAppHttpUrl,
  shouldOpenSubAppShellDevTools,
} from '@/main/common/devSubAppServers';
import commonConst from '@/common/utils/commonConst';
import { showStartupError, writeStartupLog } from '@/main/common/startupDiagnostics';

const getWindowPos = (width, height) => {
  const screenPoint = screen.getCursorScreenPoint();
  const displayPoint = screen.getDisplayNearestPoint(screenPoint);
  return [
    displayPoint.bounds.x + Math.round((displayPoint.bounds.width - width) / 2),
    displayPoint.bounds.y +
      Math.round((displayPoint.bounds.height - height) / 2),
  ];
};

let win: any;

export default () => {
  const init = () => {
    if (win) return;
    ipcMain.on('guide:service', async (event, arg: { type: string }) => {
      const data = await operation[arg.type]();
      event.returnValue = data;
    });
    createWindow();
  };

  const createWindow = async () => {
    const [x, y] = getWindowPos(800, 600);
    win = new BrowserWindow({
      show: false,
      alwaysOnTop: true,
      resizable: false,
      fullscreenable: false,
      minimizable: false,
      maximizable: false,
      // closable: false,
      skipTaskbar: commonConst.macOS(),
      autoHideMenuBar: true,
      frame: false,
      enableLargerThanScreen: true,
      x,
      y,
      width: GUIDE_WIDTH,
      height: GUIDE_HEIGHT,
      minHeight: WINDOW_MIN_HEIGHT,
      webPreferences: {
        webSecurity: false,
        backgroundThrottling: false,
        contextIsolation: false,
        webviewTag: true,
        devTools: true,
        nodeIntegration: true,
        spellcheck: false,
      },
    });
    const guideFile = `file://${path.join(__static, './guide/index.html')}`;
    void win.loadURL(devSubAppHttpUrl(DEV_APP_PORTS.guide, '/') ?? guideFile);
    if (shouldOpenSubAppShellDevTools()) {
      win.webContents.once('did-finish-load', () => {
        if (!win || win.isDestroyed()) return;
        if (win.webContents.isDevToolsOpened()) return;
        win.webContents.openDevTools({ mode: 'detach' });
      });
    }
    win.on('closed', () => {
      win = undefined;
    });

    win.webContents.on(
      'did-fail-load',
      (_event, code, desc, validatedURL, isMainFrame) => {
        if (!isMainFrame) return;
        showStartupError(
          'Flick Guide Error',
          `Guide window failed to load: ${validatedURL || 'unknown URL'}`,
          `${code}: ${desc}`
        );
      }
    );

    win.webContents.once('did-finish-load', () => {
      writeStartupLog('guide window finished load');
    });

    win.once('ready-to-show', () => {
      win.show();
    });
  };
  const getWindow = () => win;

  const operation = {
    close: () => {
      win.close();
      win = null;
    },
  };

  return {
    init,
    getWindow,
  };
};
