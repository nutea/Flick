import { randomUUID } from 'crypto';

/** Electron Clipboard 子集，避免依赖 electron 类型包 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ClipboardApi = any;

type FileEntry =
  | string
  | {
      buffer: Buffer;
      mimetype: string;
      originalname: string;
    };

/**
 * 从系统剪贴板解析文件路径 / 图片（与原版 main.js 行为一致）
 */
export function getFilePathFromClipboard(clipboard: ClipboardApi): FileEntry[] {
  let filePath: FileEntry[] = [];

  if (process.platform === 'darwin') {
    if (clipboard.has('NSFilenamesPboardType')) {
      filePath =
        clipboard
          .read('NSFilenamesPboardType')
          .match(/<string>.*<\/string>/g)
          ?.map((item: string) => item.replace(/<string>|<\/string>/g, '')) || [];
    } else {
      const clipboardImage = clipboard.readImage('clipboard');
      if (!clipboardImage.isEmpty()) {
        const png = clipboardImage.toPNG();
        filePath = [
          {
            buffer: png,
            mimetype: 'image/png',
            originalname: `${randomUUID()}.png`,
          },
        ];
      } else {
        filePath = [
          clipboard.read('public.file-url').replace('file://', ''),
        ].filter(Boolean);
      }
    }
  } else {
    if (clipboard.has('CF_HDROP')) {
      const rawFilePathStr = clipboard.read('CF_HDROP') || '';
      let formatFilePathStr = [...rawFilePathStr]
        .filter((_, index) => rawFilePathStr.charCodeAt(index) !== 0)
        .join('')
        .replace(/\\/g, '\\');

      const drivePrefix = formatFilePathStr.match(/[a-zA-Z]:\\/);

      if (drivePrefix) {
        const drivePrefixIndex = formatFilePathStr.indexOf(drivePrefix[0]);
        if (drivePrefixIndex !== 0) {
          formatFilePathStr = formatFilePathStr.substring(drivePrefixIndex);
        }
        filePath = formatFilePathStr
          .split(drivePrefix[0])
          .filter((item: string) => item)
          .map((item: string) => drivePrefix[0] + item);
      }
    } else {
      const clipboardImage = clipboard.readImage('clipboard');
      if (!clipboardImage.isEmpty()) {
        const png = clipboardImage.toPNG();
        filePath = [
          {
            buffer: png,
            mimetype: 'image/png',
            originalname: `${randomUUID()}.png`,
          },
        ];
      } else {
        const buf = clipboard.readBuffer('FileNameW');
        filePath = [
          buf
            .toString('ucs2')
            .replace(RegExp(String.fromCharCode(0), 'g'), ''),
        ].filter(Boolean);
      }
    }
  }
  return filePath;
}

/** 用于对比「模拟复制前后」以及「与面板上次处理时」的剪贴板状态 */
export interface ClipboardSnap {
  text: string;
  pathStr: string;
  hasImage: boolean;
}

export function snapshotClipboard(clipboard: ClipboardApi): ClipboardSnap {
  const text = clipboard.readText('clipboard') || '';
  const raw = getFilePathFromClipboard(clipboard)[0];
  const pathStr = typeof raw === 'string' ? raw : '';
  const im = clipboard.readImage('clipboard');
  const hasImage = !!(im && typeof im.isEmpty === 'function' && !im.isEmpty());
  return { text, pathStr, hasImage };
}

export function clipboardSnapsEqual(a: ClipboardSnap, b: ClipboardSnap): boolean {
  return a.text === b.text && a.pathStr === b.pathStr && a.hasImage === b.hasImage;
}

function snapUnchanged(a: ClipboardSnap, b: ClipboardSnap): boolean {
  return clipboardSnapsEqual(a, b);
}

/** 从当前剪贴板解析为面板用的 text / fileUrl（路径优先） */
export function readClipboardPayload(clipboard: ClipboardApi): { text: string; fileUrl: string } {
  const text = clipboard.readText('clipboard') || '';
  const raw = getFilePathFromClipboard(clipboard)[0];
  let fileUrl = '';
  if (typeof raw === 'string') {
    fileUrl = raw;
  }
  return {
    text: fileUrl ? '' : text,
    fileUrl,
  };
}

export async function getSelectedContent(
  clipboard: ClipboardApi,
  simulateCopy: () => Promise<void>
): Promise<{ text: string; fileUrl: string }> {
  const before = snapshotClipboard(clipboard);
  await simulateCopy();
  return new Promise((resolve) => {
    setTimeout(() => {
      const after = snapshotClipboard(clipboard);
      if (snapUnchanged(before, after)) {
        resolve({ text: '', fileUrl: '' });
        return;
      }
      resolve(readClipboardPayload(clipboard));
    }, 50);
  });
}

/**
 * Electron `screen.getCursorScreenPoint()` 返回的已是 DIP，与 `BrowserWindow.setPosition` / `getBounds`
 * 所用坐标系一致。勿对 Windows 再调用 `screen.screenToDipPoint`：其入参应为物理像素，误传 DIP 会在
 * 高 DPI（如 125%～200%）下二次换算，导致窗口相对鼠标严重偏移（例如看似顶-left 对在指针旁）。
 */
export function getPos(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _screen: any,
  point: { x: number; y: number },
  _isMacOS: boolean
): { x: number; y: number } {
  return point;
}
