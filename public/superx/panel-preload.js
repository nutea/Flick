"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const ALLOWED_DOCUMENT_IDS = new Set([
    'super-panel-user-plugins',
    'flick-system-super-panel-preferences',
    'super-panel-match-rules',
]);
function sendSync(type, data) {
    const result = electron_1.ipcRenderer.sendSync('msg-trigger', { type, data });
    if (result && typeof result === 'object' && result.error === true) {
        throw new Error(String(result.message || 'SuperX IPC request failed'));
    }
    return result;
}
electron_1.contextBridge.exposeInMainWorld('superPanel', {
    platform: process.platform,
    getDocument: (id) => {
        if (!ALLOWED_DOCUMENT_IDS.has(id))
            return null;
        return sendSync('dbGet', { id });
    },
    getDesktopPath: () => sendSync('getPath', { name: 'desktop' }),
    copyText: (text) => sendSync('copyText', { text: String(text) }),
    openPlugin: (payload) => electron_1.ipcRenderer.send('msg-trigger', { type: 'openPlugin', data: payload }),
    showMainWindow: () => electron_1.ipcRenderer.send('msg-trigger', { type: 'showMainWindow' }),
    hide: () => electron_1.ipcRenderer.send('superPanel-hidden'),
    contentApplied: (requestId) => electron_1.ipcRenderer.send('superPanel-content-applied', requestId),
    reportLayout: (layout) => {
        if (!layout || !Number.isInteger(layout.requestId))
            return;
        if (!Number.isFinite(layout.height))
            return;
        electron_1.ipcRenderer.send('superPanel-report-layout', layout);
    },
    setPinned: (pinned) => electron_1.ipcRenderer.send('trigger-pin', Boolean(pinned)),
    getPinState: () => electron_1.ipcRenderer.invoke('superPanel-get-pin-state'),
    createFile: (directory) => electron_1.ipcRenderer.invoke('superPanel-create-file', String(directory !== null && directory !== void 0 ? directory : '')),
    openTerminal: (directory) => electron_1.ipcRenderer.invoke('superPanel-open-terminal', String(directory !== null && directory !== void 0 ? directory : '')),
    getCurrentFolder: () => electron_1.ipcRenderer.invoke('get-path-async'),
    requestTranslation: (request) => electron_1.ipcRenderer.invoke('superPanel-translate', request),
    onTrigger: (callback) => {
        const listener = (_event, payload) => callback(payload);
        electron_1.ipcRenderer.on('trigger-super-panel', listener);
        return () => electron_1.ipcRenderer.removeListener('trigger-super-panel', listener);
    },
    onPinState: (callback) => {
        const listener = (_event, pinned) => callback(Boolean(pinned));
        electron_1.ipcRenderer.on('superPanel-pin-state', listener);
        return () => electron_1.ipcRenderer.removeListener('superPanel-pin-state', listener);
    },
    onDismissed: (callback) => {
        const listener = () => callback();
        electron_1.ipcRenderer.on('super-panel-dismissed', listener);
        return () => electron_1.ipcRenderer.removeListener('super-panel-dismissed', listener);
    },
});
