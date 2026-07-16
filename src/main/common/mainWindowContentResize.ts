import { BrowserWindow } from 'electron';
import { WINDOW_WIDTH } from '@/common/constans/common';

const lastAppliedContentHeight = new WeakMap<BrowserWindow, number>();

/**
 * 主窗口（useContentSize）内容区统一改高度：高 DPI 下锚定左上角并迭代修正，避免 setSize 导致位移。
 * 供 setExpendHeight、openPlugin、插件 viewReadyFn 共用，避免与 setContentBounds 混用产生二次跳动。
 */
export function applyMainWindowContentHeight(
  win: BrowserWindow,
  targetHeight: number
): void {
  const h = Math.round(Number(targetHeight));
  if (!Number.isFinite(h) || h < 1) return;

  const last = lastAppliedContentHeight.get(win);
  if (last === h) return;

  const anchor = win.getContentBounds();
  let x = anchor.x;
  let y = anchor.y;
  for (let i = 0; i < 5; i++) {
    win.setContentBounds({
      x,
      y,
      width: WINDOW_WIDTH,
      height: h,
    });
    const cur = win.getContentBounds();
    const dx = anchor.x - cur.x;
    const dy = anchor.y - cur.y;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) break;
    x += dx;
    y += dy;
  }
  lastAppliedContentHeight.set(win, h);
}
