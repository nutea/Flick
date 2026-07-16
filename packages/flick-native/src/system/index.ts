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

export const system: NativeSystemApi = {
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
