import { app, net, protocol, type Session } from 'electron';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

import { imageProtocolSource } from '@/common/utils/imageProtocol';

const IMAGE_SCHEME = 'image';
const installedSessions = new WeakSet<Session>();

/** Must run before Electron becomes ready. */
export function registerImageProtocolPrivileges(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: IMAGE_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: false,
      },
    },
  ]);
}

function resolveImageFile(requestUrl: string): string | null {
  const source = imageProtocolSource(requestUrl);
  if (!source) return null;
  try {
    const filePath = /^file:/i.test(source) ? fileURLToPath(source) : source;
    const absolute = path.resolve(filePath);
    return path.isAbsolute(filePath) && fs.statSync(absolute).isFile()
      ? absolute
      : null;
  } catch {
    return null;
  }
}

function isFileIconRequest(requestUrl: string): boolean {
  try {
    return new URL(requestUrl).hostname === 'file-icon';
  } catch {
    return false;
  }
}

function resolveExistingPath(requestUrl: string): string | null {
  const source = imageProtocolSource(requestUrl);
  if (!source) return null;
  try {
    const filePath = /^file:/i.test(source) ? fileURLToPath(source) : source;
    const absolute = path.resolve(filePath);
    return path.isAbsolute(filePath) && fs.existsSync(absolute)
      ? absolute
      : null;
  } catch {
    return null;
  }
}

/** Every Electron partition owns a Protocol instance, so install per Session. */
export function installImageProtocol(targetSession: Session): void {
  if (installedSessions.has(targetSession)) return;
  targetSession.protocol.handle(IMAGE_SCHEME, async (request) => {
    if (isFileIconRequest(request.url)) {
      const filePath = resolveExistingPath(request.url);
      if (!filePath) return new Response(null, { status: 404 });
      try {
        const icon = await app.getFileIcon(filePath, { size: 'normal' });
        if (icon.isEmpty()) return new Response(null, { status: 404 });
        return new Response(new Uint8Array(icon.toPNG()), {
          headers: { 'content-type': 'image/png' },
        });
      } catch {
        return new Response(null, { status: 404 });
      }
    }
    const filePath = resolveImageFile(request.url);
    if (!filePath) return new Response(null, { status: 404 });
    return net.fetch(pathToFileURL(filePath).toString());
  });
  installedSessions.add(targetSession);
}
