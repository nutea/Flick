import path from 'path';
import fs from 'fs';
import http from 'http';
import https from 'https';
import { PluginHandler } from '@/core';
import { PLUGIN_INSTALL_DIR as baseDir } from '@/common/constans/main';
import API from '@/main/common/api';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const __static: string;

const configPath = path.join(baseDir, './flick-local-plugin.json');
const BUILTIN_SUPER_PANEL_PKG = path.join(
  __static,
  'superx',
  'package.json'
);

function ensureBuiltinSuperPanelInList(): void {
  try {
    if (!fs.existsSync(BUILTIN_SUPER_PANEL_PKG)) return;
    if (fs.existsSync(configPath)) {
      const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (Array.isArray(raw) && raw.some((p) => p.name === 'flick-superx')) {
        const next = raw.filter((p) => p.name !== 'flick-superx');
        fs.writeFileSync(configPath, JSON.stringify(next));
        global.LOCAL_PLUGINS.PLUGINS = [];
      }
    }
    const plugins = global.LOCAL_PLUGINS.getLocalPlugins();
    const info = JSON.parse(fs.readFileSync(BUILTIN_SUPER_PANEL_PKG, 'utf-8'));
    const payload = { ...info, isDev: false };
    const idx = plugins.findIndex((p) => p.name === 'flick-system-super-panel');
    if (idx === -1) {
      global.LOCAL_PLUGINS.addPlugin(payload);
    } else {
      const next = [...plugins];
      next[idx] = normalizePluginLogoLocalPath({ ...next[idx], ...payload });
      global.LOCAL_PLUGINS.PLUGINS = next;
      fs.writeFileSync(configPath, JSON.stringify(next));
    }
  } catch (e) {
    console.warn('[flick] ensureBuiltinSuperPanelInList', e);
  }
}

function pluginNmDir(pluginName: string): string {
  return path.join(baseDir, 'node_modules', ...pluginName.split('/'));
}

function pluginDiskRoot(pluginName: string): string {
  if (pluginName === 'flick-system-feature') {
    return path.join(__static, 'feature');
  }
  if (pluginName === 'flick-system-super-panel') {
    return path.join(__static, 'superx');
  }
  return pluginNmDir(pluginName);
}

