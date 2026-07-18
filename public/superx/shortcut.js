"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_KEYBOARD_SHORTCUT = void 0;
exports.normalizeKeyboardShortcut = normalizeKeyboardShortcut;
exports.DEFAULT_KEYBOARD_SHORTCUT = 'Ctrl+W';
function normalizeKeyboardShortcut(value) {
    const shortcut = typeof value === 'string' ? value.trim() : '';
    if (!shortcut || !/^[\x20-\x7e]+$/.test(shortcut)) {
        return exports.DEFAULT_KEYBOARD_SHORTCUT;
    }
    const parts = shortcut.split('+').map((part) => part.trim());
    return parts.every(Boolean) ? parts.join('+') : exports.DEFAULT_KEYBOARD_SHORTCUT;
}
