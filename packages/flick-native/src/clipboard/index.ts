import type { NativeClipboardApi, NativeClipboardContent } from '../types';

interface ElectronClipboardLike {
  has(format: string): boolean;
  read(format: string): string;
  readText(format?: string): string;
  writeBuffer?(format: string, buffer: Buffer): void;
}

interface ElectronLike {
  clipboard: ElectronClipboardLike;
}

const tryLoadElectron = (): ElectronLike | null => {
  try {
    return require('electron') as ElectronLike;
  } catch {
    return null;
  }
};

/**
 * Loads the in-repo N-API addon. The addon is the single source of truth for
 * file-path clipboard reads and writes. The binding is optional in development,
 * so every caller retains an Electron fallback.
 */
const tryLoadNativeAddon = () => {
  try {
    return require('../../native');
  } catch {
    return null;
  }
};

const readNativeFilePaths = (): string[] => {
  const addon = tryLoadNativeAddon();
  if (!addon?.readClipboardFilePaths) return [];
  try {
    const filePaths = addon.readClipboardFilePaths();
    if (!Array.isArray(filePaths)) return [];
    return filePaths.filter((path: unknown): path is string => Boolean(path));
  } catch {
    return [];
  }
};

const decodeXmlText = (value: string): string =>
  value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

const parseMacFileUrls = (raw: string): string[] =>
  (raw.match(/<string>[\s\S]*?<\/string>/g) || [])
    .map((item) =>
      decodeXmlText(item.replace(/^<string>|<\/string>$/g, '').trim())
    )
    .map(decodeFileUrl)
    .filter(Boolean);

const decodeFileUrl = (value: string): string => {
  try {
    return decodeURIComponent(value.replace(/^file:\/\//, ''));
  } catch {
    return value.replace(/^file:\/\//, '');
  }
};

const readMacFilePaths = (clipboard: ElectronClipboardLike): string[] => {
  if (clipboard.has('NSFilenamesPboardType')) {
    return parseMacFileUrls(clipboard.read('NSFilenamesPboardType'));
  }

  const fileUrl = clipboard
    .read('public.file-url')
    .replace('file://', '')
    .trim();
  return fileUrl ? [decodeFileUrl(fileUrl)] : [];
};

const readLinuxFilePaths = (clipboard: ElectronClipboardLike): string[] => {
  if (!clipboard.has('text/uri-list')) return [];
  return clipboard
    .read('text/uri-list')
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter((value) => value.startsWith('file://'))
    .map(decodeFileUrl);
};

const readFilePaths = (clipboard: ElectronClipboardLike): string[] => {
  if (process.platform === 'win32') {
    return readNativeFilePaths();
  }

  if (process.platform === 'darwin') {
    return readMacFilePaths(clipboard);
  }

  if (process.platform === 'linux') {
    return readLinuxFilePaths(clipboard);
  }

  return [];
};

const writeNativeFilePaths = (files: string[]): boolean => {
  const addon = tryLoadNativeAddon();
  if (!addon?.writeClipboardFilePaths) return false;
  try {
    addon.writeClipboardFilePaths(files);
    return true;
  } catch {
    return false;
  }
};

export const clipboard: NativeClipboardApi = {
  getChangeToken(): number | null {
    const addon = tryLoadNativeAddon();
    if (typeof addon?.getClipboardChangeToken !== 'function') return null;
    try {
      const token = addon.getClipboardChangeToken();
      return Number.isFinite(token) && token > 0 ? token : null;
    } catch {
      return null;
    }
  },

  async getClipboardContent(): Promise<NativeClipboardContent> {
    const electron = tryLoadElectron();
    if (!electron) return null;

    const filePaths = readFilePaths(electron.clipboard);
    if (filePaths.length > 0) {
      return {
        type: 'file',
        content: filePaths,
      };
    }

    const text =
      electron.clipboard.readText('clipboard') || electron.clipboard.readText();

    if (!text) return null;

    return {
      type: 'text',
      content: text,
    };
  },

  readFilePaths(): string[] {
    if (process.platform === 'win32') {
      return readNativeFilePaths();
    }
    const nativePaths = readNativeFilePaths();
    if (nativePaths.length > 0) return nativePaths;
    const electron = tryLoadElectron();
    if (!electron) return [];
    if (process.platform === 'darwin') {
      return readMacFilePaths(electron.clipboard);
    }
    if (process.platform === 'linux') {
      return readLinuxFilePaths(electron.clipboard);
    }
    return [];
  },

  writeFilePaths(files: string[]): boolean {
    if (!Array.isArray(files) || files.length === 0) return false;
    return writeNativeFilePaths(files);
  },
};