function isHttpUrl(v: unknown): v is string {
  return typeof v === 'string' && /^https?:\/\//i.test(v.trim());
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

function downloadToFile(
  url: string,
  dest: string,
  redirects = 0
): Promise<void> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https://') ? https : http;
    const req = client.get(url, (res) => {
      const status = res.statusCode || 0;
      const location = res.headers.location;
      if (
        status >= 300 &&
        status < 400 &&
        location &&
        redirects < 5
      ) {
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
      const ws = fs.createWriteStream(dest);
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

  if (isHttpUrl(s)) {
    try {
      const pluginRoot = pluginNmDir(pluginName);
      fs.mkdirSync(pluginRoot, { recursive: true });
      const parsed = new URL(s);
      const ext = path.extname(parsed.pathname || '').slice(0, 16) || '.png';
      const filePath = path.join(pluginRoot, `.flick-logo${ext}`);
      await downloadToFile(s, filePath);
      return { ...plugin, logo: filePath };
    } catch {
      return plugin;
    }
  }

  if (isFileUrl(s)) {
    const p = fileUrlToPathSafe(s);
    if (!p) return plugin;
    const abs = toPluginScopedAbsolutePath(pluginName, p);
    return abs ? { ...plugin, logo: abs } : plugin;
  }

  const abs = toPluginScopedAbsolutePath(pluginName, s);
  return abs ? { ...plugin, logo: abs } : plugin;
}

function normalizePluginLogoLocalPath(
  plugin: Record<string, unknown>
): Record<string, unknown> {
  const pluginName = String(plugin.name || '');
  const logo = plugin.logo;
  if (!pluginName || typeof logo !== 'string' || !logo.trim()) return plugin;
  const s = logo.trim();

  if (isDataUrl(s) || isHttpUrl(s)) return plugin;

  if (isFileUrl(s)) {
    const p = fileUrlToPathSafe(s);
    if (!p) return plugin;
    const abs = toPluginScopedAbsolutePath(pluginName, p);
    return abs ? { ...plugin, logo: abs } : plugin;
  }

  const abs = toPluginScopedAbsolutePath(pluginName, s);
  return abs ? { ...plugin, logo: abs } : plugin;
}

/**
 * npm 在 Windows 上常因 .node 被占用报 EPERM；失败时至少从 package.json 与列表中移除，并尽力删目录
 */
function removeInstalledPluginFromDisk(pluginName: string): void {
  const pkgPath = path.join(baseDir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as {
      dependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    let touched = false;
    for (const key of [
      'dependencies',
      'optionalDependencies',
      'devDependencies',
    ] as const) {
      const block = pkg[key];
      if (block && Object.prototype.hasOwnProperty.call(block, pluginName)) {
        delete block[pluginName];
        touched = true;
      }
    }
    if (touched) {
      fs.writeFileSync(pkgPath, JSON.stringify(pkg));
    }
  }
  const modPath = pluginNmDir(pluginName);
  try {
    if (fs.existsSync(modPath)) {
      fs.rmSync(modPath, { recursive: true, force: true });
    }
  } catch {
    // EPERM 等：关闭插件进程或重启应用后再手动删目录
  }
}

let registry;
let pluginInstance;
(async () => {
  try {
    const res = await API.dbGet({
      data: {
        id: 'flick-localhost-config',
      },
    });

    registry = res && res.data.register;
    pluginInstance = new PluginHandler({
      baseDir,
      registry,
    });
  } catch (e) {
    pluginInstance = new PluginHandler({
      baseDir,
      registry,
    });
  }
})();

global.LOCAL_PLUGINS = {
  PLUGINS: [],
  async downloadPlugin(plugin) {
    await pluginInstance.install([plugin.name], { isDev: plugin.isDev });
    if (plugin.isDev) {
      // 获取 dev 插件信息
      const pluginPath = path.resolve(baseDir, 'node_modules', plugin.name);
      const pluginInfo = JSON.parse(
        fs.readFileSync(path.join(pluginPath, './package.json'), 'utf8')
      );
      plugin = {
        ...plugin,
        ...pluginInfo,
      };
    }
    plugin = await normalizeInstalledPluginLogo(plugin);
    global.LOCAL_PLUGINS.addPlugin(plugin);
    return global.LOCAL_PLUGINS.PLUGINS;
  },
  async refreshPlugin(plugin) {
    // 获取 dev 插件信息
    const pluginPath = path.resolve(baseDir, 'node_modules', plugin.name);
    const pluginInfo = JSON.parse(
      fs.readFileSync(path.join(pluginPath, './package.json'), 'utf8')
    );
    plugin = {
      ...plugin,
      ...pluginInfo,
    };
    plugin = await normalizeInstalledPluginLogo(plugin);
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
        global.LOCAL_PLUGINS.PLUGINS = (Array.isArray(raw) ? raw : []).filter(
          (p) => p && p.name !== 'flick-superx'
        );
      }
      return global.LOCAL_PLUGINS.PLUGINS;
    } catch (e) {
      global.LOCAL_PLUGINS.PLUGINS = [];
      return global.LOCAL_PLUGINS.PLUGINS;
    }
  },
  addPlugin(plugin) {
    plugin = normalizePluginLogoLocalPath(plugin);
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
    try {
      await pluginInstance.uninstall([plugin.name], { isDev: plugin.isDev });
    } catch (_e) {
      removeInstalledPluginFromDisk(plugin.name);
    }
    global.LOCAL_PLUGINS.PLUGINS = global.LOCAL_PLUGINS.PLUGINS.filter(
      (p) => plugin.name !== p.name
    );
    fs.writeFileSync(configPath, JSON.stringify(global.LOCAL_PLUGINS.PLUGINS));
    return global.LOCAL_PLUGINS.PLUGINS;
  },
  reloadPluginsFromDisk() {
    try {
      const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      global.LOCAL_PLUGINS.PLUGINS = (Array.isArray(raw) ? raw : []).filter(
        (p) => p && p.name !== 'flick-superx'
      );
    } catch (e) {
      global.LOCAL_PLUGINS.PLUGINS = [];
    }
    ensureBuiltinSuperPanelInList();
    return global.LOCAL_PLUGINS.PLUGINS;
  },
};

ensureBuiltinSuperPanelInList();
