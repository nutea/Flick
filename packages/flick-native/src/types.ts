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
  getFolderOpenPathSync(): string;
  getActiveWindow(): Promise<NativeWindowInfo | null>;
}

export interface NativeInputApi {
  sendCopyShortcut(): Promise<void>;
  sendKeyboardTap(key: string, modifiers?: string[]): Promise<void>;
  onInputEvent(listener: (event: NativeInputEvent) => void): () => void;
}

export interface NativeClipboardApi {
  getClipboardContent(): Promise<NativeClipboardContent>;
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

export interface NativeRuntimeApi {
  system: NativeSystemApi;
  input: NativeInputApi;
  clipboard: NativeClipboardApi;
}
