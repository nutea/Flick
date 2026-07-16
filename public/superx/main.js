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
const panel_window_1 = __importDefault(require("./panel-window"));
const native_1 = require("./native");
const clipboard_helpers_1 = require("./clipboard-helpers");
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
/** 窗口顶边略低于光标，避免无边框窗顶缘与指针重合触发系统调整大小 */
const SUPER_PANEL_TOP_CURSOR_GAP_PX = 12;
function isMouseTrigger(s) {
    return Object.values(SP_MOUSE).includes(s);
}
function createPlugin() {
    /** 上次呼出面板时记录的剪贴板快照；与当前不一致且无选区复制时，仍用当前剪贴板处理一次 */
    let lastPanelClipboardSnap = null;
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
            const { clipboard, screen, globalShortcut, API, ipcMain } = ctx;
            const panelInstance = (0, panel_window_1.default)(ctx);
            panelInstance.init();
            const showSuperPanel = async (trigger) => {
                const { x, y } = screen.getCursorScreenPoint();
                if (trigger === 'keyboard') {
                    await new Promise((resolve) => setTimeout(resolve, 40));
                }
                let copyResult = await (0, clipboard_helpers_1.getSelectedContent)(clipboard, simulateCopy);
                const snapNow = (0, clipboard_helpers_1.snapshotClipboard)(clipboard);
                if (!copyResult.text && !copyResult.fileUrl) {
                    if (lastPanelClipboardSnap === null ||
                        !(0, clipboard_helpers_1.clipboardSnapsEqual)(snapNow, lastPanelClipboardSnap)) {
                        copyResult = (0, clipboard_helpers_1.readClipboardPayload)(clipboard);
                    }
                }
                if (!copyResult.text && !copyResult.fileUrl) {
                    const nativeWinInfo = await (0, native_1.getActiveWindowInfo)();
                    copyResult.fileUrl = (nativeWinInfo === null || nativeWinInfo === void 0 ? void 0 : nativeWinInfo.path) || copyResult.fileUrl;
                }
                lastPanelClipboardSnap = (0, clipboard_helpers_1.snapshotClipboard)(clipboard);
                const win = panelInstance.getWindow();
                if (!win)
                    return;
                if (panelInstance.isPinned() && win.isVisible()) {
                    panelInstance.resetPin();
                    win.hide();
                }
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const localPlugins = global.LOCAL_PLUGINS.getLocalPlugins();
                const cursor = (0, clipboard_helpers_1.getPos)(screen, { x, y }, isMacOS);
                const placePanelAtCursor = () => {
                    if (!win || (typeof win.isDestroyed === 'function' && win.isDestroyed()))
                        return;
                    const bounds = win.getBounds();
                    let left = Math.round(cursor.x - bounds.width / 2);
                    let top = Math.round(cursor.y + SUPER_PANEL_TOP_CURSOR_GAP_PX);
                    try {
                        const disp = screen.getDisplayNearestPoint({ x: cursor.x, y: cursor.y });
                        const wa = disp.workArea;
                        left = Math.max(wa.x, Math.min(left, wa.x + wa.width - bounds.width));
                        top = Math.max(wa.y, Math.min(top, wa.y + wa.height - bounds.height));
                    }
                    catch {
                        /* ignore clamp if display API fails */
                    }
                    win.setPosition(left, top);
                    panelInstance.setPanelPositionAnchor(left, top);
                };
                await new Promise((resolve) => {
                    const ms = 800;
                    const timer = setTimeout(() => {
                        ipcMain.removeListener('superPanel-content-applied', onApplied);
                        resolve();
                    }, ms);
                    const onApplied = (event) => {
                        if (!win || (typeof win.isDestroyed === 'function' && win.isDestroyed()))
                            return;
                        if (event.sender.id !== win.webContents.id)
                            return;
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
                const superPanelHotKey = dbStore.value || 'Ctrl+W';
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
                        globalShortcut.register(superPanelHotKey, () => {
                            void showSuperPanel('keyboard');
                        });
                    }
                    catch (err) {
                        console.warn('[flick-system-super-panel] globalShortcut.register failed:', err);
                    }
                }, delayMs);
            };
            const scheduleRegister = () => {
                void register();
            };
            globalThis.__superPanelReregister =
                scheduleRegister;
            await register();
        },
    };
}
module.exports = createPlugin;
