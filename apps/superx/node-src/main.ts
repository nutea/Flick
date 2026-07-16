import * as os from 'os';
import createPanelWindow from './panel-window';
import type { ClipboardSnap } from './clipboard-helpers';
import {
  getActiveWindowInfo,
  onNativeInputEvent,
  simulateCopyShortcut,
} from './native';
import {
  getPos,
  getSelectedContent,
  snapshotClipboard,
  clipboardSnapsEqual,
  readClipboardPayload,
} from './clipboard-helpers';

/** macOS：为可执行文件加执行位；优先仓库根 node_modules（与主应用共用依赖）。 */
const isMacOS = os.type() === 'Darwin';

async function simulateCopy(): Promise<void> {
  await simulateCopyShortcut();
}

const STORE_ID = 'flick-system-super-panel-store';

/** 与插件市场「超级面板」设置页写入的 dbStorage 键一致 */
const SP_MOUSE = {
  MIDDLE: 'flick:sp:mouse-middle',
  LONG_LEFT: 'flick:sp:long-left',
  LONG_RIGHT: 'flick:sp:long-right',
  LONG_MIDDLE: 'flick:sp:long-middle',
} as const;

/** 与 `NativeInputEvent.button` 一致：left / right / middle */
const BTN = {
  LEFT: 'left',
  RIGHT: 'right',
  MIDDLE: 'middle',
} as const;

const LONG_PRESS_MS = 450;

/** 首次注册延迟，避免与 Flick 其它 globalShortcut 抢注册冲突；热更新时为 0 */
const INITIAL_KEYBOARD_REGISTER_MS = 1000;

/** 窗口顶边略低于光标，避免无边框窗顶缘与指针重合触发系统调整大小 */
const SUPER_PANEL_TOP_CURSOR_GAP_PX = 12;

type TriggerButton = (typeof BTN)[keyof typeof BTN];

