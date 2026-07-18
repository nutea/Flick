import type { NativeSystemApi, NativeWindowInfo } from '../types';
import { getWindowsActiveWindow } from './windows';

const tryLoadAddon = () => {
  if (process.platform !== 'win32') return null;
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

export const system: NativeSystemApi = {
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
    if (process.platform === 'win32') {
      return getWindowsActiveWindow();
    }

    return null;
  },
};
