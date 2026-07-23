import path from 'path';
import fs from 'fs';
import https from 'https';
import { PluginHandler } from '@/core';
import { PLUGIN_INSTALL_DIR as baseDir } from '@/common/constans/main';
import API from '@/main/common/api';
import { imageProtocolSource } from '@/common/utils/imageProtocol';
import { normalizeRubickPluginManifest } from '@/compat/rubick/manifest';
import {
  ensurePluginWorkspace,
  isolatedPluginRoot,
  isIsolatedPluginInstalled,
  pluginWorkspaceDir,
  removeLegacyPluginPackage,
  resolveInstalledPluginRoot,
} from '@/main/common/pluginStorage';

declare const __static: string;

const configPath = path.join(baseDir, './flick-local-plugin.json');
const BUILTIN_PLUGIN_PACKAGES = [
  path.join(__static, 'feature', 'package.json'),
  path.join(__static, 'superx', 'package.json'),
];

function ensureBuiltinPluginsInList(): void {
  try {
    // A clean installation has no plugin directory yet. The built-in catalog
    // is initialized before the regular plugin installer runs, so every write
    // below must be able to create the very first catalog file itself.
    fs.mkdirSync(baseDir, { recursive: true });
    if (fs.existsSync(configPath)) {
      const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (Array.isArray(raw) && raw.some((p) => p.name === 'flick-superx')) {
        const next = raw.filter((p) => p.name !== 'flick-superx');
        fs.writeFileSync(configPath, JSON.stringify(next));
        global.LOCAL_PLUGINS.PLUGINS = [];
      }
    }
    for (const packagePath of BUILTIN_PLUGIN_PACKAGES) {
      if (!fs.existsSync(packagePath)) continue;
      const plugins = global.LOCAL_PLUGINS.getLocalPlugins();
      const info = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
      const payload = {
        ...info,
        isDev: false,
        // Runtime-only fields from another checkout/build must never persist.
        indexPath: undefined,
        icon: undefined,
      };
      const idx = plugins.findIndex((p) => p.name === payload.name);
      if (idx === -1) {
        global.LOCAL_PLUGINS.addPlugin(payload);
      } else {
        const next = [...plugins];
        next[idx] = normalizePluginForStorage({ ...next[idx], ...payload });
        global.LOCAL_PLUGINS.PLUGINS = next;
        fs.writeFileSync(configPath, JSON.stringify(next));
      }
    }
  } catch (e) {
    console.warn('[flick] ensureBuiltinPluginsInList', e);
  }
}

function pluginDiskRoot(pluginName: string): string {
  if (pluginName === 'flick-system-feature') {
    return path.join(__static, 'feature');
  }
  if (pluginName === 'flick-system-super-panel') {
    return path.join(__static, 'superx');
  }
  return resolveInstalledPluginRoot(pluginName);
}

function isHttpUrl(v: unknown): v is string {
  return typeof v === 'string' && /^https:\/\//i.test(v.trim());
}

function isFileUrl(v: unknown): v is string {
  return typeof v === 'string' && /^file:\/\//i.test(v.trim());
}

function isDataUrl(v: unknown): v is string {
  return typeof v === 'string' && /^data:/i.test(v.trim());
}

