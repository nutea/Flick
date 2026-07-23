import * as fs from 'fs';
import * as path from 'path';
import type {
  NativeSelectedFile,
  NativeSelectionSnapshot,
  NativeSystemApi,
  NativeWindowInfo,
} from '../types';
import { getWindowsActiveWindow } from './windows';

const tryLoadAddon = () => {
  try {
    return require('../../native');
  } catch {
    return null;
  }
};

const readFolderPathSync = (): string => {
  const addon = tryLoadAddon();
  if (!addon) return '';
  try {
    return String(addon.getFolderOpenPathSync?.() ?? '');
  } catch {
    return '';
  }
};

const readFolderPathAsync = async (): Promise<string> => {
  const addon = tryLoadAddon();
  if (!addon?.getFolderOpenPath) return '';
  try {
    return String((await addon.getFolderOpenPath()) ?? '');
  } catch {
    return '';
  }
};

const readForegroundFolderPath = async (): Promise<string> => {
  const addon = tryLoadAddon();
  if (!addon?.getForegroundFolderPath) return '';
  try {
    return String((await addon.getForegroundFolderPath()) ?? '');
  } catch {
    return '';
  }
};

const readSelectedText = async (): Promise<string> => {
  const addon = tryLoadAddon();
  if (!addon?.getSelectedText) return '';
  try {
    return String((await addon.getSelectedText()) ?? '');
  } catch {
    return '';
  }
};

const readSelectedFilePaths = async (): Promise<string[]> => {
  const addon = tryLoadAddon();
  if (!addon?.getSelectedFilePaths) return [];
  try {
    const paths = await addon.getSelectedFilePaths();
    return Array.isArray(paths)
      ? paths.filter((value: unknown): value is string =>
          Boolean(value && typeof value === 'string')
        )
      : [];
  } catch {
    return [];
  }
};

const describeFallbackFile = async (
  filePath: string,
  timeoutMs = 150
): Promise<NativeSelectedFile> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let isDirectory = false;
  try {
    isDirectory = await Promise.race([
      fs.promises
        .stat(filePath)
        .then((stat) => stat.isDirectory())
        .catch(() => false),
      new Promise<false>((resolve) => {
        timer = setTimeout(() => resolve(false), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
  return {
    path: filePath,
    name: path.basename(filePath) || filePath,
    extension: path.extname(filePath),
    isFile: !isDirectory,
    isDirectory,
  };
};

const describeFallbackFiles = async (
  filePaths: string[]
): Promise<NativeSelectedFile[]> => {
  const results = filePaths.slice(0, 100).map((filePath) => ({
    path: filePath,
    name: path.basename(filePath) || filePath,
    extension: path.extname(filePath),
    isFile: true,
    isDirectory: false,
  }));
  let nextIndex = 0;
  const deadline = Date.now() + 200;
  const workers = Array.from(
    { length: Math.min(8, results.length) },
    async () => {
      while (Date.now() < deadline) {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= results.length) return;
        results[index] = await describeFallbackFile(
          filePaths[index],
          Math.max(1, deadline - Date.now())
        );
      }
    }
  );
  await Promise.all(workers);
  return results;
};

const captureSelection = async (
  signal?: AbortSignal
): Promise<NativeSelectionSnapshot> => {
  const addon = tryLoadAddon();
  if (typeof addon?.captureSelection === 'function') {
    try {
      const snapshot = await addon.captureSelection(signal);
      if (snapshot && typeof snapshot === 'object') {
        const files = Array.isArray(snapshot.files)
          ? snapshot.files
              .filter((file: unknown): file is NativeSelectedFile =>
                Boolean(
                  file &&
                  typeof file === 'object' &&
                  typeof (file as NativeSelectedFile).path === 'string'
                )
              )
              .slice(0, 100)
          : [];
        const activeWindow = snapshot.activeWindow
          ? {
              ...snapshot.activeWindow,
              title: String(snapshot.activeWindow.title ?? ''),
            }
          : null;
        return {
          source:
            snapshot.source === 'shell' || snapshot.source === 'accessibility'
              ? snapshot.source
              : 'none',
          text: String(snapshot.text ?? ''),
          files,
          truncated: Boolean(snapshot.truncated),
          foregroundFolder: String(snapshot.foregroundFolder ?? ''),
          activeWindow,
          shellMs: Number(snapshot.shellMs) || 0,
          textMs: Number(snapshot.textMs) || 0,
          totalMs: Number(snapshot.totalMs) || 0,
        };
      }
    } catch (error) {
      if (signal?.aborted) throw error;
      // Keep older native builds functional while packages are updated.
    }
  }

  if (signal?.aborted) {
    throw new Error('Selection capture aborted');
  }
  const startedAt = Date.now();
  const [text, paths, activeWindow, foregroundFolder] = await Promise.all([
    readSelectedText(),
    readSelectedFilePaths(),
    getWindowsActiveWindow(),
    readForegroundFolderPath(),
  ]);
  const files = await describeFallbackFiles(paths);
  return {
    source: files.length ? 'shell' : text ? 'accessibility' : 'none',
    text: files.length ? '' : text,
    files,
    truncated: paths.length > files.length,
    foregroundFolder,
    activeWindow,
    shellMs: 0,
    textMs: 0,
    totalMs: Date.now() - startedAt,
  };
};

export const system: NativeSystemApi = {
  async captureSelection(
    signal?: AbortSignal
  ): Promise<NativeSelectionSnapshot> {
    return captureSelection(signal);
  },
  async getForegroundFolderPath(): Promise<string> {
    return readForegroundFolderPath();
  },
  async getSelectedFilePaths(): Promise<string[]> {
    return readSelectedFilePaths();
  },
  async getSelectedText(): Promise<string> {
    return readSelectedText();
  },
  async getFolderOpenPath(): Promise<string> {
    return readFolderPathAsync();
  },
  getFolderOpenPathSync(): string {
    return readFolderPathSync();
  },
  async getActiveWindow(): Promise<NativeWindowInfo | null> {
    return getWindowsActiveWindow();
  },
};
