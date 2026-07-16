"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.system = void 0;
const windows_1 = require("./windows");
const tryLoadAddon = () => {
    if (process.platform !== 'win32')
        return null;
    try {
        return require('../../native');
    }
    catch {
        return null;
    }
};
const readFolderPathSync = () => {
    var _a, _b;
    const addon = tryLoadAddon();
    if (!addon)
        return '';
    try {
        return String((_b = (_a = addon.getFolderOpenPathSync) === null || _a === void 0 ? void 0 : _a.call(addon)) !== null && _b !== void 0 ? _b : '');
    }
    catch {
        return '';
    }
};
const readFolderPathAsync = async () => {
    var _a;
    const addon = tryLoadAddon();
    if (!(addon === null || addon === void 0 ? void 0 : addon.getFolderOpenPath))
        return '';
    try {
        return String((_a = (await addon.getFolderOpenPath())) !== null && _a !== void 0 ? _a : '');
    }
    catch {
        return '';
    }
};
exports.system = {
    async getFolderOpenPath() {
        return readFolderPathAsync();
    },
    getFolderOpenPathSync() {
        return readFolderPathSync();
    },
    async getActiveWindow() {
        if (process.platform === 'win32') {
            return (0, windows_1.getWindowsActiveWindow)();
        }
        return null;
    },
};
//# sourceMappingURL=index.js.map