function fileUrlToPathSafe(v: string): string | null {
  try {
    return decodeURIComponent(v.replace(/^file:\/\//i, ''));
  } catch {
    return null;
  }
}

function toPluginScopedAbsolutePath(
  pluginName: string,
  maybePath: string
): string | null {
  const pluginRoot = pluginDiskRoot(pluginName);
  const base = path.resolve(pluginRoot);
  const candidate = path.resolve(
    path.isAbsolute(maybePath) ? maybePath : path.join(pluginRoot, maybePath)
  );
  const rel = path.relative(base, candidate);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return null;
  }
  return candidate;
}

function imageUrlToPathSafe(v: string): string | null {
  return imageProtocolSource(v);
}

function portablePluginLogo(pluginName: string, absolute: string): string {
  const relative = path.relative(pluginDiskRoot(pluginName), absolute);
  return `./${relative.split(path.sep).join('/')}`;
}

function downloadToFile(
  url: string,
  dest: string,
  redirects = 0
): Promise<void> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') {
      reject(new Error('Only HTTPS plugin assets are allowed'));
      return;
    }
    const client = https;
    const req = client.get(url, (res) => {
      const status = res.statusCode || 0;
      const location = res.headers.location;
      if (status >= 300 && status < 400 && location && redirects < 5) {
        const next = new URL(location, url).toString();
        res.resume();
        resolve(downloadToFile(next, dest, redirects + 1));
        return;
      }
      if (status < 200 || status >= 300) {
        res.resume();
        reject(new Error(`HTTP_${status}`));
        return;
      }
      const maxBytes = 2 * 1024 * 1024;
      const contentLength = Number(res.headers['content-length'] || 0);
      if (contentLength > maxBytes) {
        res.resume();
        reject(new Error('Plugin asset exceeds 2 MB'));
        return;
      }
      const ws = fs.createWriteStream(dest);
      let received = 0;
      res.on('data', (chunk: Buffer) => {
        received += chunk.length;
        if (received > maxBytes) {
          req.destroy(new Error('Plugin asset exceeds 2 MB'));
          ws.destroy();
          fs.rmSync(dest, { force: true });
        }
      });
      res.pipe(ws);
      ws.on('finish', () => resolve());
      ws.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy(new Error('REQUEST_TIMEOUT'));
    });
  });
}

async function normalizeInstalledPluginLogo(
  plugin: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const pluginName = String(plugin.name || '');
  const logo = plugin.logo;
  if (!pluginName || typeof logo !== 'string' || !logo.trim()) return plugin;
  const s = logo.trim();

  if (isDataUrl(s)) return plugin;

  if (/^image:/i.test(s)) {
    const p = imageUrlToPathSafe(s);
    const abs = p && toPluginScopedAbsolutePath(pluginName, p);
    return abs
      ? { ...plugin, logo: portablePluginLogo(pluginName, abs) }
      : { ...plugin, logo: '' };
  }

  if (isHttpUrl(s)) {
    try {
      const pluginRoot = resolveInstalledPluginRoot(pluginName);
      fs.mkdirSync(pluginRoot, { recursive: true });
      const parsed = new URL(s);
      const ext = path.extname(parsed.pathname || '').slice(0, 16) || '.png';
      const filePath = path.join(pluginRoot, `.flick-logo${ext}`);
      await downloadToFile(s, filePath);
      return { ...plugin, logo: portablePluginLogo(pluginName, filePath) };
    } catch {
      return plugin;
    }
  }

  if (isFileUrl(s)) {
    const p = fileUrlToPathSafe(s);
    if (!p) return plugin;
    const abs = toPluginScopedAbsolutePath(pluginName, p);
    return abs
      ? { ...plugin, logo: portablePluginLogo(pluginName, abs) }
      : plugin;
  }

  const abs = toPluginScopedAbsolutePath(pluginName, s);
  return abs
    ? { ...plugin, logo: portablePluginLogo(pluginName, abs) }
    : plugin;
}

function normalizePluginLogoLocalPath(
  plugin: Record<string, unknown>
): Record<string, unknown> {
  const pluginName = String(plugin.name || '');
  const logo = plugin.logo;
  if (!pluginName || typeof logo !== 'string' || !logo.trim()) return plugin;
  const s = logo.trim();

  if (isDataUrl(s) || isHttpUrl(s)) return plugin;

  if (/^image:/i.test(s)) {
    const p = imageUrlToPathSafe(s);
    const abs = p && toPluginScopedAbsolutePath(pluginName, p);
    return abs
      ? { ...plugin, logo: portablePluginLogo(pluginName, abs) }
      : { ...plugin, logo: '' };
  }

  if (isFileUrl(s)) {
    const p = fileUrlToPathSafe(s);
    if (!p) return plugin;
    const abs = toPluginScopedAbsolutePath(pluginName, p);
    return abs
      ? { ...plugin, logo: portablePluginLogo(pluginName, abs) }
      : plugin;
  }

  const abs = toPluginScopedAbsolutePath(pluginName, s);
  return abs
    ? { ...plugin, logo: portablePluginLogo(pluginName, abs) }
    : plugin;
}

