"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.simulateCopyShortcut = simulateCopyShortcut;
exports.getSelectedText = getSelectedText;
exports.getSelectedFilePaths = getSelectedFilePaths;
exports.getClipboardChangeToken = getClipboardChangeToken;
exports.getActiveWindowSnapshot = getActiveWindowSnapshot;
exports.getActiveWindowFallbackPath = getActiveWindowFallbackPath;
exports.onNativeInputEvent = onNativeInputEvent;
const flick_native_1 = require("flick-native");
async function resolveWithin(promise, timeoutMs, fallback) {
    let timer;
    try {
        return await Promise.race([
            promise.catch(() => fallback),
            new Promise((resolve) => {
                timer = setTimeout(() => resolve(fallback), timeoutMs);
            }),
        ]);
    }
    finally {
        if (timer)
            clearTimeout(timer);
    }
}
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
function getActiveWindowSnapshot(runtime = flick_native_1.system, timeoutMs = 200) {
    return resolveWithin(runtime.getActiveWindow(), timeoutMs, null);
}
const LINUX_FILE_MANAGERS = new Set([
    'caja',
    'dolphin',
    'nautilus',
    'nemo',
    'nemo-desktop',
    'pcmanfm',
    'pcmanfm-qt',
    'spacefm',
    'thunar',
]);
function isLinuxFileManager(executable, appName, platform) {
    var _a;
    if (platform !== 'linux')
        return false;
    const normalizedExecutable = executable.replace(/\.bin$/i, '');
    const normalizedAppName = appName.replace(/\.desktop$/i, '');
    const appNameTail = (_a = normalizedAppName.split('.').pop()) !== null && _a !== void 0 ? _a : normalizedAppName;
    return (LINUX_FILE_MANAGERS.has(normalizedExecutable) ||
        LINUX_FILE_MANAGERS.has(normalizedAppName) ||
        LINUX_FILE_MANAGERS.has(appNameTail));
}
async function getActiveWindowFallbackPath(runtime = flick_native_1.system, snapshot, folderTimeoutMs = 500, platform = process.platform) {
    var _a, _b, _c, _d;
    const current = snapshot === undefined ? await getActiveWindowSnapshot(runtime) : snapshot;
    const activePath = String((_a = current === null || current === void 0 ? void 0 : current.path) !== null && _a !== void 0 ? _a : '');
    if (!activePath)
        return '';
    const executable = (_c = (_b = activePath.split(/[/\\]/).pop()) === null || _b === void 0 ? void 0 : _b.toLowerCase()) !== null && _c !== void 0 ? _c : '';
    const appName = String((_d = current === null || current === void 0 ? void 0 : current.appName) !== null && _d !== void 0 ? _d : '').toLowerCase();
    const isWindowsExplorer = executable === 'explorer.exe';
    const isMacFinder = appName === 'finder' ||
        executable === 'finder.app' ||
        /(?:^|[/\\])finder\.app(?:[/\\]|$)/i.test(activePath);
    const isLinuxManager = isLinuxFileManager(executable, appName, platform);
    if (isWindowsExplorer || isMacFinder || isLinuxManager) {
        // A file-manager process path describes the application itself, not the
        // content under the pointer. Never expose the file-manager executable as a
        // selected filesystem item; an empty result means no reliable fallback.
        return resolveWithin(runtime.getForegroundFolderPath(), folderTimeoutMs, '');
    }
    return activePath;
}
function onNativeInputEvent(listener) {
    return flick_native_1.input.onInputEvent(listener);
}
