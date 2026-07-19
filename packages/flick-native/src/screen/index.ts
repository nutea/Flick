import type { NativeScreenApi, NativeScreenRegion } from '../types';
import type { NativeAddon } from '../../native';

const tryLoadAddon = (): NativeAddon | null => {
  try {
    return require('../../native') as NativeAddon;
  } catch {
    return null;
  }
};

export const screen: NativeScreenApi = {
  isAvailable(): boolean {
    return typeof tryLoadAddon()?.captureScreenRegion === 'function';
  },
  async captureRegion(region: NativeScreenRegion): Promise<Buffer> {
    const addon = tryLoadAddon();
    if (!addon?.captureScreenRegion) {
      throw new Error('Native screen capture is unavailable on this build');
    }

    const { x, y, width, height } = region;
    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isInteger(width) ||
      !Number.isInteger(height) ||
      width <= 0 ||
      height <= 0
    ) {
      throw new TypeError('Screenshot region is invalid');
    }

    return addon.captureScreenRegion(
      Math.round(x),
      Math.round(y),
      width,
      height
    );
  },
};
