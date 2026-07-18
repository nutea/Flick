"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.simulateCopyShortcut = simulateCopyShortcut;
exports.getSelectedText = getSelectedText;
exports.getSelectedFilePaths = getSelectedFilePaths;
exports.getClipboardChangeToken = getClipboardChangeToken;
exports.getActiveWindowFallbackPath = getActiveWindowFallbackPath;
exports.onNativeInputEvent = onNativeInputEvent;
const flick_native_1 = require("flick-native");
async function simulateCopyShortcut() {
    await flick_native_1.input.sendCopyShortcut();
}
async function getSelectedText() {
    return flick_native_1.system.getSelectedText();
}
async function getSelectedFilePaths() {
    return flick_native_1.system.getSelectedFilePaths();
}
function getClipboardChangeToken() {
    return flick_native_1.clipboard.getChangeToken();
}
async function getActiveWindowFallbackPath(runtime = flick_native_1.system) {
    var _a, _b;
    const current = await runtime.getActiveWindow();
    const activePath = String((_a = current === null || current === void 0 ? void 0 : current.path) !== null && _a !== void 0 ? _a : '');
    if (!activePath)
        return '';
    const executable = (_b = activePath.split(/[/\\]/).pop()) === null || _b === void 0 ? void 0 : _b.toLowerCase();
    if (executable === 'explorer.exe') {
        return runtime.getForegroundFolderPath();
    }
    return activePath;
}
function onNativeInputEvent(listener) {
    return flick_native_1.input.onInputEvent(listener);
}
