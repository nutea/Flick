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
Object.defineProperty(exports, "__esModule", { value: true });
exports.system = void 0;
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const windows_1 = require("./windows");
const tryLoadAddon = () => {
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
const readForegroundFolderPath = async () => {
    var _a;
    const addon = tryLoadAddon();
    if (!(addon === null || addon === void 0 ? void 0 : addon.getForegroundFolderPath))
        return '';
    try {
        return String((_a = (await addon.getForegroundFolderPath())) !== null && _a !== void 0 ? _a : '');
    }
    catch {
        return '';
    }
};
const readSelectedText = async () => {
    var _a;
    const addon = tryLoadAddon();
    if (!(addon === null || addon === void 0 ? void 0 : addon.getSelectedText))
        return '';
    try {
        return String((_a = (await addon.getSelectedText())) !== null && _a !== void 0 ? _a : '');
    }
    catch {
        return '';
    }
};
const readSelectedFilePaths = async () => {
    const addon = tryLoadAddon();
    if (!(addon === null || addon === void 0 ? void 0 : addon.getSelectedFilePaths))
        return [];
    try {
        const paths = await addon.getSelectedFilePaths();
        return Array.isArray(paths)
            ? paths.filter((value) => Boolean(value && typeof value === 'string'))
            : [];
    }
    catch {
        return [];
    }
};
const describeFallbackFile = async (filePath, timeoutMs = 150) => {
    let timer;
    let isDirectory = false;
    try {
        isDirectory = await Promise.race([
            fs.promises
                .stat(filePath)
                .then((stat) => stat.isDirectory())
                .catch(() => false),
            new Promise((resolve) => {
                timer = setTimeout(() => resolve(false), timeoutMs);
            }),
        ]);
    }
    finally {
        if (timer)
            clearTimeout(timer);
    }
    return {
        path: filePath,
        name: path.basename(filePath) || filePath,
        extension: path.extname(filePath),
        isFile: !isDirectory,
        isDirectory,
    };
};
const describeFallbackFiles = async (filePaths) => {
    const results = filePaths.slice(0, 100).map((filePath) => ({
        path: filePath,
        name: path.basename(filePath) || filePath,
        extension: path.extname(filePath),
        isFile: true,
        isDirectory: false,
    }));
    let nextIndex = 0;
    const deadline = Date.now() + 200;
    const workers = Array.from({ length: Math.min(8, results.length) }, async () => {
        while (Date.now() < deadline) {
            const index = nextIndex;
            nextIndex += 1;
            if (index >= results.length)
                return;
            results[index] = await describeFallbackFile(filePaths[index], Math.max(1, deadline - Date.now()));
        }
    });
    await Promise.all(workers);
    return results;
};
const captureSelection = async (signal) => {
    var _a, _b, _c;
    const addon = tryLoadAddon();
    if (typeof (addon === null || addon === void 0 ? void 0 : addon.captureSelection) === 'function') {
        try {
            const snapshot = await addon.captureSelection(signal);
            if (snapshot && typeof snapshot === 'object') {
                const files = Array.isArray(snapshot.files)
                    ? snapshot.files
                        .filter((file) => Boolean(file &&
                        typeof file === 'object' &&
                        typeof file.path === 'string'))
                        .slice(0, 100)
                    : [];
                const activeWindow = snapshot.activeWindow
                    ? {
                        ...snapshot.activeWindow,
                        title: String((_a = snapshot.activeWindow.title) !== null && _a !== void 0 ? _a : ''),
                    }
                    : null;
                return {
                    source: snapshot.source === 'shell' || snapshot.source === 'accessibility'
                        ? snapshot.source
                        : 'none',
                    text: String((_b = snapshot.text) !== null && _b !== void 0 ? _b : ''),
                    files,
                    truncated: Boolean(snapshot.truncated),
                    foregroundFolder: String((_c = snapshot.foregroundFolder) !== null && _c !== void 0 ? _c : ''),
                    activeWindow,
                    shellMs: Number(snapshot.shellMs) || 0,
                    textMs: Number(snapshot.textMs) || 0,
                    totalMs: Number(snapshot.totalMs) || 0,
                };
            }
        }
        catch (error) {
            if (signal === null || signal === void 0 ? void 0 : signal.aborted)
                throw error;
            // Keep older native builds functional while packages are updated.
        }
    }
    if (signal === null || signal === void 0 ? void 0 : signal.aborted) {
        throw new Error('Selection capture aborted');
    }
    const startedAt = Date.now();
    const [text, paths, activeWindow, foregroundFolder] = await Promise.all([
        readSelectedText(),
        readSelectedFilePaths(),
        (0, windows_1.getWindowsActiveWindow)(),
        readForegroundFolderPath(),
    ]);
    const files = await describeFallbackFiles(paths);
    return {
        source: files.length ? 'shell' : text ? 'accessibility' : 'none',
        text: files.length ? '' : text,
        files,
        truncated: paths.length > files.length,
        foregroundFolder,
        activeWindow,
        shellMs: 0,
        textMs: 0,
        totalMs: Date.now() - startedAt,
    };
};
exports.system = {
    async captureSelection(signal) {
        return captureSelection(signal);
    },
    async getForegroundFolderPath() {
        return readForegroundFolderPath();
    },
    async getSelectedFilePaths() {
        return readSelectedFilePaths();
    },
    async getSelectedText() {
        return readSelectedText();
    },
    async getFolderOpenPath() {
        return readFolderPathAsync();
    },
    getFolderOpenPathSync() {
        return readFolderPathSync();
    },
    async getActiveWindow() {
        return (0, windows_1.getWindowsActiveWindow)();
    },
};
//# sourceMappingURL=index.js.map