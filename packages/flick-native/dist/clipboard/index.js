"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.clipboard = void 0;
const tryLoadElectron = () => {
    try {
        return require('electron');
    }
    catch {
        return null;
    }
};
/**
 * Loads the in-repo N-API addon. The addon is the single source of truth for
 * Windows file-path clipboard reads (replaces `electron-clipboard-ex`); on
 * non-Windows platforms it is intentionally absent and we return null.
 */
const tryLoadNativeAddon = () => {
    if (process.platform !== 'win32')
        return null;
    try {
        return require('../../native');
    }
    catch {
        return null;
    }
};
const readWindowsFilePaths = () => {
    const addon = tryLoadNativeAddon();
    if (!(addon === null || addon === void 0 ? void 0 : addon.readClipboardFilePaths))
        return [];
    try {
        const filePaths = addon.readClipboardFilePaths();
        if (!Array.isArray(filePaths))
            return [];
        return filePaths.filter((path) => Boolean(path));
    }
    catch {
        return [];
    }
};
const parseMacFileUrls = (raw) => (raw.match(/<string>.*?<\/string>/g) || [])
    .map((item) => item.replace(/<string>|<\/string>/g, '').trim())
    .filter(Boolean);
const readMacFilePaths = (clipboard) => {
    if (clipboard.has('NSFilenamesPboardType')) {
        return parseMacFileUrls(clipboard.read('NSFilenamesPboardType'));
    }
    const fileUrl = clipboard
        .read('public.file-url')
        .replace('file://', '')
        .trim();
    return fileUrl ? [fileUrl] : [];
};
const readFilePaths = (clipboard) => {
    if (process.platform === 'win32') {
        return readWindowsFilePaths();
    }
    if (process.platform === 'darwin') {
        return readMacFilePaths(clipboard);
    }
    return [];
};
const writeWindowsFilePaths = (files) => {
    const addon = tryLoadNativeAddon();
    if (!(addon === null || addon === void 0 ? void 0 : addon.writeClipboardFilePaths))
        return false;
    try {
        addon.writeClipboardFilePaths(files);
        return true;
    }
    catch {
        return false;
    }
};
exports.clipboard = {
    getChangeToken() {
        const addon = tryLoadNativeAddon();
        if (typeof (addon === null || addon === void 0 ? void 0 : addon.getClipboardChangeToken) !== 'function')
            return null;
        try {
            const token = addon.getClipboardChangeToken();
            return Number.isFinite(token) && token > 0 ? token : null;
        }
        catch {
            return null;
        }
    },
    async getClipboardContent() {
        const electron = tryLoadElectron();
        if (!electron)
            return null;
        const filePaths = readFilePaths(electron.clipboard);
        if (filePaths.length > 0) {
            return {
                type: 'file',
                content: filePaths,
            };
        }
        const text = electron.clipboard.readText('clipboard') || electron.clipboard.readText();
        if (!text)
            return null;
        return {
            type: 'text',
            content: text,
        };
    },
    readFilePaths() {
        if (process.platform === 'win32') {
            return readWindowsFilePaths();
        }
        const electron = tryLoadElectron();
        if (!electron)
            return [];
        if (process.platform === 'darwin') {
            return readMacFilePaths(electron.clipboard);
        }
        return [];
    },
    writeFilePaths(files) {
        if (!Array.isArray(files) || files.length === 0)
            return false;
        if (process.platform === 'win32') {
            return writeWindowsFilePaths(files);
        }
        return false;
    },
};
//# sourceMappingURL=index.js.map