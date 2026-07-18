import { BrowserWindow } from 'electron';
import { windowGeometryController } from './windowGeometryController';

/**
 * Compatibility boundary for existing callers. Geometry decisions and writes
 * are owned by WindowGeometryController.
 */
export function applyMainWindowContentHeight(
  win: BrowserWindow,
  targetHeight: number
): void {
  windowGeometryController.resizeMainContent(win, targetHeight);
}
