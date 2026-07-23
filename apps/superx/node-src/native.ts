import { clipboard, input, system } from 'flick-native';
import type {
  NativeInputEvent,
  NativeSelectionSnapshot,
  NativeWindowInfo,
} from 'flick-native';

async function resolveWithin<T>(
  promise: Promise<T>,
  timeoutMs: number,
  fallback: T
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise.catch(() => fallback),
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function simulateCopyShortcut(): Promise<void> {
  await input.sendCopyShortcut();
}

export async function getSelectedText(): Promise<string> {
  return system.getSelectedText();
}

export async function getSelectedFilePaths(): Promise<string[]> {
  return system.getSelectedFilePaths();
}

export async function captureSelectionSnapshot(
  signal?: AbortSignal
): Promise<NativeSelectionSnapshot> {
  return system.captureSelection(signal);
}

export function readClipboardFilePaths(): string[] {
  return clipboard.readFilePaths();
}

export function getClipboardChangeToken(): number | null {
  return clipboard.getChangeToken();
}

export function getActiveWindowSnapshot(
  runtime: Pick<typeof system, 'getActiveWindow'> = system,
  timeoutMs = 200
): Promise<NativeWindowInfo | null> {
  return resolveWithin(runtime.getActiveWindow(), timeoutMs, null);
}

const LINUX_FILE_MANAGERS = new Set([
  'caja',
  'dolphin',
  'nautilus',
  'nemo',
  'nemo-desktop',
  'pcmanfm',
  'pcmanfm-qt',
  'spacefm',
  'thunar',
]);

function isLinuxFileManager(
  executable: string,
  appName: string,
  platform: NodeJS.Platform
): boolean {
  if (platform !== 'linux') return false;
  const normalizedExecutable = executable.replace(/\.bin$/i, '');
  const normalizedAppName = appName.replace(/\.desktop$/i, '');
  const appNameTail = normalizedAppName.split('.').pop() ?? normalizedAppName;
  return (
    LINUX_FILE_MANAGERS.has(normalizedExecutable) ||
    LINUX_FILE_MANAGERS.has(normalizedAppName) ||
    LINUX_FILE_MANAGERS.has(appNameTail)
  );
}

export async function getActiveWindowFallbackPath(
  runtime: Pick<
    typeof system,
    'getActiveWindow' | 'getForegroundFolderPath'
  > = system,
  snapshot?: NativeWindowInfo | null,
  folderTimeoutMs = 500,
  platform: NodeJS.Platform = process.platform
): Promise<string> {
  const current =
    snapshot === undefined ? await getActiveWindowSnapshot(runtime) : snapshot;
  const activePath = String(current?.path ?? '');
  if (!activePath) return '';

  const executable = activePath.split(/[/\\]/).pop()?.toLowerCase() ?? '';
  const appName = String(current?.appName ?? '').toLowerCase();
  const isWindowsExplorer = executable === 'explorer.exe';
  const isMacFinder =
    appName === 'finder' ||
    executable === 'finder.app' ||
    /(?:^|[/\\])finder\.app(?:[/\\]|$)/i.test(activePath);
  const isLinuxManager = isLinuxFileManager(executable, appName, platform);

  if (isWindowsExplorer || isMacFinder || isLinuxManager) {
    // A file-manager process path describes the application itself, not the
    // content under the pointer. Never expose the file-manager executable as a
    // selected filesystem item; an empty result means no reliable fallback.
    return resolveWithin(
      runtime.getForegroundFolderPath(),
      folderTimeoutMs,
      ''
    );
  }
  return activePath;
}

export function getSnapshotFallbackPath(
  snapshot: {
    activeWindow: { path?: string; appName?: string } | null;
    foregroundFolder: string;
  },
  platform: NodeJS.Platform = process.platform
): string {
  const current = snapshot.activeWindow;
  const activePath = String(current?.path ?? '');
  if (!activePath) return snapshot.foregroundFolder;

  const executable = activePath.split(/[/\\]/).pop()?.toLowerCase() ?? '';
  const appName = String(current?.appName ?? '').toLowerCase();
  const isWindowsExplorer = executable === 'explorer.exe';
  const isMacFinder =
    appName === 'finder' ||
    executable === 'finder.app' ||
    /(?:^|[/\\])finder\.app(?:[/\\]|$)/i.test(activePath);
  const isLinuxManager = isLinuxFileManager(executable, appName, platform);
  return isWindowsExplorer || isMacFinder || isLinuxManager
    ? snapshot.foregroundFolder
    : activePath;
}

export function onNativeInputEvent(
  listener: (event: NativeInputEvent) => void
): () => void {
  return input.onInputEvent(listener);
}

export function setNativeMouseButtonSuppression(
  button: 'left' | 'right' | 'middle' | null
): void {
  input.setMouseButtonSuppression(button);
}

export function restartNativeInputHook(): void {
  input.restartInputHook();
}
