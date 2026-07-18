import { clipboard, input, system } from 'flick-native';
import type { NativeInputEvent } from 'flick-native';

export async function simulateCopyShortcut(): Promise<void> {
  await input.sendCopyShortcut();
}

export async function getSelectedText(): Promise<string> {
  return system.getSelectedText();
}

export async function getSelectedFilePaths(): Promise<string[]> {
  return system.getSelectedFilePaths();
}

export function getClipboardChangeToken(): number | null {
  return clipboard.getChangeToken();
}

export async function getActiveWindowFallbackPath(
  runtime: Pick<
    typeof system,
    'getActiveWindow' | 'getForegroundFolderPath'
  > = system
): Promise<string> {
  const current = await runtime.getActiveWindow();
  const activePath = String(current?.path ?? '');
  if (!activePath) return '';

  const executable = activePath.split(/[/\\]/).pop()?.toLowerCase();
  if (executable === 'explorer.exe') {
    return runtime.getForegroundFolderPath();
  }
  return activePath;
}

export function onNativeInputEvent(
  listener: (event: NativeInputEvent) => void
): () => void {
  return input.onInputEvent(listener);
}
