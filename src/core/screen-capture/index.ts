import platform from '@/common/utils/commonConst';

const nodeRequire =
  typeof window !== 'undefined' && (window as any).require
    ? (window as any).require
    : require;
const { clipboard, Notification } = nodeRequire('electron');
const { execFile, exec } = nodeRequire('child_process');
const path = nodeRequire('path');

// 截图方法windows
export const screenWindow = (cb) => {
  const url = path.resolve(__static, 'bin', 'ScreenCapture.exe');
  const screen_window = execFile(url);
  screen_window.on('exit', (code) => {
    if (code) {
      const image = clipboard.readImage();
      cb && cb(image.isEmpty() ? '' : image.toDataURL());
    }
  });
};

// 截图方法mac
export const handleScreenShots = (cb) => {
  exec('screencapture -i -r -c', () => {
    const image = clipboard.readImage();
    cb && cb(image.isEmpty() ? '' : image.toDataURL());
  });
};

export default (mainWindow, cb) => {
  // 接收到截图后的执行程序
  clipboard.writeText('');
  if (platform.macOS()) {
    handleScreenShots(cb);
  } else if (platform.windows()) {
    screenWindow(cb);
  } else {
    new Notification({
      title: '兼容性支持度不够',
      body: 'Linux 系统截图暂不支持，我们将会尽快更新！',
    }).show();
  }
};
