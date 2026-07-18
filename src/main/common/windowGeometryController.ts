import { BrowserWindow, screen, type Display } from 'electron';
import {
  WINDOW_HEIGHT,
  WINDOW_MIN_HEIGHT,
  WINDOW_MIN_WIDTH,
  WINDOW_WIDTH,
} from '@/common/constans/common';
import {
  defaultLauncherBounds,
  fitRectBelowPoint,
  pointFromRelativeAnchor,
  rectForAtomicUpdate,
  relativeAnchorForPoint,
  type RelativeWindowAnchor,
  type WindowRect,
} from '@/common/utils/windowGeometry';
import { boundsWithLockedHeight } from '@/common/utils/windowResize';

const WINDOW_MARGIN = 8;
const UNBOUNDED_WINDOW_SIZE = 100_000;
const LINUX_PROGRAMMATIC_MOVE_GUARD_MS = 150;
const POSITION_ROUNDING_TOLERANCE_DIP = 1;

/**
 * Sole owner of main-launcher geometry. A preferred anchor is only updated by
 * a confirmed user drag; temporary work-area avoidance never becomes a new
 * user preference.
 */
class WindowGeometryController {
  private mainWindow?: BrowserWindow;
  private readonly launcherAnchors = new Map<string, RelativeWindowAnchor>();
  private manualMoveInProgress = false;
  private suppressLinuxMoveUntil = 0;
  private desiredMainContentWidth = WINDOW_WIDTH;
  private desiredMainContentHeight = WINDOW_HEIGHT;
  private pluginViewActive = false;
  private screenListenersAttached = false;

  attachMainWindow(win: BrowserWindow): void {
    if (this.mainWindow === win) return;
    this.mainWindow = win;
    this.attachScreenListeners();
    win.on('will-move', () => {
      this.manualMoveInProgress = true;
    });
    win.on('will-resize', (event, proposedBounds) => {
      this.desiredMainContentWidth = proposedBounds.width;
      if (this.pluginViewActive) {
        this.desiredMainContentHeight = proposedBounds.height;
        return;
      }
      const current = win.getBounds();
      const constrained = boundsWithLockedHeight(current, proposedBounds);
      if (!constrained) return;

      event.preventDefault();
      if (
        constrained.x === current.x &&
        constrained.y === current.y &&
        constrained.width === current.width &&
        constrained.height === current.height
      ) {
        return;
      }
      this.markProgrammaticMutation();
      win.setBounds(constrained, false);
    });
    win.on('resize', () => {
      if (win.isDestroyed()) return;
      const { width, height } = win.getContentBounds();
      this.desiredMainContentWidth = width;
      if (this.pluginViewActive) this.desiredMainContentHeight = height;
    });
    win.on('move', () => this.handleMainWindowMove());
    win.on('moved', () => {
      const wasManualMove = this.manualMoveInProgress;
      if (wasManualMove) this.recordPreferredAnchor(win);
      this.manualMoveInProgress = false;
      if (wasManualMove) {
        this.resizeMainContent(win, this.desiredMainContentHeight);
      }
    });
    win.on('closed', () => {
      if (this.mainWindow === win) {
        this.mainWindow = undefined;
        this.pluginViewActive = false;
      }
    });
    this.lockMainWindowHeight(win, win.getBounds().height);
  }

  setPluginViewActive(win: BrowserWindow, active: boolean): void {
    if (win.isDestroyed()) return;
    this.attachMainWindow(win);
    this.pluginViewActive = active;
    if (active) {
      win.setMinimumSize(WINDOW_MIN_WIDTH, WINDOW_MIN_HEIGHT);
      win.setMaximumSize(UNBOUNDED_WINDOW_SIZE, UNBOUNDED_WINDOW_SIZE);
    } else {
      this.lockMainWindowHeight(win, win.getBounds().height);
    }
  }

  showMainWindow(win = this.mainWindow): void {
    if (!win || win.isDestroyed()) return;
    this.attachMainWindow(win);
    const display = screen.getDisplayNearestPoint(
      screen.getCursorScreenPoint()
    );
    const size = {
      width: this.desiredMainContentWidth,
      height: this.desiredMainContentHeight,
    };
    const displayKey = String(display.id);
    const remembered = this.launcherAnchors.get(displayKey);
    const target = remembered
      ? fitRectBelowPoint(
          pointFromRelativeAnchor(remembered, display.workArea, {
            margin: WINDOW_MARGIN,
          }),
          size,
          display.workArea,
          { margin: WINDOW_MARGIN, minHeight: WINDOW_MIN_HEIGHT }
        )
      : defaultLauncherBounds(display.workArea, size, {
          margin: WINDOW_MARGIN,
        });

    if (!remembered) {
      this.launcherAnchors.set(
        displayKey,
        relativeAnchorForPoint(target, display.workArea, {
          margin: WINDOW_MARGIN,
        })
      );
    }
    this.applyMainGeometry(win, target);
    win.show();
    win.focus();
  }