function normalizePluginForStorage(
  plugin: Record<string, unknown>
): Record<string, unknown> {
  const canonical = normalizeRubickPluginManifest(plugin);
  const {
    logoUrl: _logoUrl,
    indexUrl: _indexUrl,
    indexPath: _indexPath,
    tplPath: _tplPath,
    icon: _icon,
    ...persisted
  } = canonical;
  return normalizePluginLogoLocalPath(persisted);
}

function migrateCatalog(value: unknown): Record<string, unknown>[] {
  return (Array.isArray(value) ? value : [])
    .filter((plugin) => plugin && plugin.name !== 'flick-superx')
    .map((plugin) => normalizePluginForStorage(plugin));
}

let registryPromise: Promise<string | undefined> | null = null;

function getPluginRegistry(): Promise<string | undefined> {
  if (!registryPromise) {
    registryPromise = API.dbGet({
      data: {
        id: 'flick-localhost-config',
      },
    })
      .then((res) =>
        typeof res?.data?.register === 'string' ? res.data.register : undefined
      )
      .catch(() => undefined);
  }
  return registryPromise;
}

async function getPluginInstance(pluginName: string): Promise<PluginHandler> {
  const registry = await getPluginRegistry();
  return new PluginHandler({
    baseDir: ensurePluginWorkspace(pluginName),
    registry,
  });
}

function localDevelopmentPackage(pluginPath: string): {
  path: string;
  info: Record<string, unknown> & { name: string };
} {
  const resolved = path.resolve(pluginPath);
  const info = JSON.parse(
    fs.readFileSync(path.join(resolved, 'package.json'), 'utf8')
  ) as Record<string, unknown> & { name?: unknown };
  if (typeof info.name !== 'string' || !info.name.trim()) {
    throw new Error('Development plugin package.json requires a name');
  }
  return {
    path: resolved,
    info: { ...info, name: info.name.trim() },
  };
}

