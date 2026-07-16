import type { NativeClipboardApi, NativeClipboardContent } from '../types';

interface ElectronClipboardLike {
  has(format: string): boolean;
  read(format: string): string;
  readText(format?: string): string;
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
 * Windows file-path clipboard reads (replaces `electron-clipboard-ex`); on
 * non-Windows platforms it is intentionally absent and we return null.
 */
const tryLoadNativeAddon = () => {
  if (process.platform !== 'win32') return null;
  try {
    return require('../../native');
  } catch {
    return null;
  }
};

const readWindowsFilePaths = (): string[] => {
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

const parseMacFileUrls = (raw: string): string[] =>
  (raw.match(/<string>.*?<\/string>/g) || [])
    .map((item) => item.replace(/<string>|<\/string>/g, '').trim())
    .filter(Boolean);

const readMacFilePaths = (clipboard: ElectronClipboardLike): string[] => {
  if (clipboard.has('NSFilenamesPboardType')) {
    return parseMacFileUrls(clipboard.read('NSFilenamesPboardType'));
  }

  const fileUrl = clipboard
    .read('public.file-url')
    .replace('file://', '')
    .trim();
  return fileUrl ? [fileUrl] : [];
};

const readFilePaths = (clipboard: ElectronClipboardLike): string[] => {
  if (process.platform === 'win32') {
    return readWindowsFilePaths();
  }

  if (process.platform === 'darwin') {
    return readMacFilePaths(clipboard);
  }

  return [];
};

const writeWindowsFilePaths = (files: string[]): boolean => {
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
      return readWindowsFilePaths();
    }
    const electron = tryLoadElectron();
    if (!electron) return [];
    if (process.platform === 'darwin') {
      return readMacFilePaths(electron.clipboard);
    }
    return [];
  },

  writeFilePaths(files: string[]): boolean {
    if (!Array.isArray(files) || files.length === 0) return false;
    if (process.platform === 'win32') {
      return writeWindowsFilePaths(files);
    }
    return false;
  },
};
