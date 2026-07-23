"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
const os = __importStar(require("os"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const panel_window_1 = __importDefault(require("./panel-window"));
const native_1 = require("./native");
const clipboard_helpers_1 = require("./clipboard-helpers");
const shortcut_1 = require("./shortcut");
/** macOS：为可执行文件加执行位；优先仓库根 node_modules（与主应用共用依赖）。 */
const isMacOS = os.type() === 'Darwin';
async function simulateCopy() {
    await (0, native_1.simulateCopyShortcut)();
}
const STORE_ID = 'flick-system-super-panel-store';
/** 与插件市场「超级面板」设置页写入的 dbStorage 键一致 */
const SP_MOUSE = {
    MIDDLE: 'flick:sp:mouse-middle',
    LONG_LEFT: 'flick:sp:long-left',
    LONG_RIGHT: 'flick:sp:long-right',
    LONG_MIDDLE: 'flick:sp:long-middle',
};
/** 与 `NativeInputEvent.button` 一致：left / right / middle */
const BTN = {
    LEFT: 'left',
    RIGHT: 'right',
    MIDDLE: 'middle',
};
const LONG_PRESS_MS = 450;
/** 首次注册延迟，避免与 Flick 其它 globalShortcut 抢注册冲突；热更新时为 0 */
const INITIAL_KEYBOARD_REGISTER_MS = 1000;
const FILE_STAT_TIMEOUT_MS = 150;
async function readSelectedFileStat(selectedPath) {
    let timer;
    try {
        return await Promise.race([
            fs.promises.stat(selectedPath).catch(() => null),
            new Promise((resolve) => {
                timer = setTimeout(() => resolve(null), FILE_STAT_TIMEOUT_MS);
            }),
        ]);
    }
    finally {
        if (timer)
            clearTimeout(timer);
    }
}
async function describeSelectedFile(selectedPath) {
    const cleanPath = selectedPath.replace(/^file:\/\//, '');
    let isFile = false;
    let isDirectory = false;
    const stat = await readSelectedFileStat(cleanPath);
    if (stat) {
        isDirectory = (0, clipboard_helpers_1.isDirectorySelection)(cleanPath, stat.isDirectory());
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
function basicSelectedFile(selectedPath) {
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
async function describeSelectedFiles(selectedPaths) {
    const results = selectedPaths.map(basicSelectedFile);
    let nextIndex = 0;
    const deadline = Date.now() + FILE_STAT_TIMEOUT_MS;
    const workers = Array.from({ length: Math.min(8, selectedPaths.length) }, async () => {
        while (Date.now() < deadline) {
            const index = nextIndex;
            nextIndex += 1;
            if (index >= selectedPaths.length)
                return;
            results[index] = await describeSelectedFile(selectedPaths[index]);
        }
    });
    await Promise.all(workers);
    return results;
}
function isMouseTrigger(s) {
    return Object.values(SP_MOUSE).includes(s);
}
function createPlugin() {
    let lastRegisteredKey = null;
    let removeInputSubscription = null;
    let removeDismissInputSubscription = null;
    let longPressTimer = null;
    let longPressButton = null;
    let keyboardRegisterTimer = null;
    let triggerPromise = null;
    let lastRawInputFallbackLogAt = 0;
    let lastRawInputRecoveryAt = 0;
    function clearMouseRegistration() {
        (0, native_1.setNativeMouseButtonSuppression)(null);
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
        async onReady(ctx) {
            var _a, _b, _c, _d;
            const { clipboard, screen, globalShortcut, API, ipcMain, nativeImage } = ctx;
            const restartInputAfterSystemResume = () => {
                if (process.platform !== 'win32')
                    return;
                (0, native_1.restartNativeInputHook)();
            };
            (_a = ctx.powerMonitor) === null || _a === void 0 ? void 0 : _a.on('resume', restartInputAfterSystemResume);
            (_b = ctx.powerMonitor) === null || _b === void 0 ? void 0 : _b.on('unlock-screen', restartInputAfterSystemResume);
            (_c = ctx.app) === null || _c === void 0 ? void 0 : _c.once('before-quit', () => {
                var _a, _b;
                requestSequence += 1;
                if (keyboardRegisterTimer) {
                    clearTimeout(keyboardRegisterTimer);
                    keyboardRegisterTimer = null;
                }
                if (lastRegisteredKey && !isMouseTrigger(lastRegisteredKey)) {
                    try {
                        globalShortcut.unregister(lastRegisteredKey);
                    }
                    catch {
                        /* Electron may already be tearing down global shortcuts. */
                    }
                }
                lastRegisteredKey = null;
                clearMouseRegistration();
                removeDismissInputSubscription === null || removeDismissInputSubscription === void 0 ? void 0 : removeDismissInputSubscription();
                removeDismissInputSubscription = null;
                (_a = ctx.powerMonitor) === null || _a === void 0 ? void 0 : _a.removeListener('resume', restartInputAfterSystemResume);
                (_b = ctx.powerMonitor) === null || _b === void 0 ? void 0 : _b.removeListener('unlock-screen', restartInputAfterSystemResume);
            });
            const panelInstance = (0, panel_window_1.default)(ctx);
            panelInstance.init();
            // `blur` remains the primary lifecycle signal. The native pointer
            // subscription covers Windows windows that were shown but denied
            // foreground activation, for which Electron has no blur transition.
            if (process.platform === 'win32') {
                removeDismissInputSubscription = (0, native_1.onNativeInputEvent)((event) => {
                    if (event.kind === 'mouse' && event.state === 'down') {
                        panelInstance.dismissAfterPointerDown(screen.getCursorScreenPoint());
                    }
                });
            }
            let requestSequence = 0;
            const showSuperPanel = async (trigger) => {
                var _a, _b, _c, _d;
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
                const copyResult = await (0, clipboard_helpers_1.getSelectedContent)(clipboard, copySelection, {
                    readSelectionSnapshot: native_1.captureSelectionSnapshot,
                    readClipboardFilePaths: native_1.readClipboardFilePaths,
                    getClipboardChangeToken: native_1.getClipboardChangeToken,
                });
                if (process.env.FLICK_NATIVE_DEBUG) {
                    console.info('[flick-system-super-panel] selection:', JSON.stringify({
                        status: copyResult.status,
                        source: 'source' in copyResult ? copyResult.source : null,
                        hasText: copyResult.text.length > 0,
                        fileUrl: copyResult.fileUrl,
                        fileCount: copyResult.fileUrls.length,
                        truncated: copyResult.status === 'selected'
                            ? copyResult.truncated
                            : ((_b = (_a = copyResult.snapshot) === null || _a === void 0 ? void 0 : _a.truncated) !== null && _b !== void 0 ? _b : false),
                        nativeTiming: copyResult.snapshot
                            ? {
                                shellMs: copyResult.snapshot.shellMs,
                                textMs: copyResult.snapshot.textMs,
                                totalMs: copyResult.snapshot.totalMs,
                            }
                            : null,
                    }));
                }
                if (requestId !== requestSequence)
                    return;
                if (!copyResult.text && copyResult.fileUrls.length === 0) {
                    copyResult.fileUrl = copyResult.snapshot
                        ? (0, native_1.getSnapshotFallbackPath)(copyResult.snapshot)
                        : await (0, native_1.getActiveWindowFallbackPath)();
                    copyResult.fileUrls = copyResult.fileUrl ? [copyResult.fileUrl] : [];
                }
                if (requestId !== requestSequence)
                    return;
                const win = panelInstance.getWindow();
                if (!win)
                    return;
                await panelInstance.whenReady();
                if (requestId !== requestSequence || win.isDestroyed())
                    return;
                if (panelInstance.isPinned() && win.isVisible()) {
                    panelInstance.resetPin();
                    win.hide();
                }
                const localPlugins = API.getLocalPlugins();
                // Never synchronously stat every selected item on the Electron main
                // thread. Network drives or unavailable paths otherwise make a large
                // Explorer selection look like the Super Panel has frozen.
                const selectedFiles = (_c = (copyResult.status === 'selected'
                    ? copyResult.selectedFiles
                    : undefined)) !== null && _c !== void 0 ? _c : (await describeSelectedFiles(copyResult.fileUrls));
                const selectedFileIsDirectory = ((_d = selectedFiles[0]) === null || _d === void 0 ? void 0 : _d.isDirectory) === true;
                let selectedFileDataUrl = '';
                if (selectedFiles.length === 1 && selectedFiles[0].isFile) {
                    const selectedPath = selectedFiles[0].path;
                    const stat = await readSelectedFileStat(selectedPath);
                    if ((stat === null || stat === void 0 ? void 0 : stat.isFile()) &&
                        stat.size <= 20 * 1024 * 1024 &&
                        /\.(png|jpe?g|gif|webp)$/i.test(path.extname(selectedPath))) {
                        selectedFileDataUrl = nativeImage
                            .createFromPath(selectedPath)
                            .toDataURL();
                    }
                }
                const cursor = (0, clipboard_helpers_1.getPos)(screen, { x, y }, isMacOS);
                panelInstance.beginPlacement(requestId, cursor);
                await new Promise((resolve) => {
                    var _a, _b;
                    const ms = 160;
                    const timer = setTimeout(() => {
                        ipcMain.removeListener('superPanel-content-applied', onApplied);
                        resolve();
                    }, ms);
                    const onApplied = (event, appliedRequestId) => {
                        if (!win ||
                            (typeof win.isDestroyed === 'function' && win.isDestroyed()))
                            return;
                        if (event.sender.id !== win.webContents.id)
                            return;
                        if (appliedRequestId !== requestId)
                            return;
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
                        selectionTruncated: copyResult.status === 'selected'
                            ? copyResult.truncated
                            : ((_b = (_a = copyResult.snapshot) === null || _a === void 0 ? void 0 : _a.truncated) !== null && _b !== void 0 ? _b : false),
                    });
                });
                if (requestId !== requestSequence)
                    return;
                win.setAlwaysOnTop(true);
                win.show();
                win.focus();
                win.webContents.focus();
                if (process.env.FLICK_NATIVE_DEBUG) {
                    console.info(`[flick-system-super-panel] shown after ${Date.now() - startedAt}ms`);
                }
                if (process.env.FLICK_SUPER_PANEL_SMOKE === '1') {
                    const result = await win.webContents.executeJavaScript(`({
            bridgeAvailable: typeof window.superPanel === 'object',
            nodeRequireType: typeof window.require,
            renderedText: document.body.innerText.slice(0, 300)
          })`);
                    const preferences = win.webContents.getLastWebPreferences();
                    const secure = result.bridgeAvailable === true &&
                        result.nodeRequireType === 'undefined' &&
                        preferences.contextIsolation === true &&
                        preferences.nodeIntegration === false &&
                        preferences.sandbox === true &&
                        preferences.webSecurity === true;
                    const report = { secure, preferences, result };
                    if (secure) {
                        console.info('[flick-system-super-panel] smoke passed:', JSON.stringify(report));
                    }
                    else {
                        console.error('[flick-system-super-panel] smoke failed:', JSON.stringify(report));
                    }
                }
            };
            const requestSuperPanel = (trigger) => {
                // Selection reads mutate the clipboard only in their final fallback.
                // Serialize every trigger source so a keyboard repeat and mouse event
                // cannot race and restore/consume each other's clipboard generation.
                if (triggerPromise)
                    return;
                const pending = showSuperPanel(trigger).catch((error) => {
                    console.error(`[flick-system-super-panel] ${trigger} trigger failed:`, error);
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
                const storedHotKey = dbStore.value || shortcut_1.DEFAULT_KEYBOARD_SHORTCUT;
                const superPanelHotKey = isMouseTrigger(storedHotKey)
                    ? storedHotKey
                    : (0, shortcut_1.normalizeKeyboardShortcut)(storedHotKey);
                if (storedHotKey !== superPanelHotKey) {
                    console.warn(`[flick-system-super-panel] invalid shortcut ${JSON.stringify(storedHotKey)}; using ${superPanelHotKey}`);
                }
                if (lastRegisteredKey && !isMouseTrigger(lastRegisteredKey)) {
                    try {
                        globalShortcut.unregister(lastRegisteredKey);
                    }
                    catch {
                        /* ignore */
                    }
                }
                clearMouseRegistration();
                lastRegisteredKey = superPanelHotKey;
                if (isMouseTrigger(superPanelHotKey)) {
                    const btnFor = () => {
                        if (superPanelHotKey === SP_MOUSE.MIDDLE)
                            return BTN.MIDDLE;
                        if (superPanelHotKey === SP_MOUSE.LONG_LEFT)
                            return BTN.LEFT;
                        if (superPanelHotKey === SP_MOUSE.LONG_RIGHT)
                            return BTN.RIGHT;
                        if (superPanelHotKey === SP_MOUSE.LONG_MIDDLE)
                            return BTN.MIDDLE;
                        return null;
                    };
                    const wantBtn = btnFor();
                    if (wantBtn == null)
                        return;
                    const isLong = superPanelHotKey === SP_MOUSE.LONG_LEFT ||
                        superPanelHotKey === SP_MOUSE.LONG_RIGHT ||
                        superPanelHotKey === SP_MOUSE.LONG_MIDDLE;
                    // Windows 10 Explorer collapses an existing multi-selection when it
                    // receives a regular middle-button click. The immediate middle-click
                    // trigger is owned by SuperX, so consume it in the native hook before
                    // Explorer can mutate the selection. Long-press gestures continue to
                    // pass through so normal short clicks retain their platform behavior.
                    (0, native_1.setNativeMouseButtonSuppression)(superPanelHotKey === SP_MOUSE.MIDDLE ? BTN.MIDDLE : null);
                    removeInputSubscription = (0, native_1.onNativeInputEvent)((event) => {
                        if (event.kind !== 'mouse')
                            return;
                        if (event.button !== wantBtn)
                            return;
                        if (event.state === 'down') {
                            if (event.source === 'raw-input' &&
                                event.hookObserved === false &&
                                Date.now() - lastRawInputFallbackLogAt > 60000) {
                                lastRawInputFallbackLogAt = Date.now();
                                console.warn('[flick-system-super-panel] low-level mouse hook missed an event; Raw Input recovered the trigger');
                            }
                            if (event.source === 'raw-input' &&
                                event.hookObserved === false &&
                                Date.now() - lastRawInputRecoveryAt > 5000) {
                                lastRawInputRecoveryAt = Date.now();
                                // Raw Input remains available when Windows silently removes a
                                // low-level hook. Rebuild the hook after dispatch so the next
                                // Explorer middle click is suppressed before it can collapse
                                // a multi-selection.
                                setTimeout(native_1.restartNativeInputHook, 0);
                            }
                            if (!isLong) {
                                requestSuperPanel('mouse');
                                return;
                            }
                            longPressButton = wantBtn;
                            if (longPressTimer)
                                clearTimeout(longPressTimer);
                            longPressTimer = setTimeout(() => {
                                longPressTimer = null;
                                longPressButton = null;
                                requestSuperPanel('mouse');
                            }, LONG_PRESS_MS);
                            return;
                        }
                        if (!isLong)
                            return;
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
                            console.warn(`[flick-system-super-panel] shortcut is unavailable: ${superPanelHotKey}`);
                        }
                        else if (process.env.FLICK_NATIVE_DEBUG) {
                            console.info(`[flick-system-super-panel] shortcut registered: ${superPanelHotKey}`);
                        }
                    }
                    catch (err) {
                        console.warn('[flick-system-super-panel] globalShortcut.register failed:', err);
                    }
                }, delayMs);
            };
            const scheduleRegister = () => {
                void register();
            };
            globalThis.__superPanelReregister = scheduleRegister;
            await register();
            if (!((_d = ctx.app) === null || _d === void 0 ? void 0 : _d.isPackaged) && process.env.FLICK_SUPER_PANEL_SMOKE === '1') {
                setTimeout(() => requestSuperPanel('keyboard'), 1400);
            }
        },
    };
}
module.exports = createPlugin;
