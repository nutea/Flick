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

    /**
     * Synchronous variant retained only for `event.returnValue` IPC paths
     * (e.g. `registerCdwhereIpc`). Prefer the async form everywhere else.
     */
    getFolderOpenPathSync?: () => string;

    sendKeyboardChord?: (modifiers: string[], key: string) => void;

    /**
     * Rust side uses `ErrorStrategy::Fatal`, so the JS callback is invoked as
     * `(payload) => …`. We still type variadic args for forward-compat with
     * a future `CalleeHandled` rebuild.
     */
    startInputHook?: (
      callback: (...args: unknown[]) => void
    ) => () => void;

    /**
     * Reads file paths currently on the OS clipboard (Windows `CF_HDROP`).
     * Returns an empty array when no file list is present, or on non-Windows
     * platforms. Synchronous; a single call is in the sub-millisecond range.
     */
    readClipboardFilePaths?: () => string[];

    /**
     * Publishes file paths to the OS clipboard as a `CF_HDROP` payload (and
     * `Preferred DropEffect = COPY`) so Explorer treats the data as a copy
     * operation. No-op on non-Windows platforms. Throws on Win32 failure.
     */
    writeClipboardFilePaths?: (files: string[]) => void;
  }

  // Default export shape of the addon (CommonJS `module.exports`).
  const addon: NativeAddon;
  export = addon;
}
