import { shell, type WebContents } from 'electron';
import path from 'path';

const EXTERNAL_PROTOCOLS = new Set(['https:', 'http:', 'mailto:']);

function parseUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isAllowedInternalNavigation(candidate: URL, initial: URL): boolean {
  if (initial.protocol === 'file:') {
    const initialDir = `${path.posix.dirname(initial.pathname)}/`;
    return (
      candidate.protocol === 'file:' &&
      candidate.pathname.startsWith(initialDir)
    );
  }
  return candidate.origin === initial.origin;
}

function openExternalIfSafe(url: string): void {
  const parsed = parseUrl(url);
  if (!parsed || !EXTERNAL_PROTOCOLS.has(parsed.protocol)) return;
  void shell.openExternal(parsed.toString());
}

/** Keep app content on its initial origin and route safe external links to the OS browser. */
export function secureWebContentsNavigation(
  webContents: WebContents,
  initialUrl: string
): void {
  const initial = parseUrl(initialUrl);
  webContents.setWindowOpenHandler(({ url }) => {
    openExternalIfSafe(url);
    return { action: 'deny' };
  });
  webContents.on('will-navigate', (event, url) => {
    const candidate = parseUrl(url);
    if (
      initial &&
      candidate &&
      isAllowedInternalNavigation(candidate, initial)
    ) {
      return;
    }
    event.preventDefault();
    openExternalIfSafe(url);
  });
}
