"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFilePathFromClipboard = getFilePathFromClipboard;
exports.snapshotClipboard = snapshotClipboard;
exports.readClipboardPayload = readClipboardPayload;
exports.getSelectedContent = getSelectedContent;
exports.getPos = getPos;
const crypto_1 = require("crypto");
/**
 * 从系统剪贴板解析文件路径 / 图片（与原版 main.js 行为一致）
 */
function getFilePathFromClipboard(clipboard) {
    var _a;
    let filePath = [];
    if (process.platform === 'darwin') {
        if (clipboard.has('NSFilenamesPboardType')) {
            filePath =
                ((_a = clipboard
                    .read('NSFilenamesPboardType')
                    .match(/<string>.*<\/string>/g)) === null || _a === void 0 ? void 0 : _a.map((item) => item.replace(/<string>|<\/string>/g, ''))) ||
                    [];
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
                    clipboard.read('public.file-url').replace('file://', ''),
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
function snapshotClipboard(clipboard) {
    const text = clipboard.readText('clipboard') || '';
    const raw = getFilePathFromClipboard(clipboard)[0];
    const pathStr = typeof raw === 'string' ? raw : '';
    const im = clipboard.readImage('clipboard');
    const hasImage = !!(im && typeof im.isEmpty === 'function' && !im.isEmpty());
    return { text, pathStr, hasImage };
}
function clipboardSnapsEqual(a, b) {
    return (a.text === b.text && a.pathStr === b.pathStr && a.hasImage === b.hasImage);
}
/** 从当前剪贴板解析为面板用的 text / fileUrl（路径优先） */
function readClipboardPayload(clipboard) {
    const text = clipboard.readText('clipboard') || '';
    const raw = getFilePathFromClipboard(clipboard)[0];
    let fileUrl = '';
    if (typeof raw === 'string') {
        fileUrl = raw;
    }
    return {
        text: fileUrl ? '' : text,
        fileUrl,
    };
}
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function readDirectSelection(readSelectedText, timeoutMs) {
    if (!readSelectedText)
        return '';
    let timer;
    try {
        return await Promise.race([
            readSelectedText().catch(() => ''),
            new Promise((resolve) => {
                timer = setTimeout(() => resolve(''), timeoutMs);
            }),
        ]);
    }
    finally {
        if (timer)
            clearTimeout(timer);
    }
}
async function getSelectedContent(clipboard, simulateCopy, options = {}) {
    var _a, _b, _c, _d;
    const directText = await readDirectSelection(options.readSelectedText, (_a = options.directReadTimeoutMs) !== null && _a !== void 0 ? _a : 120);
    if (directText.length > 0) {
        return {
            status: 'selected',
            source: 'accessibility',
            text: directText,
            fileUrl: '',
        };
    }
    if (options.readSelectedFilePaths) {
        try {
            const selectedPaths = await options.readSelectedFilePaths();
            const firstPath = selectedPaths.find(Boolean);
            if (firstPath) {
                return {
                    status: 'selected',
                    source: 'shell',
                    text: '',
                    fileUrl: firstPath,
                };
            }
        }
        catch {
            /* Shell selection is optional; fall through to a single copy. */
        }
    }
    const getChangeToken = options.getClipboardChangeToken;
    const beforeToken = (_b = getChangeToken === null || getChangeToken === void 0 ? void 0 : getChangeToken()) !== null && _b !== void 0 ? _b : null;
    const beforeSnap = beforeToken === null ? snapshotClipboard(clipboard) : null;
    try {
        await simulateCopy();
    }
    catch {
        return { status: 'none', text: '', fileUrl: '' };
    }
    const timeoutMs = (_c = options.copyTimeoutMs) !== null && _c !== void 0 ? _c : 250;
    const pollIntervalMs = Math.max(4, (_d = options.pollIntervalMs) !== null && _d !== void 0 ? _d : 10);
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
            if (!payload.text && !payload.fileUrl) {
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
    return { status: 'timeout', text: '', fileUrl: '' };
}
/**
 * Electron `screen.getCursorScreenPoint()` 返回的已是 DIP，与 `BrowserWindow.setPosition` / `getBounds`
 * 所用坐标系一致。勿对 Windows 再调用 `screen.screenToDipPoint`：其入参应为物理像素，误传 DIP 会在
 * 高 DPI（如 125%～200%）下二次换算，导致窗口相对鼠标严重偏移（例如看似顶-left 对在指针旁）。
 */
function getPos(_screen, point, _isMacOS) {
    return point;
}