function isMouseTrigger(s: string): boolean {
  return Object.values(SP_MOUSE).includes(s as (typeof SP_MOUSE)[keyof typeof SP_MOUSE]);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FlickCtx = any;

function createPlugin() {
  /** 上次呼出面板时记录的剪贴板快照；与当前不一致且无选区复制时，仍用当前剪贴板处理一次 */
  let lastPanelClipboardSnap: ClipboardSnap | null = null;

  let lastRegisteredKey: string | null = null;
  let removeInputSubscription: (() => void) | null = null;
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;
  let longPressButton: TriggerButton | null = null;
  let keyboardRegisterTimer: ReturnType<typeof setTimeout> | null = null;

  function clearMouseRegistration() {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    longPressButton = null;
    if (removeInputSubscription) {
      removeInputSubscription();
      removeInputSubscription = null;
    }
  }

  return {
    async onReady(ctx: FlickCtx) {
      const { clipboard, screen, globalShortcut, API, ipcMain } = ctx;

      const panelInstance = createPanelWindow(ctx);
      panelInstance.init();

      const showSuperPanel = async (trigger: 'keyboard' | 'mouse') => {
        const { x, y } = screen.getCursorScreenPoint();
        if (trigger === 'keyboard') {
          await new Promise((resolve) => setTimeout(resolve, 40));
        }
        let copyResult = await getSelectedContent(clipboard, simulateCopy);
        const snapNow = snapshotClipboard(clipboard);

        if (!copyResult.text && !copyResult.fileUrl) {
          if (
            lastPanelClipboardSnap === null ||
            !clipboardSnapsEqual(snapNow, lastPanelClipboardSnap)
          ) {
            copyResult = readClipboardPayload(clipboard);
          }
        }

        if (!copyResult.text && !copyResult.fileUrl) {
          const nativeWinInfo = await getActiveWindowInfo();
          copyResult.fileUrl = nativeWinInfo?.path || copyResult.fileUrl;
        }

        lastPanelClipboardSnap = snapshotClipboard(clipboard);

        const win = panelInstance.getWindow();
        if (!win) return;

        if (panelInstance.isPinned() && win.isVisible()) {
          panelInstance.resetPin();
          win.hide();
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const localPlugins = (global as any).LOCAL_PLUGINS.getLocalPlugins();

        const cursor = getPos(screen, { x, y }, isMacOS);

        const placePanelAtCursor = () => {
          if (!win || (typeof win.isDestroyed === 'function' && win.isDestroyed())) return;
          const bounds = win.getBounds();
          let left = Math.round(cursor.x - bounds.width / 2);
          let top = Math.round(cursor.y + SUPER_PANEL_TOP_CURSOR_GAP_PX);
          try {
            const disp = screen.getDisplayNearestPoint({ x: cursor.x, y: cursor.y });
            const wa = disp.workArea;
            left = Math.max(wa.x, Math.min(left, wa.x + wa.width - bounds.width));
            top = Math.max(wa.y, Math.min(top, wa.y + wa.height - bounds.height));
          } catch {
            /* ignore clamp if display API fails */
          }
          win.setPosition(left, top);
          panelInstance.setPanelPositionAnchor(left, top);
        };

        await new Promise<void>((resolve) => {
          const ms = 800;
          const timer = setTimeout(() => {
            ipcMain.removeListener('superPanel-content-applied', onApplied);
            resolve();
          }, ms);
          const onApplied = (event: { sender: { id: number } }) => {
            if (!win || (typeof win.isDestroyed === 'function' && win.isDestroyed())) return;
            if (event.sender.id !== win.webContents.id) return;
            clearTimeout(timer);
            ipcMain.removeListener('superPanel-content-applied', onApplied);
            resolve();
          };
          ipcMain.on('superPanel-content-applied', onApplied);
          win.webContents.send('trigger-super-panel', {
            ...copyResult,
            optionPlugin: localPlugins,
          });
        });

        placePanelAtCursor();

        win.setAlwaysOnTop(true);
        win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
        win.focus();
        win.setVisibleOnAllWorkspaces(false, { visibleOnFullScreen: true });
        win.show();
      };

      let isFirstRegister = true;

      const register = async () => {
        if (keyboardRegisterTimer) {
          clearTimeout(keyboardRegisterTimer);
          keyboardRegisterTimer = null;
        }

        const dbStore = (await API.dbGet({ data: { id: STORE_ID } })) || {};
        const superPanelHotKey: string = dbStore.value || 'Ctrl+W';

        if (lastRegisteredKey && !isMouseTrigger(lastRegisteredKey)) {
          try {
            globalShortcut.unregister(lastRegisteredKey);
          } catch {
            /* ignore */
          }
        }
        clearMouseRegistration();

        lastRegisteredKey = superPanelHotKey;

        if (isMouseTrigger(superPanelHotKey)) {
          const btnFor = (): TriggerButton | null => {
            if (superPanelHotKey === SP_MOUSE.MIDDLE) return BTN.MIDDLE;
            if (superPanelHotKey === SP_MOUSE.LONG_LEFT) return BTN.LEFT;
            if (superPanelHotKey === SP_MOUSE.LONG_RIGHT) return BTN.RIGHT;
            if (superPanelHotKey === SP_MOUSE.LONG_MIDDLE) return BTN.MIDDLE;
            return null;
          };

          const wantBtn = btnFor();
          if (wantBtn == null) return;

          const isLong =
            superPanelHotKey === SP_MOUSE.LONG_LEFT ||
            superPanelHotKey === SP_MOUSE.LONG_RIGHT ||
            superPanelHotKey === SP_MOUSE.LONG_MIDDLE;

          removeInputSubscription = onNativeInputEvent((event) => {
            if (event.kind !== 'mouse') return;
            if (event.button !== wantBtn) return;

            if (event.state === 'down') {
              if (!isLong) {
                void showSuperPanel('mouse');
                return;
              }

              longPressButton = wantBtn;
              if (longPressTimer) clearTimeout(longPressTimer);
              longPressTimer = setTimeout(() => {
                longPressTimer = null;
                longPressButton = null;
                void showSuperPanel('mouse');
              }, LONG_PRESS_MS);
              return;
            }

            if (!isLong) return;
            if (longPressButton === wantBtn) {
              if (longPressTimer) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
              }
              longPressButton = null;
            }
          });
          return;
        }

        const delayMs = isFirstRegister ? INITIAL_KEYBOARD_REGISTER_MS : 0;
        isFirstRegister = false;

        keyboardRegisterTimer = setTimeout(() => {
          keyboardRegisterTimer = null;
          try {
            globalShortcut.register(superPanelHotKey, () => {
              void showSuperPanel('keyboard');
            });
          } catch (err) {
            console.warn('[flick-system-super-panel] globalShortcut.register failed:', err);
          }
        }, delayMs);
      };

      const scheduleRegister = () => {
        void register();
      };

      (globalThis as typeof globalThis & { __superPanelReregister?: () => void }).__superPanelReregister =
        scheduleRegister;
      await register();
    },
  };
}

export = createPlugin;
