import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import createPanelWindow from './panel-window';
import {
  captureSelectionSnapshot,
  getActiveWindowFallbackPath,
  getClipboardChangeToken,
  getSnapshotFallbackPath,
  onNativeInputEvent,
  readClipboardFilePaths,
  restartNativeInputHook,
  setNativeMouseButtonSuppression,
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

interface SelectedFileInfo {
  path: string;
  name: string;
  extension: string;
  isFile: boolean;
  isDirectory: boolean;
}

const FILE_STAT_TIMEOUT_MS = 150;

async function readSelectedFileStat(
  selectedPath: string
): Promise<fs.Stats | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      fs.promises.stat(selectedPath).catch(() => null),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), FILE_STAT_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function describeSelectedFile(
  selectedPath: string
): Promise<SelectedFileInfo> {
  const cleanPath = selectedPath.replace(/^file:\/\//, '');
  let isFile = false;
  let isDirectory = false;
  const stat = await readSelectedFileStat(cleanPath);
  if (stat) {
    isDirectory = isDirectorySelection(cleanPath, stat.isDirectory());
    isFile = stat.isFile();
  }
  return {
    path: cleanPath,
    name: path.basename(cleanPath) || cleanPath,
    extension: path.extname(cleanPath),
    isFile,
    isDirectory,
  };
}

function basicSelectedFile(selectedPath: string): SelectedFileInfo {
  const cleanPath = selectedPath.replace(/^file:\/\//, '');
  return {
    path: cleanPath,
    name: path.basename(cleanPath) || cleanPath,
    extension: path.extname(cleanPath),
    // Clipboard file lists do not carry attributes. Treat an unresolved item
    // as a regular file rather than blocking every item behind a network stat.
    isFile: true,
    isDirectory: false,
  };
}

async function describeSelectedFiles(
  selectedPaths: string[]
): Promise<SelectedFileInfo[]> {
  const results = selectedPaths.map(basicSelectedFile);
  let nextIndex = 0;
  const deadline = Date.now() + FILE_STAT_TIMEOUT_MS;
  const workers = Array.from(
    { length: Math.min(8, selectedPaths.length) },
    async () => {
      while (Date.now() < deadline) {
        const index = nextIndex;
        nextIndex += 1;
        if (index >= selectedPaths.length) return;
        results[index] = await describeSelectedFile(selectedPaths[index]);
      }
    }
  );
  await Promise.all(workers);
  return results;
}

function isMouseTrigger(s: string): boolean {
  return Object.values(SP_MOUSE).includes(
    s as (typeof SP_MOUSE)[keyof typeof SP_MOUSE]
  );
}

type FlickCtx = any;

function createPlugin() {
  let lastRegisteredKey: string | null = null;
  let removeInputSubscription: (() => void) | null = null;
  let removeDismissInputSubscription: (() => void) | null = null;
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;
  let longPressButton: TriggerButton | null = null;
  let keyboardRegisterTimer: ReturnType<typeof setTimeout> | null = null;
  let triggerPromise: Promise<void> | null = null;
  let lastRawInputFallbackLogAt = 0;
  let lastRawInputRecoveryAt = 0;

  function clearMouseRegistration() {
    setNativeMouseButtonSuppression(null);
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
      const restartInputAfterSystemResume = () => {
        if (process.platform !== 'win32') return;
        restartNativeInputHook();
      };
      ctx.powerMonitor?.on('resume', restartInputAfterSystemResume);
      ctx.powerMonitor?.on('unlock-screen', restartInputAfterSystemResume);

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
        removeDismissInputSubscription?.();
        removeDismissInputSubscription = null;
        ctx.powerMonitor?.removeListener(
          'resume',
          restartInputAfterSystemResume
        );
        ctx.powerMonitor?.removeListener(
          'unlock-screen',
          restartInputAfterSystemResume
        );
      });

      const panelInstance = createPanelWindow(ctx);
      panelInstance.init();
      // `blur` remains the primary lifecycle signal. The native pointer
      // subscription covers Windows windows that were shown but denied
      // foreground activation, for which Electron has no blur transition.
      if (process.platform === 'win32') {
        removeDismissInputSubscription = onNativeInputEvent((event) => {
          if (event.kind === 'mouse' && event.state === 'down') {
            panelInstance.dismissAfterPointerDown(
              screen.getCursorScreenPoint()
            );
          }
        });
      }
      let requestSequence = 0;

      const showSuperPanel = async (trigger: 'keyboard' | 'mouse') => {
        const startedAt = Date.now();
        if (process.env.FLICK_NATIVE_DEBUG) {
          console.info(`[flick-system-super-panel] triggered: ${trigger}`);
        }
        const requestId = ++requestSequence;
        // Capture the source application immediately. Clipboard simulation and
        // Finder automation must not change which window supplies the fallback.
        const { x, y } = screen.getCursorScreenPoint();
        const copySelection = async () => {
          // Direct Shell/UIA reads must start at trigger time. Only defer the
          // simulated copy until keyboard shortcut modifiers have been released.
          if (trigger === 'keyboard') {
            await new Promise((resolve) => setTimeout(resolve, 40));
          }
          await simulateCopy();
        };
        const copyResult = await getSelectedContent(clipboard, copySelection, {
          readSelectionSnapshot: captureSelectionSnapshot,
          readClipboardFilePaths,
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
              fileCount: copyResult.fileUrls.length,
              truncated:
                copyResult.status === 'selected'
                  ? copyResult.truncated
                  : (copyResult.snapshot?.truncated ?? false),
              nativeTiming: copyResult.snapshot
                ? {
                    shellMs: copyResult.snapshot.shellMs,
                    textMs: copyResult.snapshot.textMs,
                    totalMs: copyResult.snapshot.totalMs,
                  }
                : null,
            })
          );
        }
        if (requestId !== requestSequence) return;

        if (!copyResult.text && copyResult.fileUrls.length === 0) {
          copyResult.fileUrl = copyResult.snapshot
            ? getSnapshotFallbackPath(copyResult.snapshot)
            : await getActiveWindowFallbackPath();
          copyResult.fileUrls = copyResult.fileUrl ? [copyResult.fileUrl] : [];
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

        // Never synchronously stat every selected item on the Electron main
        // thread. Network drives or unavailable paths otherwise make a large
        // Explorer selection look like the Super Panel has frozen.
        const selectedFiles =
          (copyResult.status === 'selected'
            ? copyResult.selectedFiles
            : undefined) ?? (await describeSelectedFiles(copyResult.fileUrls));
        const selectedFileIsDirectory = selectedFiles[0]?.isDirectory === true;
        let selectedFileDataUrl = '';
        if (selectedFiles.length === 1 && selectedFiles[0].isFile) {
          const selectedPath = selectedFiles[0].path;
          const stat = await readSelectedFileStat(selectedPath);
          if (
            stat?.isFile() &&
            stat.size <= 20 * 1024 * 1024 &&
            /\.(png|jpe?g|gif|webp)$/i.test(path.extname(selectedPath))
          ) {
            selectedFileDataUrl = nativeImage
              .createFromPath(selectedPath)
              .toDataURL();
          }
        }

        const cursor = getPos(screen, { x, y }, isMacOS);
        panelInstance.beginPlacement(requestId, cursor);

        await new Promise<void>((resolve) => {
          const ms = 160;
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
            selectedFiles,
            selectedFileIsDirectory,
            selectedFileDataUrl,
            selectionTruncated:
              copyResult.status === 'selected'
                ? copyResult.truncated
                : (copyResult.snapshot?.truncated ?? false),
          });
        });
        if (requestId !== requestSequence) return;

        win.setAlwaysOnTop(true);
        win.show();
        win.focus();
        win.webContents.focus();
        if (process.env.FLICK_NATIVE_DEBUG) {
          console.info(
            `[flick-system-super-panel] shown after ${Date.now() - startedAt}ms`
          );
        }

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

      const requestSuperPanel = (trigger: 'keyboard' | 'mouse') => {
        // Selection reads mutate the clipboard only in their final fallback.
        // Serialize every trigger source so a keyboard repeat and mouse event
        // cannot race and restore/consume each other's clipboard generation.
        if (triggerPromise) return;
        const pending = showSuperPanel(trigger).catch((error) => {
          console.error(
            `[flick-system-super-panel] ${trigger} trigger failed:`,
            error
          );
        });
        triggerPromise = pending.finally(() => {
          triggerPromise = null;
        });
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

          // Windows 10 Explorer collapses an existing multi-selection when it
          // receives a regular middle-button click. The immediate middle-click
          // trigger is owned by SuperX, so consume it in the native hook before
          // Explorer can mutate the selection. Long-press gestures continue to
          // pass through so normal short clicks retain their platform behavior.
          setNativeMouseButtonSuppression(
            superPanelHotKey === SP_MOUSE.MIDDLE ? BTN.MIDDLE : null
          );

          removeInputSubscription = onNativeInputEvent((event) => {
            if (event.kind !== 'mouse') return;
            if (event.button !== wantBtn) return;

            if (event.state === 'down') {
              if (
                event.source === 'raw-input' &&
                event.hookObserved === false &&
                Date.now() - lastRawInputFallbackLogAt > 60_000
              ) {
                lastRawInputFallbackLogAt = Date.now();
                console.warn(
                  '[flick-system-super-panel] low-level mouse hook missed an event; Raw Input recovered the trigger'
                );
              }
              if (
                event.source === 'raw-input' &&
                event.hookObserved === false &&
                Date.now() - lastRawInputRecoveryAt > 5_000
              ) {
                lastRawInputRecoveryAt = Date.now();
                // Raw Input remains available when Windows silently removes a
                // low-level hook. Rebuild the hook after dispatch so the next
                // Explorer middle click is suppressed before it can collapse
                // a multi-selection.
                setTimeout(restartNativeInputHook, 0);
              }
              if (!isLong) {
                requestSuperPanel('mouse');
                return;
              }

              longPressButton = wantBtn;
              if (longPressTimer) clearTimeout(longPressTimer);
              longPressTimer = setTimeout(() => {
                longPressTimer = null;
                longPressButton = null;
                requestSuperPanel('mouse');
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
              requestSuperPanel('keyboard');
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
        setTimeout(() => requestSuperPanel('keyboard'), 1400);
      }
    },
  };
}

export = createPlugin;
