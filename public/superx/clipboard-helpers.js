"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseMacClipboardFilePaths = parseMacClipboardFilePaths;
exports.getFilePathFromClipboard = getFilePathFromClipboard;
exports.isDirectorySelection = isDirectorySelection;
exports.snapshotClipboard = snapshotClipboard;
exports.readClipboardPayload = readClipboardPayload;
exports.getSelectedContent = getSelectedContent;
exports.getPos = getPos;
const crypto_1 = require("crypto");
const node_url_1 = require("node:url");
function decodeXmlText(value) {
    return value
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&');
}
function decodeMacFilePath(value) {
    const decodedXml = decodeXmlText(value.trim());
    if (!decodedXml)
        return '';
    if (decodedXml.startsWith('file://')) {
        try {
            return (0, node_url_1.fileURLToPath)(decodedXml);
        }
        catch {
            /* Fall through for malformed legacy clipboard URLs. */
        }
    }
    try {
        return decodeURIComponent(decodedXml.replace(/^file:\/\//, ''));
    }
    catch {
        return decodedXml.replace(/^file:\/\//, '');
    }
}
function parseMacClipboardFilePaths(raw) {
    return (raw.match(/<string>[\s\S]*?<\/string>/g) || [])
        .map((item) => item.replace(/^<string>|<\/string>$/g, ''))
        .map(decodeMacFilePath)
        .filter(Boolean);
}
/**
 * 从系统剪贴板解析文件路径 / 图片（与原版 main.js 行为一致）
 */
function getFilePathFromClipboard(clipboard) {
    let filePath = [];
    if (process.platform === 'darwin') {
        if (clipboard.has('NSFilenamesPboardType')) {
            filePath = parseMacClipboardFilePaths(clipboard.read('NSFilenamesPboardType'));
        }
        else {
            const clipboardImage = clipboard.readImage('clipboard');
            if (!clipboardImage.isEmpty()) {
                const png = clipboardImage.toPNG();
                filePath = [
                    {
                        buffer: png,
                        mimetype: 'image/png',
                        originalname: `${(0, crypto_1.randomUUID)()}.png`,
                    },
                ];
            }
            else {
                filePath = [
                    decodeMacFilePath(clipboard.read('public.file-url')),
                ].filter(Boolean);
            }
        }
    }
    else {
        if (clipboard.has('CF_HDROP')) {
            const rawFilePathStr = clipboard.read('CF_HDROP') || '';
            let formatFilePathStr = [...rawFilePathStr]
                .filter((_, index) => rawFilePathStr.charCodeAt(index) !== 0)
                .join('')
                .replace(/\\/g, '\\');
            const drivePrefix = formatFilePathStr.match(/[a-zA-Z]:\\/);
            if (drivePrefix) {
                const drivePrefixIndex = formatFilePathStr.indexOf(drivePrefix[0]);
                if (drivePrefixIndex !== 0) {
                    formatFilePathStr = formatFilePathStr.substring(drivePrefixIndex);
                }
                filePath = formatFilePathStr
                    .split(drivePrefix[0])
                    .filter((item) => item)
                    .map((item) => drivePrefix[0] + item);
            }
        }
        else {
            const clipboardImage = clipboard.readImage('clipboard');
            if (!clipboardImage.isEmpty()) {
                const png = clipboardImage.toPNG();
                filePath = [
                    {
                        buffer: png,
                        mimetype: 'image/png',
                        originalname: `${(0, crypto_1.randomUUID)()}.png`,
                    },
                ];
            }
            else {
                const buf = clipboard.readBuffer('FileNameW');
                filePath = [
                    buf.toString('ucs2').replace(RegExp(String.fromCharCode(0), 'g'), ''),
                ].filter(Boolean);
            }
        }
    }
    return filePath;
}
/** macOS application bundles are directories on disk, but UI treats them as apps/files. */
function isDirectorySelection(selectedPath, statIsDirectory, platform = process.platform) {
    if (!statIsDirectory)
        return false;
    return platform !== 'darwin' || !/\.app\/?$/i.test(selectedPath);
}
function snapshotClipboard(clipboard) {
    const text = clipboard.readText('clipboard') || '';
    const pathStr = getFilePathFromClipboard(clipboard)
        .filter((entry) => typeof entry === 'string' && !!entry)
        .join('\0');
    const im = clipboard.readImage('clipboard');
    const hasImage = !!(im && typeof im.isEmpty === 'function' && !im.isEmpty());
    return { text, pathStr, hasImage };
}
function clipboardSnapsEqual(a, b) {
    return (a.text === b.text && a.pathStr === b.pathStr && a.hasImage === b.hasImage);
}
const MAX_SELECTED_FILES = 100;
function normalizeSelectedPaths(paths) {
    return Array.from(new Set(paths
        .filter((value) => typeof value === 'string')
        .map((value) => value.trim())
        .filter(Boolean))).slice(0, MAX_SELECTED_FILES);
}
/** 从当前剪贴板解析为面板用的 text / 文件路径（路径优先） */
function readClipboardPayload(clipboard) {
    const text = clipboard.readText('clipboard') || '';
    const fileUrls = normalizeSelectedPaths(getFilePathFromClipboard(clipboard));
    const fileUrl = fileUrls[0] || '';
    return {
        text: fileUrl ? '' : text,
        fileUrl,
        fileUrls,
    };
}
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function readDirectValue(reader, timeoutMs, fallback) {
    if (!reader)
        return fallback;
    let timer;
    try {
        return await Promise.race([
            reader().catch(() => fallback),
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
async function getSelectedContent(clipboard, simulateCopy, options = {}) {
    var _a, _b, _c, _d, _e;
    // The two platform reads are independent. Running them together keeps the
    // Finder/Explorer path capability without adding its process/COM latency to
    // every text selection. Both are bounded because automation providers can
    // stall behind a permission prompt or an unresponsive file manager.
    const [directText, selectedPaths] = await Promise.all([
        readDirectValue(options.readSelectedText, (_a = options.directReadTimeoutMs) !== null && _a !== void 0 ? _a : 120, ''),
        readDirectValue(options.readSelectedFilePaths, (_b = options.directFileReadTimeoutMs) !== null && _b !== void 0 ? _b : 400, []),
    ]);
    if (directText.length > 0) {
        return {
            status: 'selected',
            source: 'accessibility',
            text: directText,
            fileUrl: '',
            fileUrls: [],
        };
    }
    const fileUrls = normalizeSelectedPaths(selectedPaths);
    const firstPath = fileUrls[0];
    if (firstPath) {
        return {
            status: 'selected',
            source: 'shell',
            text: '',
            fileUrl: firstPath,
            fileUrls,
        };
    }
    const getChangeToken = options.getClipboardChangeToken;
    const beforeToken = (_c = getChangeToken === null || getChangeToken === void 0 ? void 0 : getChangeToken()) !== null && _c !== void 0 ? _c : null;
    const beforeSnap = beforeToken === null ? snapshotClipboard(clipboard) : null;
    try {
        await simulateCopy();
    }
    catch {
        return { status: 'none', text: '', fileUrl: '', fileUrls: [] };
    }
    const timeoutMs = (_d = options.copyTimeoutMs) !== null && _d !== void 0 ? _d : 250;
    const pollIntervalMs = Math.max(4, (_e = options.pollIntervalMs) !== null && _e !== void 0 ? _e : 10);
    const deadline = Date.now() + timeoutMs;
    while (Date.now() <= deadline) {
        let changed = false;
        if (beforeToken !== null && getChangeToken) {
            const currentToken = getChangeToken();
            changed = currentToken !== null && currentToken !== beforeToken;
        }
        else if (beforeSnap) {
            changed = !clipboardSnapsEqual(beforeSnap, snapshotClipboard(clipboard));
        }
        if (changed) {
            const payload = readClipboardPayload(clipboard);
            // Some applications empty the clipboard and publish the new formats in
            // separate steps. Do not treat the intermediate empty state as a copy.
            if (!payload.text && payload.fileUrls.length === 0) {
                await wait(pollIntervalMs);
                continue;
            }
            return {
                status: 'selected',
                source: 'clipboard-copy',
                ...payload,
            };
        }
        await wait(pollIntervalMs);
    }
    return { status: 'timeout', text: '', fileUrl: '', fileUrls: [] };
}
/**
 * Electron `screen.getCursorScreenPoint()` 返回的已是 DIP，与 `BrowserWindow.setPosition` / `getBounds`
 * 所用坐标系一致。勿对 Windows 再调用 `screen.screenToDipPoint`：其入参应为物理像素，误传 DIP 会在
 * 高 DPI（如 125%～200%）下二次换算，导致窗口相对鼠标严重偏移（例如看似顶-left 对在指针旁）。
 */
function getPos(_screen, point, _isMacOS) {
    return point;
}
