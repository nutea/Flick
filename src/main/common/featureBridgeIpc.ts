import { ipcMain, net, shell, type WebContents } from 'electron';
import fs from 'fs';
import { presentPlugins } from './pluginPresentation';

const CHANNELS = {
  getLocalPlugins: 'feature:get-local-plugins',
  downloadPlugin: 'feature:download-plugin',
  deletePlugin: 'feature:delete-plugin',
  refreshPlugin: 'feature:refresh-plugin',
  testSourceConnection: 'feature:test-source-connection',
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

function normalizeHttpUrl(raw: unknown, field: string): URL {
  if (typeof raw !== 'string' || !raw.trim() || raw.length > 4096) {
    throw new TypeError(`${field} URL is invalid`);
  }
  const url = new URL(raw.trim());
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new TypeError(`${field} URL protocol is invalid`);
  }
  return url;
}

async function checkSourceUrl(url: URL) {
  try {
    const response = await net.fetch(url.toString(), {
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
    });
    return { ok: response.ok, status: response.status };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      error: error instanceof Error ? error.message : 'Request failed',
    };
  }
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
    event.returnValue = presentPlugins(pluginManager().getLocalPlugins());
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
    return presentPlugins(
      await pluginManager().downloadPlugin(normalizePluginPayload(raw))
    );
  });
  ipcMain.handle(CHANNELS.deletePlugin, async (event, raw: unknown) => {
    if (!isFeatureSender(event.sender)) throw new Error('Untrusted sender');
    return presentPlugins(
      await pluginManager().deletePlugin(normalizePluginPayload(raw))
    );
  });
  ipcMain.handle(CHANNELS.refreshPlugin, async (event, raw: unknown) => {
    if (!isFeatureSender(event.sender)) throw new Error('Untrusted sender');
    return presentPlugins(
      await pluginManager().refreshPlugin(normalizePluginPayload(raw))
    );
  });
  ipcMain.handle(CHANNELS.testSourceConnection, async (event, raw: unknown) => {
    if (!isFeatureSender(event.sender)) throw new Error('Untrusted sender');
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new TypeError('Market source configuration is invalid');
    }
    const config = cloneForRenderer(raw as Record<string, unknown>);
    const registry = normalizeHttpUrl(config.register, 'Registry');
    const database = normalizeHttpUrl(config.database, 'Database');
    registry.pathname = `${registry.pathname.replace(/\/$/, '')}/-/ping`;
    const marketUrl = new URL(
      `${database.toString().replace(/\/$/, '')}/plugins/finder.json`
    );
    if (typeof config.access_token === 'string' && config.access_token) {
      marketUrl.searchParams.set('access_token', config.access_token);
      marketUrl.searchParams.set('ref', 'master');
    }
    const [registryResult, databaseResult] = await Promise.all([
      checkSourceUrl(registry),
      checkSourceUrl(marketUrl),
    ]);
    return {
      ok: registryResult.ok && databaseResult.ok,
      registry: registryResult,
      database: databaseResult,
    };
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
