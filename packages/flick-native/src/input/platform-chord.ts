import { execFile } from 'node:child_process';

const MAC_MODIFIERS: Record<string, string> = {
  control: 'control down',
  alt: 'option down',
  shift: 'shift down',
  super: 'command down',
};

/** AppleScript `key code` values (main keyboard, US layout–oriented tables). */
const MAC_KEY_CODE: Record<string, number> = {
  enter: 36,
  'return': 36,
  tab: 48,
  space: 49,
  escape: 53,
  esc: 53,
  backspace: 51,
  delete: 51,
  del: 51,
  left: 123,
  right: 124,
  down: 125,
  up: 126,
  home: 115,
  end: 119,
  pageup: 116,
  pagedown: 121,
  insert: 114,
  f1: 122,
  f2: 120,
  f3: 99,
  f4: 118,
  f5: 96,
  f6: 97,
  f7: 98,
  f8: 100,
  f9: 101,
  f10: 109,
  f11: 103,
  f12: 111,
};

const LINUX_MODIFIERS: Record<string, string> = {
  control: 'ctrl',
  alt: 'alt',
  shift: 'shift',
  super: 'super',
};

const LINUX_KEY_ALIASES: Record<string, string> = {
  enter: 'Return',
  'return': 'Return',
  escape: 'Escape',
  esc: 'Escape',
  tab: 'Tab',
  space: 'space',
  backspace: 'BackSpace',
  delete: 'Delete',
  del: 'Delete',
  pageup: 'Prior',
  pagedown: 'Next',
  up: 'Up',
  down: 'Down',
  left: 'Left',
  right: 'Right',
  home: 'Home',
  end: 'End',
  insert: 'Insert',
};

function escapeAppleScriptString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

async function sendDarwinChord(
  modifiers: string[],
  key: string
): Promise<void> {
  const using = modifiers
    .map((m) => MAC_MODIFIERS[m])
    .filter(Boolean)
    .join(', ');

  const k = key.toLowerCase();
  const code = MAC_KEY_CODE[k];
  let script: string;

  if (code !== undefined) {
    script = `tell application "System Events" to key code ${code}${
      using ? ` using {${using}}` : ''
    }`;
  } else if (k.length === 1) {
    const ch = escapeAppleScriptString(k);
    script = `tell application "System Events" to keystroke "${ch}"${
      using ? ` using {${using}}` : ''
    }`;
  } else {
    return;
  }

  try {
    await execFile('osascript', ['-e', script], { timeout: 5000 });
  } catch {
    // Accessibility / permissions may block System Events.
  }
}

async function sendLinuxChord(
  modifiers: string[],
  key: string
): Promise<void> {
  const modPart = modifiers
    .map((m) => LINUX_MODIFIERS[m])
    .filter(Boolean)
    .join('+');

  const k = key.toLowerCase();
  let sym: string | undefined;

  if (/^f\d{1,2}$/.test(k)) {
    sym = `F${k.slice(1)}`;
  } else if (k.length === 1) {
    sym = k;
  } else {
    sym = LINUX_KEY_ALIASES[k];
  }

  if (!sym) return;

  const combo = modPart ? `${modPart}+${sym}` : sym;

  try {
    await execFile('xdotool', ['key', '--clearmodifiers', combo], {
      timeout: 5000,
      env: process.env,
    });
  } catch {
    // xdotool not installed or no X session.
  }
}

/** macOS / Linux synthetic chords without @nut-tree/nut-js. */
export async function sendKeyboardChordDarwinLinux(
  platform: NodeJS.Platform,
  modifiers: string[],
  key: string
): Promise<void> {
  if (platform === 'darwin') {
    await sendDarwinChord(modifiers, key);
    return;
  }

  if (platform === 'linux') {
    await sendLinuxChord(modifiers, key);
  }
}
