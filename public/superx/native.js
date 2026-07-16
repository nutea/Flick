"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.simulateCopyShortcut = simulateCopyShortcut;
exports.getActiveWindowInfo = getActiveWindowInfo;
exports.onNativeInputEvent = onNativeInputEvent;
const flick_native_1 = require("flick-native");
async function simulateCopyShortcut() {
    await flick_native_1.input.sendCopyShortcut();
}
async function getActiveWindowInfo() {
    const current = await flick_native_1.system.getActiveWindow();
    if (!current)
        return null;
    return {
        path: current.path,
    };
}
function onNativeInputEvent(listener) {
    return flick_native_1.input.onInputEvent(listener);
}
