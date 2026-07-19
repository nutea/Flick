export type NativeMouseButton =
  | 'left'
  | 'middle'
  | 'right'
  | 'back'
  | 'forward';

export type NativeInputEvent =
  | {
      kind: 'key';
      state: 'down' | 'up';
      key: string;
      text?: string | null;
    }
  | {
      kind: 'mouse';
      state: 'down' | 'up';
      button: NativeMouseButton | 'unknown';
    }
  | {
      kind: 'mouse-move';
      x: number;
      y: number;
    }
  | {
      kind: 'wheel';
      deltaX: number;
      deltaY: number;
    };

export interface NativeClipboardContentText {
  type: 'text';
  content: string;
}

export interface NativeClipboardContentFile {
  type: 'file';
  content: string[];
}

export type NativeClipboardContent =
  | NativeClipboardContentText
  | NativeClipboardContentFile
  | null;

export interface NativeWindowInfo {
  title: string;
  path?: string;
  processId?: number;
  execName?: string;
  appName?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  url?: string;
}

export interface NativeSystemApi {
  getFolderOpenPath(): Promise<string>;
  /** Returns only the foreground Explorer folder, never the desktop. */
  getForegroundFolderPath(): Promise<string>;
  getFolderOpenPathSync(): string;
  getActiveWindow(): Promise<NativeWindowInfo | null>;
  /**
   * Reads the text selection exposed by the currently focused native control.
   * Returns an empty string when the platform or focused control does not
   * expose a readable text selection.
   */
  getSelectedText(): Promise<string>;
  /** Reads selected items from the foreground platform file manager. */
  getSelectedFilePaths(): Promise<string[]>;
}

export interface NativeInputApi {
  sendCopyShortcut(): Promise<void>;
  sendKeyboardTap(key: string, modifiers?: string[]): Promise<void>;
  onInputEvent(listener: (event: NativeInputEvent) => void): () => void;
}

export interface NativeClipboardApi {
  getClipboardContent(): Promise<NativeClipboardContent>;
  /**
   * Returns a platform clipboard generation counter without reading or
   * writing clipboard data. `null` means the platform has no native counter.
   */
  getChangeToken(): number | null;
  /**
   * Reads the file paths currently held on the OS clipboard.
   * Returns an empty array on platforms or formats where no file list exists.
   */
  readFilePaths(): string[];
  /**
   * Publishes the given file paths on the OS clipboard so the system paste
   * action drops them as files. Returns false if the platform is unsupported
   * or the underlying call fails; the caller can then fall back to a JS-side
   * implementation.
   */
  writeFilePaths(files: string[]): boolean;
}

export interface NativeScreenRegion {
  /** Global Electron display coordinate in device-independent pixels. */
  x: number;
  /** Global Electron display coordinate in device-independent pixels. */
  y: number;
  width: number;
  height: number;
}

export interface NativeScreenApi {
  isAvailable(): boolean;
  /** Captures the region and resolves with PNG-encoded bytes. */
  captureRegion(region: NativeScreenRegion): Promise<Buffer>;
}

export interface NativeRuntimeApi {
  system: NativeSystemApi;
  input: NativeInputApi;
  clipboard: NativeClipboardApi;
  screen: NativeScreenApi;
}
