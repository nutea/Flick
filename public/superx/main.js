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
function describeSelectedFile(selectedPath) {
    const cleanPath = selectedPath.replace(/^file:\/\//, '');
    let isFile = false;
    let isDirectory = false;
    try {
        const stat = fs.statSync(cleanPath);
        isDirectory = (0, clipboard_helpers_1.isDirectorySelection)(cleanPath, stat.isDirectory());
        isFile = stat.isFile();
    }
    catch {
        // Active application/window fallbacks are not guaranteed to be files.
    }
    return {
        path: cleanPath,
        name: path.basename(cleanPath) || cleanPath,
        extension: path.extname(cleanPath),
        isFile,
        isDirectory,
    };
}
function isMouseTrigger(s) {
    return Object.values(SP_MOUSE).includes(s);
}
function createPlugin() {
    let lastRegisteredKey = null;
    let removeInputSubscription = null;
    let longPressTimer = null;
    let longPressButton = null;
    let keyboardRegisterTimer = null;
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
        async onReady(ctx) {
            var _a, _b;
            const { clipboard, screen, globalShortcut, API, ipcMain, nativeImage } = ctx;
            (_a = ctx.app) === null || _a === void 0 ? void 0 : _a.once('before-quit', () => {
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
            });
            const panelInstance = (0, panel_window_1.default)(ctx);
            panelInstance.init();
            let requestSequence = 0;
            const showSuperPanel = async (trigger) => {
                var _a;
                if (process.env.FLICK_NATIVE_DEBUG) {
                    console.info(`[flick-system-super-panel] triggered: ${trigger}`);
                }
                const requestId = ++requestSequence;
                // Capture the source application immediately. Clipboard simulation and
                // Finder automation must not change which window supplies the fallback.
                const activeWindowPromise = (0, native_1.getActiveWindowSnapshot)();
                const { x, y } = screen.getCursorScreenPoint();
                if (trigger === 'keyboard') {
                    await new Promise((resolve) => setTimeout(resolve, 40));
                }
                const copyResult = await (0, clipboard_helpers_1.getSelectedContent)(clipboard, simulateCopy, {
                    readSelectedText: native_1.getSelectedText,
                    readSelectedFilePaths: native_1.getSelectedFilePaths,
                    getClipboardChangeToken: native_1.getClipboardChangeToken,
                });
                if (process.env.FLICK_NATIVE_DEBUG) {
                    console.info('[flick-system-super-panel] selection:', JSON.stringify({
                        status: copyResult.status,
                        source: 'source' in copyResult ? copyResult.source : null,
                        hasText: copyResult.text.length > 0,
                        fileUrl: copyResult.fileUrl,
                    }));
                }
                if (requestId !== requestSequence)
                    return;
                if (!copyResult.text && copyResult.fileUrls.length === 0) {
                    copyResult.fileUrl = await (0, native_1.getActiveWindowFallbackPath)(undefined, await activeWindowPromise);
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
                const selectedFiles = copyResult.fileUrls.map(describeSelectedFile);
                const selectedFileIsDirectory = ((_a = selectedFiles[0]) === null || _a === void 0 ? void 0 : _a.isDirectory) === true;
                let selectedFileDataUrl = '';
                if (selectedFiles.length === 1 && selectedFiles[0].isFile) {
                    const selectedPath = selectedFiles[0].path;
                    try {
                        const stat = fs.statSync(selectedPath);
                        if (stat.isFile() &&
                            stat.size <= 20 * 1024 * 1024 &&
                            /\.(png|jpe?g|gif|webp)$/i.test(path.extname(selectedPath))) {
                            selectedFileDataUrl = nativeImage
                                .createFromPath(selectedPath)
                                .toDataURL();
                        }
                    }
                    catch {
                        /* selected application/window paths are not always filesystem items */
                    }
                }
                const cursor = (0, clipboard_helpers_1.getPos)(screen, { x, y }, isMacOS);
                panelInstance.beginPlacement(requestId, cursor);
                await new Promise((resolve) => {
                    const ms = 800;
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
                    });
                });
                if (requestId !== requestSequence)
                    return;
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
                    removeInputSubscription = (0, native_1.onNativeInputEvent)((event) => {
                        if (event.kind !== 'mouse')
                            return;
                        if (event.button !== wantBtn)
                            return;
                        if (event.state === 'down') {
                            if (!isLong) {
                                void showSuperPanel('mouse');
                                return;
                            }
                            longPressButton = wantBtn;
                            if (longPressTimer)
                                clearTimeout(longPressTimer);
                            longPressTimer = setTimeout(() => {
                                longPressTimer = null;
                                longPressButton = null;
                                void showSuperPanel('mouse');
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
                            void showSuperPanel('keyboard');
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
            if (!((_b = ctx.app) === null || _b === void 0 ? void 0 : _b.isPackaged) && process.env.FLICK_SUPER_PANEL_SMOKE === '1') {
                setTimeout(() => void showSuperPanel('keyboard'), 1400);
            }
        },
    };
}
module.exports = createPlugin;
