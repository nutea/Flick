import { dialog, Menu, Tray, app, shell, BrowserWindow } from 'electron';
import path from 'path';
import pkg from '../../../package.json';
import commonConst from '@/common/utils/commonConst';
import { guide } from '../browsers';
import winPosition from './getWinPosition';

function getUsableWindow(
  getWindow: () => BrowserWindow | undefined
): BrowserWindow | undefined {
  const win = getWindow();
  if (!win || win.isDestroyed()) return undefined;
  if (!win.webContents || win.webContents.isDestroyed()) return undefined;
  return win;
}

function createTray(getWindow: () => BrowserWindow | undefined): Promise<Tray> {
  return new Promise((resolve) => {
    let icon;
    if (commonConst.macOS()) {
      icon = './icons/iconTemplate@2x.png';
    } else {
      icon = './icons/icon@2x.png';
    }
    const appIcon = new Tray(path.join(__static, icon));

    const openSettings = () => {
      const window = getUsableWindow(getWindow);
      if (!window) return;
      const { x, y } = winPosition.getPosition();
      void window.webContents.executeJavaScript(
        `window.flick && window.flick.openMenu && window.flick.openMenu({ code: "settings" })`
      );
      window.setPosition(x, y);
      window.show();
    };

    const createContextMenu = () =>
      Menu.buildFromTemplate([
        {
          label: '帮助文档',
          click: () => {
            process.nextTick(() => {
              shell.openExternal('https://github.com/clouDr-f2e/flick');
            });
          },
        },
        {
          label: '引导教学',
          click: () => {
            guide().init();
          },
        },
        {
          label: '意见反馈',
          click: () => {
            process.nextTick(() => {
              shell.openExternal('https://github.com/clouDr-f2e/flick/issues');
            });
          },
        },
        { type: 'separator' },
        {
          label: '显示',
          click() {
            const window = getUsableWindow(getWindow);
            if (!window) return;
            const { x, y } = winPosition.getPosition();
            window.setPosition(x, y);
            window.show();
          },
        },
        {
          label: '系统设置',
          click() {
            openSettings();
          },
        },
        { type: 'separator' },
        {
          role: 'quit',
          label: '退出',
        },
        {
          label: '重启',
          click() {
            app.relaunch();
            app.quit();
          },
        },

        { type: 'separator' },
        {
          label: '关于',
          click() {
            dialog.showMessageBox({
              title: '拉比克',
              message: '极简、插件化的现代桌面软件',
              detail: `Version: ${pkg.version}\nAuthor: muwoo`,
            });
          },
        },
      ]);
    appIcon.on('click', () => {
      appIcon.setContextMenu(createContextMenu());
      appIcon.popUpContextMenu();
    });
    appIcon.setContextMenu(createContextMenu());

    resolve(appIcon);
  });
}

export default createTray;
