/**
 * Single source of truth for the shape exported by the local N-API addon
 * (`packages/flick-native/native/flick_native.node`).
 *
 * Anyone needing to call into the native addon should `require('../../native')`
 * and rely on this declaration instead of redeclaring the binding inline.
 *
 * Every member is optional because the addon is also optional: on platforms
 * where Cargo has not built the artifact, the require() call throws and the
 * caller falls back to a JS / no-op implementation.
 */
declare module '../../native' {
  export interface NativeAddonActiveWindow {
    title?: string;
    path?: string;
    processId?: number;
    appName?: string;
    x?: number;
    y?: number;
    width?: number;
    height?: number;
  }

  export interface NativeAddon {
    /**
     * Resolves on the libuv worker pool — does NOT block the Node main thread.
     * `OpenProcess` against sandboxed targets (Edge/Chrome) can stall for tens
     * of milliseconds, hence the async wrapper.
     */
    getActiveWindow?: () => Promise<NativeAddonActiveWindow | null>;

    /** Async variant. Iterates Explorer windows over COM on a worker thread. */
    getFolderOpenPath?: () => Promise<string>;

    /** Foreground Explorer folder only; never falls back to the desktop. */
    getForegroundFolderPath?: () => Promise<string>;

    /**
     * Synchronous variant retained only for `event.returnValue` IPC paths
     * (e.g. `registerCdwhereIpc`). Prefer the async form everywhere else.
     */
    getFolderOpenPathSync?: () => string;

    /** Reads the focused control's current text selection via UI Automation. */
    getSelectedText?: () => Promise<string>;

    /** Reads selected filesystem items from the foreground File Explorer. */
    getSelectedFilePaths?: () => Promise<string[]>;

    sendKeyboardChord?: (modifiers: string[], key: string) => void;

    /**
     * Rust side uses `ErrorStrategy::Fatal`, so the JS callback is invoked as
     * `(payload) => …`. We still type variadic args for forward-compat with
     * a future `CalleeHandled` rebuild.
     */
    startInputHook?: (callback: (...args: unknown[]) => void) => () => void;

    /** Consumes the configured Windows mouse gesture before Explorer handles it. */
    setMouseButtonSuppression?: (button?: string) => void;

    /**
     * Reads file paths currently on the OS clipboard (`CF_HDROP`, Finder URLs,
     * or `text/uri-list`). Returns an empty array when no file list is present.
     */
    readClipboardFilePaths?: () => string[];

    /** Clipboard generation counter where the platform exposes one. */
    getClipboardChangeToken?: () => number;

    /**
     * Publishes file paths using the platform file-list clipboard format.
     * Throws when the native backend or required desktop helper is unavailable.
     */
    writeClipboardFilePaths?: (files: string[]) => void;

    /** Captures a global desktop region and returns PNG-encoded bytes. */
    captureScreenRegion?: (
      x: number,
      y: number,
      width: number,
      height: number
    ) => Promise<Buffer>;
  }

  // Default export shape of the addon (CommonJS `module.exports`).
  const addon: NativeAddon;
  export = addon;
}
