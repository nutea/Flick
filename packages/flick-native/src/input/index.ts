import type {
  NativeInputApi,
  NativeInputEvent,
  NativeMouseButton,
} from '../types';
import { sendKeyboardChordDarwinLinux } from './platform-chord';

const listeners = new Set<(event: NativeInputEvent) => void>();
let stopHook: (() => void) | null = null;
let hookRetryTimer: ReturnType<typeof setTimeout> | null = null;
let hookRetryAttempt = 0;
let configuredMouseSuppression: NativeMouseButton | null = null;

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
  return: 'enter',
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
  const normalized = raw
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
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
  } catch (error) {
    console.warn('[flick-native] failed to start global input hook', error);
    return null;
  }
};

const tryLoadNativeChord = () => {
  return tryLoadNativeAddon();
};

const dispatchChord = async (rawKeys: string[]): Promise<void> => {
  const tokens = rawKeys
    .map(toCanonicalToken)
    .filter((t): t is string => Boolean(t));
  const parsed = parseChordTokens(tokens);
  if (!parsed) return;

  const native = tryLoadNativeChord();
  if (typeof native?.sendKeyboardChord === 'function') {
    try {
      native.sendKeyboardChord(parsed.modifiers, parsed.key);
      return;
    } catch {
      // Permission or backend failure: use the command fallback below.
    }
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
        text: o.text === undefined || o.text === null ? null : String(o.text),
      };
    }

    if (
      o.kind === 'mouse' &&
      (o.state === 'down' || o.state === 'up') &&
      typeof o.button === 'string'
    ) {
      const b = o.button as NativeMouseButton | 'unknown';
      const source =
        o.source === 'hook' || o.source === 'raw-input' ? o.source : undefined;
      return {
        kind: 'mouse',
        state: o.state,
        button: b,
        source,
        hookObserved:
          typeof o.hookObserved === 'boolean' ? o.hookObserved : undefined,
      };
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
    const stop = native.startInputHook((...args: unknown[]) => {
      // CalleeHandled threadsafe function → (err, payload). Be lenient.
      const payload = args.find((a): a is string => typeof a === 'string');
      if (payload === undefined) return;
      const event = parseNativeInputPayload(payload);
      if (event) emit(event);
    });
    if (typeof native.setMouseButtonSuppression === 'function') {
      native.setMouseButtonSuppression(configuredMouseSuppression || undefined);
    }
    return stop;
  } catch (error) {
    // Hook installation can fail transiently while the Windows shell is still
    // starting. The caller schedules a retry while subscribers remain.
    if (hookRetryAttempt === 0 || hookRetryAttempt % 5 === 0) {
      console.warn('[flick-native] global input hook start failed', error);
    }
    return null;
  }
};

const clearHookRetry = (): void => {
  if (hookRetryTimer) {
    clearTimeout(hookRetryTimer);
    hookRetryTimer = null;
  }
};

const ensureSharedHook = (): void => {
  if (stopHook || listeners.size === 0) return;

  const nextStop = startSharedHook();
  if (nextStop) {
    stopHook = nextStop;
    hookRetryAttempt = 0;
    clearHookRetry();
    return;
  }

  if (hookRetryTimer) return;
  const delay = Math.min(5000, 250 * 2 ** Math.min(hookRetryAttempt, 4));
  hookRetryAttempt += 1;
  hookRetryTimer = setTimeout(() => {
    hookRetryTimer = null;
    ensureSharedHook();
  }, delay);
  hookRetryTimer.unref?.();
};

export const input: NativeInputApi = {
  async sendCopyShortcut(): Promise<void> {
    const mod = process.platform === 'darwin' ? 'super' : 'control';
    await dispatchChord([mod, 'c']);
  },
  async sendKeyboardTap(key: string, modifiers: string[] = []): Promise<void> {
    await dispatchChord([...modifiers, key]);
  },
  setMouseButtonSuppression(button: NativeMouseButton | null): void {
    configuredMouseSuppression = button;
    const native = tryLoadNativeAddon();
    if (typeof native?.setMouseButtonSuppression !== 'function') return;
    try {
      native.setMouseButtonSuppression(button || undefined);
    } catch {
      // Optional native capability; older development builds remain usable.
    }
  },
  restartInputHook(): void {
    clearHookRetry();
    hookRetryAttempt = 0;
    const previousStop = stopHook;
    stopHook = null;
    try {
      previousStop?.();
    } catch (error) {
      console.warn('[flick-native] failed to stop stale input hook', error);
    }
    ensureSharedHook();
  },
  onInputEvent(listener: (event: NativeInputEvent) => void): () => void {
    listeners.add(listener);
    ensureSharedHook();

    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        clearHookRetry();
        hookRetryAttempt = 0;
        stopHook?.();
        stopHook = null;
      }
    };
  },
};
