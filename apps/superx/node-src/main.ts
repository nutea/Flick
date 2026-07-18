import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import createPanelWindow from './panel-window';
import {
  getActiveWindowFallbackPath,
  getActiveWindowSnapshot,
  getClipboardChangeToken,
  getSelectedFilePaths,
  getSelectedText,
  onNativeInputEvent,
  simulateCopyShortcut,
} from './native';
import {
  getPos,
  getSelectedContent,
  isDirectorySelection,
} from './clipboard-helpers';
import {
  DEFAULT_KEYBOARD_SHORTCUT,
  normalizeKeyboardShortcut,
} from './shortcut';

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

type TriggerButton = (typeof BTN)[keyof typeof BTN];

function isMouseTrigger(s: string): boolean {
  return Object.values(SP_MOUSE).includes(
    s as (typeof SP_MOUSE)[keyof typeof SP_MOUSE]
  );
}

type FlickCtx = any;

function createPlugin() {
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
      const { clipboard, screen, globalShortcut, API, ipcMain, nativeImage } =
        ctx;

      ctx.app?.once('before-quit', () => {
        requestSequence += 1;
        if (keyboardRegisterTimer) {
          clearTimeout(keyboardRegisterTimer);
          keyboardRegisterTimer = null;
        }
        if (lastRegisteredKey && !isMouseTrigger(lastRegisteredKey)) {
          try {
            globalShortcut.unregister(lastRegisteredKey);
          } catch {
            /* Electron may already be tearing down global shortcuts. */
          }
        }
        lastRegisteredKey = null;
        clearMouseRegistration();
      });

      const panelInstance = createPanelWindow(ctx);
      panelInstance.init();
      let requestSequence = 0;

      const showSuperPanel = async (trigger: 'keyboard' | 'mouse') => {
        if (process.env.FLICK_NATIVE_DEBUG) {
          console.info(`[flick-system-super-panel] triggered: ${trigger}`);
        }
        const requestId = ++requestSequence;
        // Capture the source application immediately. Clipboard simulation and
        // Finder automation must not change which window supplies the fallback.
        const activeWindowPromise = getActiveWindowSnapshot();
        const { x, y } = screen.getCursorScreenPoint();
        if (trigger === 'keyboard') {
          await new Promise((resolve) => setTimeout(resolve, 40));
        }
        const copyResult = await getSelectedContent(clipboard, simulateCopy, {
          readSelectedText: getSelectedText,
          readSelectedFilePaths: getSelectedFilePaths,
          getClipboardChangeToken,
        });
        if (process.env.FLICK_NATIVE_DEBUG) {
          console.info(
            '[flick-system-super-panel] selection:',
            JSON.stringify({
              status: copyResult.status,
              source: 'source' in copyResult ? copyResult.source : null,
              hasText: copyResult.text.length > 0,
              fileUrl: copyResult.fileUrl,
            })
          );
        }
        if (requestId !== requestSequence) return;

        if (!copyResult.text && !copyResult.fileUrl) {
          copyResult.fileUrl = await getActiveWindowFallbackPath(
            undefined,
            await activeWindowPromise
          );
        }
        if (requestId !== requestSequence) return;

        const win = panelInstance.getWindow();
        if (!win) return;
        await panelInstance.whenReady();
        if (requestId !== requestSequence || win.isDestroyed()) return;

        if (panelInstance.isPinned() && win.isVisible()) {
          panelInstance.resetPin();
          win.hide();
        }

        const localPlugins = API.getLocalPlugins();

        let selectedFileIsDirectory = false;
        let selectedFileDataUrl = '';
        if (typeof copyResult.fileUrl === 'string' && copyResult.fileUrl) {
          const selectedPath = copyResult.fileUrl.replace(/^file:\/\//, '');
          try {
            const stat = fs.statSync(selectedPath);
            selectedFileIsDirectory = isDirectorySelection(
              selectedPath,
              stat.isDirectory()
            );
            if (
              stat.isFile() &&
              stat.size <= 20 * 1024 * 1024 &&
              /\.(png|jpe?g|gif|webp)$/i.test(path.extname(selectedPath))
            ) {
              selectedFileDataUrl = nativeImage
                .createFromPath(selectedPath)
                .toDataURL();
            }
          } catch {
            /* selected application/window paths are not always filesystem items */
          }
        }

        const cursor = getPos(screen, { x, y }, isMacOS);
        panelInstance.beginPlacement(requestId, cursor);

        await new Promise<void>((resolve) => {
          const ms = 800;
          const timer = setTimeout(() => {
            ipcMain.removeListener('superPanel-content-applied', onApplied);
            resolve();
          }, ms);
          const onApplied = (
            event: { sender: { id: number } },
            appliedRequestId: unknown
          ) => {
            if (
              !win ||
              (typeof win.isDestroyed === 'function' && win.isDestroyed())
            )
              return;
            if (event.sender.id !== win.webContents.id) return;
            if (appliedRequestId !== requestId) return;
            clearTimeout(timer);
            ipcMain.removeListener('superPanel-content-applied', onApplied);
            resolve();
          };
          ipcMain.on('superPanel-content-applied', onApplied);
          win.webContents.send('trigger-super-panel', {
            requestId,
            ...copyResult,
            optionPlugin: localPlugins,
            selectedFileIsDirectory,
            selectedFileDataUrl,
          });
        });
        if (requestId !== requestSequence) return;

        win.setAlwaysOnTop(true);
        win.show();
        win.focus();

        if (process.env.FLICK_SUPER_PANEL_SMOKE === '1') {
          const result = await win.webContents.executeJavaScript(`({
            bridgeAvailable: typeof window.superPanel === 'object',
            nodeRequireType: typeof window.require,
            renderedText: document.body.innerText.slice(0, 300)
          })`);
          const preferences = win.webContents.getLastWebPreferences();
          const secure =
            result.bridgeAvailable === true &&
            result.nodeRequireType === 'undefined' &&
            preferences.contextIsolation === true &&
            preferences.nodeIntegration === false &&
            preferences.sandbox === true &&
            preferences.webSecurity === true;
          const report = { secure, preferences, result };
          if (secure) {
            console.info(
              '[flick-system-super-panel] smoke passed:',
              JSON.stringify(report)
            );
          } else {
            console.error(
              '[flick-system-super-panel] smoke failed:',
              JSON.stringify(report)
            );
          }
        }
      };

      let isFirstRegister = true;

      const register = async () => {
        if (keyboardRegisterTimer) {
          clearTimeout(keyboardRegisterTimer);
          keyboardRegisterTimer = null;
        }

        const dbStore = (await API.dbGet({ data: { id: STORE_ID } })) || {};
        const storedHotKey: string = dbStore.value || DEFAULT_KEYBOARD_SHORTCUT;
        const superPanelHotKey = isMouseTrigger(storedHotKey)
          ? storedHotKey
          : normalizeKeyboardShortcut(storedHotKey);
        if (storedHotKey !== superPanelHotKey) {
          console.warn(
            `[flick-system-super-panel] invalid shortcut ${JSON.stringify(storedHotKey)}; using ${superPanelHotKey}`
          );
        }

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
            const registered = globalShortcut.register(superPanelHotKey, () => {
              void showSuperPanel('keyboard');
            });
            if (!registered) {
              console.warn(
                `[flick-system-super-panel] shortcut is unavailable: ${superPanelHotKey}`
              );
            } else if (process.env.FLICK_NATIVE_DEBUG) {
              console.info(
                `[flick-system-super-panel] shortcut registered: ${superPanelHotKey}`
              );
            }
          } catch (err) {
            console.warn(
              '[flick-system-super-panel] globalShortcut.register failed:',
              err
            );
          }
        }, delayMs);
      };

      const scheduleRegister = () => {
        void register();
      };

      (
        globalThis as typeof globalThis & {
          __superPanelReregister?: () => void;
        }
      ).__superPanelReregister = scheduleRegister;
      await register();

      if (!ctx.app?.isPackaged && process.env.FLICK_SUPER_PANEL_SMOKE === '1') {
        setTimeout(() => void showSuperPanel('keyboard'), 1400);
      }
    },
  };
}

export = createPlugin;
