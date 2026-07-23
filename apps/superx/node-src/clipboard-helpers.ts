import { randomUUID } from 'crypto';
import { fileURLToPath } from 'node:url';

/** Electron Clipboard 子集，避免依赖 electron 类型包 */

type ClipboardApi = any;

type FileEntry =
  | string
  | {
      buffer: Buffer;
      mimetype: string;
      originalname: string;
    };

function decodeXmlText(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function decodeMacFilePath(value: string): string {
  const decodedXml = decodeXmlText(value.trim());
  if (!decodedXml) return '';
  if (decodedXml.startsWith('file://')) {
    try {
      return fileURLToPath(decodedXml);
    } catch {
      /* Fall through for malformed legacy clipboard URLs. */
    }
  }
  try {
    return decodeURIComponent(decodedXml.replace(/^file:\/\//, ''));
  } catch {
    return decodedXml.replace(/^file:\/\//, '');
  }
}

export function parseMacClipboardFilePaths(raw: string): string[] {
  return (raw.match(/<string>[\s\S]*?<\/string>/g) || [])
    .map((item) => item.replace(/^<string>|<\/string>$/g, ''))
    .map(decodeMacFilePath)
    .filter(Boolean);
}

/**
 * 从系统剪贴板解析文件路径 / 图片（与原版 main.js 行为一致）
 */
export function getFilePathFromClipboard(clipboard: ClipboardApi): FileEntry[] {
  let filePath: FileEntry[] = [];

  if (process.platform === 'darwin') {
    if (clipboard.has('NSFilenamesPboardType')) {
      filePath = parseMacClipboardFilePaths(
        clipboard.read('NSFilenamesPboardType')
      );
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
          decodeMacFilePath(clipboard.read('public.file-url')),
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
          buf.toString('ucs2').replace(RegExp(String.fromCharCode(0), 'g'), ''),
        ].filter(Boolean);
      }
    }
  }
  return filePath;
}

/** 仅用于不支持系统剪贴板变更令牌的平台降级检测。 */
export interface ClipboardSnap {
  text: string;
  pathStr: string;
  hasImage: boolean;
}

/** macOS application bundles are directories on disk, but UI treats them as apps/files. */
export function isDirectorySelection(
  selectedPath: string,
  statIsDirectory: boolean,
  platform: NodeJS.Platform = process.platform
): boolean {
  if (!statIsDirectory) return false;
  return platform !== 'darwin' || !/\.app\/?$/i.test(selectedPath);
}

export function snapshotClipboard(clipboard: ClipboardApi): ClipboardSnap {
  const text = clipboard.readText('clipboard') || '';
  const pathStr = getFilePathFromClipboard(clipboard)
    .filter((entry): entry is string => typeof entry === 'string' && !!entry)
    .join('\0');
  const im = clipboard.readImage('clipboard');
  const hasImage = !!(im && typeof im.isEmpty === 'function' && !im.isEmpty());
  return { text, pathStr, hasImage };
}

function clipboardSnapsEqual(a: ClipboardSnap, b: ClipboardSnap): boolean {
  return (
    a.text === b.text && a.pathStr === b.pathStr && a.hasImage === b.hasImage
  );
}

const MAX_SELECTED_FILES = 100;

function normalizeSelectedPaths(paths: unknown[]): string[] {
  return Array.from(
    new Set(
      paths
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim())
        .filter(Boolean)
    )
  ).slice(0, MAX_SELECTED_FILES);
}

/** 从当前剪贴板解析为面板用的 text / 文件路径（路径优先） */
export function readClipboardPayload(clipboard: ClipboardApi): {
  text: string;
  fileUrl: string;
  fileUrls: string[];
} {
  const text = clipboard.readText('clipboard') || '';
  const fileUrls = normalizeSelectedPaths(getFilePathFromClipboard(clipboard));
  const fileUrl = fileUrls[0] || '';
  return {
    text: fileUrl ? '' : text,
    fileUrl,
    fileUrls,
  };
}

export type SelectedContentResult =
  | {
      status: 'selected';
      source: 'accessibility' | 'shell' | 'clipboard-copy';
      text: string;
      fileUrl: string;
      fileUrls: string[];
    }
  | {
      status: 'none' | 'timeout';
      text: '';
      fileUrl: '';
      fileUrls: [];
    };

export interface SelectedContentOptions {
  readSelectedText?: () => Promise<string>;
  readSelectedFilePaths?: () => Promise<string[]>;
  getClipboardChangeToken?: () => number | null;
  directReadTimeoutMs?: number;
  directFileReadTimeoutMs?: number;
  copyTimeoutMs?: number;
  pollIntervalMs?: number;
}

const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

async function readDirectValue<T>(
  reader: (() => Promise<T>) | undefined,
  timeoutMs: number,
  fallback: T
): Promise<T> {
  if (!reader) return fallback;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      reader().catch(() => fallback),
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function getSelectedContent(
  clipboard: ClipboardApi,
  simulateCopy: () => Promise<void>,
  options: SelectedContentOptions = {}
): Promise<SelectedContentResult> {
  // The two platform reads are independent. Running them together keeps the
  // Finder/Explorer path capability without adding its process/COM latency to
  // every text selection. Both are bounded because automation providers can
  // stall behind a permission prompt or an unresponsive file manager.
  const [directText, selectedPaths] = await Promise.all([
    readDirectValue(
      options.readSelectedText,
      options.directReadTimeoutMs ?? 120,
      ''
    ),
    readDirectValue(
      options.readSelectedFilePaths,
      options.directFileReadTimeoutMs ?? 400,
      [] as string[]
    ),
  ]);
  const fileUrls = normalizeSelectedPaths(selectedPaths);
  const firstPath = fileUrls[0];
  if (firstPath) {
    return {
      status: 'selected',
      source: 'shell',
      text: '',
      fileUrl: firstPath,
      fileUrls,
    };
  }

  // A focused Explorer item can expose its label through UI Automation. The
  // Shell path is the more specific selection and must win so file plugins
  // (especially multi-file actions) are not misclassified as text commands.
  if (directText.length > 0) {
    return {
      status: 'selected',
      source: 'accessibility',
      text: directText,
      fileUrl: '',
      fileUrls: [],
    };
  }

  const getChangeToken = options.getClipboardChangeToken;
  const beforeToken = getChangeToken?.() ?? null;
  const beforeSnap = beforeToken === null ? snapshotClipboard(clipboard) : null;

  try {
    await simulateCopy();
  } catch {
    return { status: 'none', text: '', fileUrl: '', fileUrls: [] };
  }

  const timeoutMs = options.copyTimeoutMs ?? 250;
  const pollIntervalMs = Math.max(4, options.pollIntervalMs ?? 10);
  const deadline = Date.now() + timeoutMs;

  while (Date.now() <= deadline) {
    let changed = false;
    if (beforeToken !== null && getChangeToken) {
      const currentToken = getChangeToken();
      changed = currentToken !== null && currentToken !== beforeToken;
    } else if (beforeSnap) {
      changed = !clipboardSnapsEqual(beforeSnap, snapshotClipboard(clipboard));
    }

    if (changed) {
      const payload = readClipboardPayload(clipboard);
      // Some applications empty the clipboard and publish the new formats in
      // separate steps. Do not treat the intermediate empty state as a copy.
      if (!payload.text && payload.fileUrls.length === 0) {
        await wait(pollIntervalMs);
        continue;
      }
      return {
        status: 'selected',
        source: 'clipboard-copy',
        ...payload,
      };
    }
    await wait(pollIntervalMs);
  }

  return { status: 'timeout', text: '', fileUrl: '', fileUrls: [] };
}

/**
 * Electron `screen.getCursorScreenPoint()` 返回的已是 DIP，与 `BrowserWindow.setPosition` / `getBounds`
 * 所用坐标系一致。勿对 Windows 再调用 `screen.screenToDipPoint`：其入参应为物理像素，误传 DIP 会在
 * 高 DPI（如 125%～200%）下二次换算，导致窗口相对鼠标严重偏移（例如看似顶-left 对在指针旁）。
 */
export function getPos(
  _screen: any,
  point: { x: number; y: number },
  _isMacOS: boolean
): { x: number; y: number } {
  return point;
}
