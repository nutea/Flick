import type { NativeWindowInfo } from '../types';

const tryLoadAddon = () => {
  try {
    return require('../../native');
  } catch {
    return null;
  }
};

export const getWindowsActiveWindow =
  async (): Promise<NativeWindowInfo | null> => {
    const addon = tryLoadAddon();
    if (!addon?.getActiveWindow) return null;

    try {
      // Native side resolves on the libuv worker pool, so this `await`
      // does not block the Node main thread on `OpenProcess` calls.
      const current = await addon.getActiveWindow();
      if (!current) return null;

      return {
        title: current.title || '',
        path: current.path,
        processId: current.processId,
        appName: current.appName,
        x: current.x,
        y: current.y,
        width: current.width,
        height: current.height,
      };
    } catch {
      return null;
    }
  };
