export const DEFAULT_KEYBOARD_SHORTCUT = 'Ctrl+W';

export function normalizeKeyboardShortcut(value: unknown): string {
  const shortcut = typeof value === 'string' ? value.trim() : '';
  if (!shortcut || !/^[\x20-\x7e]+$/.test(shortcut)) {
    return DEFAULT_KEYBOARD_SHORTCUT;
  }
  const parts = shortcut.split('+').map((part) => part.trim());
  return parts.every(Boolean) ? parts.join('+') : DEFAULT_KEYBOARD_SHORTCUT;
}
