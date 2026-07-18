const ASCII_ACCELERATOR = /^[\x20-\x7e]+$/;

export function isKeyboardAccelerator(value: string): boolean {
  if (!value || !ASCII_ACCELERATOR.test(value)) return false;
  const parts = value.split('+').map((part) => part.trim());
  return parts.length > 0 && parts.every(Boolean);
}

export function acceleratorKeyFromEvent(
  event: Pick<KeyboardEvent, 'key' | 'code'>
): string | null {
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) return null;

  // `event.key` is layout/modifier dependent. On macOS, Option+W reports `∑`
  // and Option+Q may report `œ`; Electron accelerators require ASCII key names.
  // Physical letter/digit codes preserve the key the user actually pressed.
  if (event.code.startsWith('Key')) return event.code.slice(3);
  if (event.code.startsWith('Digit')) return event.code.slice(5);
  if (event.code.startsWith('Numpad')) return event.code;

  if (event.key === ' ') return 'Space';
  const map: Record<string, string> = {
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    Escape: 'Esc',
    Backspace: 'Backspace',
    Tab: 'Tab',
    Enter: 'Enter',
    Delete: 'Delete',
    Insert: 'Insert',
    Home: 'Home',
    End: 'End',
    PageUp: 'PageUp',
    PageDown: 'PageDown',
  };
  if (map[event.key]) return map[event.key];
  if (/^F\d{1,2}$/.test(event.key)) return event.key;
  if (event.key.length === 1 && ASCII_ACCELERATOR.test(event.key)) {
    return event.key.toUpperCase();
  }
  return null;
}
