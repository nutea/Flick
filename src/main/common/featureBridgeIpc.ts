import { ipcMain, shell, type WebContents } from 'electron';
import fs from 'fs';
import path from 'path';

const CHANNELS = {
  getLocalPlugins: 'feature:get-local-plugins',
  downloadPlugin: 'feature:download-plugin',
  deletePlugin: 'feature:delete-plugin',
  refreshPlugin: 'feature:refresh-plugin',
  pathExists: 'feature:path-exists',
  openExternal: 'feature:open-external',
} as const;

let featureSenderId: number | null = null;

function isFeatureSender(sender: WebContents): boolean {
  return featureSenderId !== null && sender.id === featureSenderId;
}

function cloneForRenderer<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizePluginLogos(value: unknown): unknown {
  if (!Array.isArray(value)) return cloneForRenderer(value);
  return value.map((row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return row;
    const plugin = cloneForRenderer(row as Record<string, unknown>);
    const logo = plugin.logo;
    if (typeof logo === 'string') {
      if (logo.startsWith('file://')) {
        plugin.logo = `image://${logo.slice('file://'.length)}`;
      } else if (path.isAbsolute(logo)) {
        plugin.logo = `image://${logo}`;
      }
    }
    return plugin;
  });
}

function pluginManager(): any {
  const manager = (global as any).LOCAL_PLUGINS;
  if (!manager) throw new Error('Plugin manager is unavailable');
  return manager;
}

function normalizePluginPayload(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new TypeError('Plugin payload must be an object');
  }
  const payload = cloneForRenderer(raw as Record<string, unknown>);
  const name = payload.name;
  if (typeof name !== 'string' || !name.trim() || name.length > 4096) {
    throw new TypeError('Plugin name or path is invalid');
  }
  return payload;
}

export function registerFeatureBridgeIpc(contents: WebContents): void {
  featureSenderId = contents.id;
  contents.once('destroyed', () => {
    if (featureSenderId === contents.id) featureSenderId = null;
  });

  ipcMain.removeAllListeners(CHANNELS.getLocalPlugins);
  ipcMain.on(CHANNELS.getLocalPlugins, (event) => {
    if (!isFeatureSender(event.sender)) {
      event.returnValue = [];
      return;
    }
    event.returnValue = normalizePluginLogos(pluginManager().getLocalPlugins());
  });

  for (const channel of Object.values(CHANNELS).filter(
    (channel) => channel !== CHANNELS.getLocalPlugins
  )) {
    try {
      ipcMain.removeHandler(channel);
    } catch {
      /* first registration */
    }
  }

  ipcMain.handle(CHANNELS.downloadPlugin, async (event, raw: unknown) => {
    if (!isFeatureSender(event.sender)) throw new Error('Untrusted sender');
    return normalizePluginLogos(
      await pluginManager().downloadPlugin(normalizePluginPayload(raw))
    );
  });
  ipcMain.handle(CHANNELS.deletePlugin, async (event, raw: unknown) => {
    if (!isFeatureSender(event.sender)) throw new Error('Untrusted sender');
    return normalizePluginLogos(
      await pluginManager().deletePlugin(normalizePluginPayload(raw))
    );
  });
  ipcMain.handle(CHANNELS.refreshPlugin, async (event, raw: unknown) => {
    if (!isFeatureSender(event.sender)) throw new Error('Untrusted sender');
    return normalizePluginLogos(
      await pluginManager().refreshPlugin(normalizePluginPayload(raw))
    );
  });
  ipcMain.handle(CHANNELS.pathExists, (event, rawPath: unknown) => {
    if (!isFeatureSender(event.sender) || typeof rawPath !== 'string') {
      return false;
    }
    if (!rawPath || rawPath.length > 4096) return false;
    try {
      return fs.existsSync(rawPath);
    } catch {
      return false;
    }
  });
  ipcMain.handle(CHANNELS.openExternal, async (event, rawUrl: unknown) => {
    if (!isFeatureSender(event.sender) || typeof rawUrl !== 'string') {
      return false;
    }
    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      return false;
    }
    if (!['https:', 'http:', 'mailto:'].includes(parsed.protocol)) return false;
    await shell.openExternal(parsed.toString());
    return true;
  });
}