  resizeMainContent(win: BrowserWindow, targetHeight: number): void {
    if (win.isDestroyed()) return;
    this.attachMainWindow(win);
    const height = Math.round(Number(targetHeight));
    if (!Number.isFinite(height) || height < 1) return;
    this.desiredMainContentHeight = height;

    const current = win.getContentBounds();
    const display = this.displayForRect(current);
    const displayKey = String(display.id);
    const remembered = this.launcherAnchors.get(displayKey);

    // The renderer may report its initial height before the hidden launcher has
    // ever been placed. Size it without treating the OS default position as a
    // user preference; showMainWindow will establish the default anchor later.
    if (!win.isVisible() && !remembered) {
      this.setMainContentSize(win, this.desiredMainContentWidth, height);
      return;
    }

    const anchor =
      remembered ??
      relativeAnchorForPoint(current, display.workArea, {
        margin: WINDOW_MARGIN,
      });
    this.launcherAnchors.set(displayKey, anchor);
    this.applyMainGeometry(
      win,
      fitRectBelowPoint(
        pointFromRelativeAnchor(anchor, display.workArea, {
          margin: WINDOW_MARGIN,
        }),
        { width: this.desiredMainContentWidth, height },
        display.workArea,
        { margin: WINDOW_MARGIN, minHeight: WINDOW_MIN_HEIGHT }
      )
    );
  }

  revalidateMainWindow(): void {
    const win = this.mainWindow;
    if (!win || win.isDestroyed() || !win.isVisible()) return;
    const current = win.getContentBounds();
    const display = this.displayForRect(current);
    const displayKey = String(display.id);
    const anchor =
      this.launcherAnchors.get(displayKey) ??
      relativeAnchorForPoint(current, display.workArea, {
        margin: WINDOW_MARGIN,
      });
    this.launcherAnchors.set(displayKey, anchor);
    this.applyMainGeometry(
      win,
      fitRectBelowPoint(
        pointFromRelativeAnchor(anchor, display.workArea, {
          margin: WINDOW_MARGIN,
        }),
        { width: current.width, height: this.desiredMainContentHeight },
        display.workArea,
        { margin: WINDOW_MARGIN, minHeight: WINDOW_MIN_HEIGHT }
      )
    );
  }

  private displayForRect(rect: WindowRect): Display {
    return screen.getDisplayMatching(rect);
  }

  private applyMainGeometry(win: BrowserWindow, target: WindowRect): void {
    const actual = win.getContentBounds();
    const next = rectForAtomicUpdate(
      actual,
      target,
      POSITION_ROUNDING_TOLERANCE_DIP
    );
    if (!next) return;

    // Position and content size must reach the native window manager in one
    // transaction. setContentSize followed by setPosition exposes an
    // intermediate frame and visibly jumps whenever the result count changes.
    this.markProgrammaticMutation();
    if (!this.pluginViewActive) this.lockMainWindowHeight(win, next.height);
    win.setContentBounds(next, false);
  }

  private setMainContentSize(
    win: BrowserWindow,
    width: number,
    height: number
  ): void {
    const [currentWidth, currentHeight] = win.getContentSize();
    const nextWidth = Math.round(width);
    const nextHeight = Math.round(height);
    if (currentWidth === nextWidth && currentHeight === nextHeight) return;
    this.markProgrammaticMutation();
    if (!this.pluginViewActive) this.lockMainWindowHeight(win, nextHeight);
    win.setContentSize(nextWidth, nextHeight, false);
  }

  private lockMainWindowHeight(win: BrowserWindow, height: number): void {
    const safeHeight = Math.max(WINDOW_MIN_HEIGHT, Math.round(height));
    // Temporarily relax both bounds so moving from a larger locked height to a
    // smaller one (or vice versa) is valid on every native window manager.
    win.setMinimumSize(WINDOW_MIN_WIDTH, 0);
    win.setMaximumSize(UNBOUNDED_WINDOW_SIZE, UNBOUNDED_WINDOW_SIZE);
    win.setMinimumSize(WINDOW_MIN_WIDTH, safeHeight);
    win.setMaximumSize(UNBOUNDED_WINDOW_SIZE, safeHeight);
  }

  private markProgrammaticMutation(): void {
    this.suppressLinuxMoveUntil = Date.now() + LINUX_PROGRAMMATIC_MOVE_GUARD_MS;
  }

  private handleMainWindowMove(): void {
    const win = this.mainWindow;
    if (!win || win.isDestroyed()) return;
    const isConfirmedManualMove =
      this.manualMoveInProgress ||
      (process.platform === 'linux' &&
        Date.now() > this.suppressLinuxMoveUntil);
    if (isConfirmedManualMove) this.recordPreferredAnchor(win);
  }

  private recordPreferredAnchor(win: BrowserWindow): void {
    const actual = win.getContentBounds();
    const display = this.displayForRect(actual);
    this.launcherAnchors.set(
      String(display.id),
      relativeAnchorForPoint(actual, display.workArea, {
        margin: WINDOW_MARGIN,
      })
    );
  }

  private attachScreenListeners(): void {
    if (this.screenListenersAttached) return;
    this.screenListenersAttached = true;
    screen.on('display-removed', (_event, display) => {
      this.launcherAnchors.delete(String(display.id));
      this.revalidateMainWindow();
    });
    screen.on('display-added', () => this.revalidateMainWindow());
    screen.on('display-metrics-changed', () => this.revalidateMainWindow());
  }
}

export const windowGeometryController = new WindowGeometryController();