global.LOCAL_PLUGINS = {
  PLUGINS: [],
  async upgradePlugin(name) {
    const pluginInstance = await getPluginInstance(name);
    if (isIsolatedPluginInstalled(name)) {
      await pluginInstance.upgrade(name);
    } else {
      await pluginInstance.install([name], { isDev: false });
      removeLegacyPluginPackage(name);
    }
  },
  async downloadPlugin(plugin) {
    const development = plugin.isDev
      ? localDevelopmentPackage(plugin.name)
      : null;
    const pluginName = development?.info.name || plugin.name;
    const installTarget = development?.path || pluginName;
    const pluginInstance = await getPluginInstance(pluginName);
    await pluginInstance.install([installTarget], { isDev: !!plugin.isDev });
    const pluginPath = isolatedPluginRoot(pluginName);
    const pluginInfo = JSON.parse(
      fs.readFileSync(path.join(pluginPath, 'package.json'), 'utf8')
    );
    plugin = {
      ...plugin,
      ...pluginInfo,
      name: pluginName,
      isDev: !!plugin.isDev,
    };
    removeLegacyPluginPackage(pluginName);
    plugin = await normalizeInstalledPluginLogo(plugin);
    global.LOCAL_PLUGINS.addPlugin(plugin);
    return global.LOCAL_PLUGINS.PLUGINS;
  },
  async refreshPlugin(plugin) {
    const development = path.isAbsolute(plugin.name)
      ? localDevelopmentPackage(plugin.name)
      : null;
    const pluginName = development?.info.name || plugin.name;
    const pluginPath = resolveInstalledPluginRoot(pluginName);
    const pluginInfo = JSON.parse(
      fs.readFileSync(path.join(pluginPath, 'package.json'), 'utf8')
    );
    plugin = {
      ...plugin,
      ...pluginInfo,
      name: pluginName,
    };
    plugin = await normalizeInstalledPluginLogo(plugin);
    plugin = normalizePluginForStorage(plugin);
    // 刷新
    let currentPlugins = global.LOCAL_PLUGINS.getLocalPlugins();

    currentPlugins = currentPlugins.map((p) => {
      if (p.name === plugin.name) {
        return plugin;
      }
      return p;
    });

    // 存入
    global.LOCAL_PLUGINS.PLUGINS = currentPlugins;
    fs.writeFileSync(configPath, JSON.stringify(currentPlugins));
    return global.LOCAL_PLUGINS.PLUGINS;
  },
  getLocalPlugins() {
    try {
      if (!global.LOCAL_PLUGINS.PLUGINS.length) {
        const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        const migrated = migrateCatalog(raw);
        global.LOCAL_PLUGINS.PLUGINS = migrated;
        if (JSON.stringify(raw) !== JSON.stringify(migrated)) {
          fs.writeFileSync(configPath, JSON.stringify(migrated));
        }
      }
      return global.LOCAL_PLUGINS.PLUGINS;
    } catch (e) {
      global.LOCAL_PLUGINS.PLUGINS = [];
      return global.LOCAL_PLUGINS.PLUGINS;
    }
  },
  addPlugin(plugin) {
    plugin = normalizePluginForStorage(plugin);
    let has = false;
    const currentPlugins = global.LOCAL_PLUGINS.getLocalPlugins();
    currentPlugins.some((p) => {
      has = p.name === plugin.name;
      return has;
    });
    if (!has) {
      currentPlugins.unshift(plugin);
      global.LOCAL_PLUGINS.PLUGINS = currentPlugins;
      fs.writeFileSync(configPath, JSON.stringify(currentPlugins));
    }
  },
  updatePlugin(plugin) {
    plugin = normalizePluginForStorage(plugin);
    global.LOCAL_PLUGINS.PLUGINS = global.LOCAL_PLUGINS.PLUGINS.map(
      (origin) => {
        if (origin.name === plugin.name) {
          return plugin;
        }
        return origin;
      }
    );
    fs.writeFileSync(configPath, JSON.stringify(global.LOCAL_PLUGINS.PLUGINS));
  },
  async deletePlugin(plugin) {
    if (
      plugin.name === 'flick-system-feature' ||
      plugin.name === 'flick-system-super-panel'
    ) {
      return global.LOCAL_PLUGINS.getLocalPlugins();
    }
    if (isIsolatedPluginInstalled(plugin.name)) {
      const pluginInstance = await getPluginInstance(plugin.name);
      try {
        await pluginInstance.uninstall([plugin.name], {
          isDev: !!plugin.isDev,
        });
      } catch {
        // Removing the isolated workspace below is the authoritative cleanup.
      }
      try {
        fs.rmSync(pluginWorkspaceDir(plugin.name), {
          recursive: true,
          force: true,
        });
      } catch {
        // Windows may keep native modules locked until the plugin view exits.
      }
    }
    removeLegacyPluginPackage(plugin.name);
    global.LOCAL_PLUGINS.PLUGINS = global.LOCAL_PLUGINS.PLUGINS.filter(
      (p) => plugin.name !== p.name
    );
    fs.writeFileSync(configPath, JSON.stringify(global.LOCAL_PLUGINS.PLUGINS));
    return global.LOCAL_PLUGINS.PLUGINS;
  },
  reloadPluginsFromDisk() {
    try {
      const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      global.LOCAL_PLUGINS.PLUGINS = migrateCatalog(raw);
      if (
        JSON.stringify(raw) !== JSON.stringify(global.LOCAL_PLUGINS.PLUGINS)
      ) {
        fs.writeFileSync(
          configPath,
          JSON.stringify(global.LOCAL_PLUGINS.PLUGINS)
        );
      }
    } catch (e) {
      global.LOCAL_PLUGINS.PLUGINS = [];
    }
    ensureBuiltinPluginsInList();
    return global.LOCAL_PLUGINS.PLUGINS;
  },
};

ensureBuiltinPluginsInList();
