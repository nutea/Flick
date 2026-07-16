import type {
  NativeInputApi,
  NativeInputEvent,
  NativeMouseButton,
} from '../types';
import { sendKeyboardChordDarwinLinux } from './platform-chord';

const listeners = new Set<(event: NativeInputEvent) => void>();
let stopHook: (() => void) | null = null;

/** Normalized names: modifiers `control`|`alt`|`shift`|`super`, plus key tokens (`a`…`z`, `0`…`9`, `f1`…, `enter`, …). */
const TOKEN_ALIASES: Record<string, string> = {
  ctrl: 'control',
  control: 'control',
  leftcontrol: 'control',
  rightcontrol: 'control',
  alt: 'alt',
  option: 'alt',
  leftalt: 'alt',
  rightalt: 'alt',
  shift: 'shift',
  leftshift: 'shift',
  rightshift: 'shift',
  command: 'super',
  cmd: 'super',
  meta: 'super',
  super: 'super',
  leftsuper: 'super',
  rightsuper: 'super',
  enter: 'enter',
  'return': 'enter',
  esc: 'escape',
  escape: 'escape',
  del: 'delete',
  delete: 'delete',
  backspace: 'backspace',
  space: 'space',
  tab: 'tab',
  up: 'up',
  down: 'down',
  left: 'left',
  right: 'right',
  pageup: 'pageup',
  pagedown: 'pagedown',
  pgup: 'pageup',
  pgdn: 'pagedown',
  home: 'home',
  end: 'end',
  insert: 'insert',
  minus: '-',
  equal: '=',
  grave: '`',
};

const MODIFIERS = new Set(['control', 'alt', 'shift', 'super']);

/** Tokens that are already canonical key names (after lowercasing). */
const KNOWN_KEY_NAMES = new Set([
  'enter',
  'escape',
  'tab',
  'space',
  'backspace',
  'delete',
  'up',
  'down',
  'left',
  'right',
  'pageup',
  'pagedown',
  'home',
  'end',
  'insert',
  '-',
  '=',
  '`',
]);

const toCanonicalToken = (raw: string): string | null => {
  const normalized = raw.trim().toLowerCase().replace(/[\s_-]+/g, '');
  if (!normalized) return null;

  if (TOKEN_ALIASES[normalized]) {
    return TOKEN_ALIASES[normalized];
  }

  if (KNOWN_KEY_NAMES.has(normalized)) {
    return normalized;
  }

  if (/^f\d{1,2}$/.test(normalized)) {
    return normalized;
  }

  if (/^[a-z]$/.test(normalized)) {
    return normalized;
  }

  if (/^\d$/.test(normalized)) {
    return normalized;
  }

  if (/^[A-Z]$/.test(raw.trim())) {
    return raw.trim().toLowerCase();
  }

  return null;
};

const parseChordTokens = (
  tokens: string[]
): { modifiers: string[]; key: string } | null => {
  const mods: string[] = [];
  const keys: string[] = [];

  for (const t of tokens) {
    if (MODIFIERS.has(t)) mods.push(t);
    else keys.push(t);
  }

  if (keys.length !== 1) return null;

  const order = ['control', 'alt', 'shift', 'super'];
  const uniq = Array.from(new Set(mods));
  uniq.sort((a, b) => order.indexOf(a) - order.indexOf(b));

  return { modifiers: uniq, key: keys[0] };
};

// Native addon shape comes from `src/nativeBinding.d.ts`.
const tryLoadNativeAddon = () => {
  try {
    return require('../../native');
  } catch {
    return null;
  }
};

const tryLoadNativeChord = () => {
  if (process.platform !== 'win32') return null;
  return tryLoadNativeAddon();
};

const dispatchChord = async (rawKeys: string[]): Promise<void> => {
  const tokens = rawKeys
    .map(toCanonicalToken)
    .filter((t): t is string => Boolean(t));
  const parsed = parseChordTokens(tokens);
  if (!parsed) return;

  if (process.platform === 'win32') {
    try {
      tryLoadNativeChord()?.sendKeyboardChord?.(
        parsed.modifiers,
        parsed.key
      );
    } catch {
      // N-API failure: ignore to match prior fire-and-forget behaviour.
    }
    return;
  }

  await sendKeyboardChordDarwinLinux(
    process.platform,
    parsed.modifiers,
    parsed.key
  );
};

const emit = (event: NativeInputEvent): void => {
  // Isolate listener exceptions so one bad subscriber can't suppress the others.
  for (const listener of listeners) {
    try {
      listener(event);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[flick-native] input listener threw', err);
    }
  }
};

const parseNativeInputPayload = (raw: string): NativeInputEvent | null => {
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    if (
      o.kind === 'key' &&
      (o.state === 'down' || o.state === 'up') &&
      typeof o.key === 'string'
    ) {
      return {
        kind: 'key',
        state: o.state,
        key: o.key,
        text:
          o.text === undefined || o.text === null
            ? null
            : String(o.text),
      };
    }

    if (
      o.kind === 'mouse' &&
      (o.state === 'down' || o.state === 'up') &&
      typeof o.button === 'string'
    ) {
      const b = o.button as NativeMouseButton | 'unknown';
      return { kind: 'mouse', state: o.state, button: b };
    }

    if (
      o.kind === 'mouse-move' &&
      typeof o.x === 'number' &&
      typeof o.y === 'number'
    ) {
      return { kind: 'mouse-move', x: o.x, y: o.y };
    }

    if (
      o.kind === 'wheel' &&
      typeof o.deltaX === 'number' &&
      typeof o.deltaY === 'number'
    ) {
      return { kind: 'wheel', deltaX: o.deltaX, deltaY: o.deltaY };
    }
  } catch {
    return null;
  }

  return null;
};

const startSharedHook = (): (() => void) | null => {
  const native = tryLoadNativeAddon();
  if (typeof native?.startInputHook !== 'function') {
    return null;
  }

  try {
    return native.startInputHook((...args: unknown[]) => {
      // CalleeHandled threadsafe function → (err, payload). Be lenient.
      const payload = args.find(
        (a): a is string => typeof a === 'string'
      );
      if (payload === undefined) return;
      const event = parseNativeInputPayload(payload);
      if (event) emit(event);
    });
  } catch {
    return null;
  }
};

export const input: NativeInputApi = {
  async sendCopyShortcut(): Promise<void> {
    const mod = process.platform === 'darwin' ? 'super' : 'control';
    await dispatchChord([mod, 'c']);
  },
  async sendKeyboardTap(key: string, modifiers: string[] = []): Promise<void> {
    await dispatchChord([...modifiers, key]);
  },
  onInputEvent(listener: (event: NativeInputEvent) => void): () => void {
    listeners.add(listener);

    if (!stopHook) {
      stopHook = startSharedHook();
    }

    return () => {
      listeners.delete(listener);
      if (listeners.size === 0 && stopHook) {
        stopHook();
        stopHook = null;
      }
    };
  },
};
