import fs from 'fs';
import path from 'path';
import { PLUGIN_INSTALL_DIR as baseDir } from '@/common/constans/main';

/** 合并存储：各插件 UI 设置，顶层 key 为插件 `name` */
export const PLUGIN_UI_SETTINGS_FILE = 'flick-plugin-ui-settings.json';

/** 不读写文件的系统插件（无独立包目录、无对应 market name） */
const SKIP_NAMES = new Set(['flick-system-super-panel']);

export type PluginFlickConfig = {
  autoDetach?: boolean;
  /** 独立窗口顶栏是否始终显示搜索框（否则仍按 subInput 是否有内容切换） */
  detachAlwaysShowSearch?: boolean;
};

type SettingsMap = Record<string, PluginFlickConfig>;

const storePath = (): string => path.join(baseDir, PLUGIN_UI_SETTINGS_FILE);

function ensureBaseDir(): void {
  try {
    fs.mkdirSync(baseDir, { recursive: true });
  } catch {
    /* ignore */
  }
}

function cloneRow(v: unknown): PluginFlickConfig {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  const o = v as PluginFlickConfig;
  return {
    ...(typeof o.autoDetach === 'boolean' ? { autoDetach: o.autoDetach } : {}),
    ...(typeof o.detachAlwaysShowSearch === 'boolean'
      ? { detachAlwaysShowSearch: o.detachAlwaysShowSearch }
      : {}),
  };
}

function parseStoreFile(parsed: unknown): SettingsMap {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {};
  }
  const out: SettingsMap = {};
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = cloneRow(v);
    }
  }
  return out;
}

function loadStore(): SettingsMap {
  const p = storePath();
  if (!fs.existsSync(p)) {
    return {};
  }
  try {
    const raw = fs.readFileSync(p, 'utf8');
    return parseStoreFile(JSON.parse(raw) as unknown);
  } catch {
    return {};
  }
}

function saveStore(map: SettingsMap): void {
  ensureBaseDir();
  const p = storePath();
  const tmp = `${p}.${process.pid}.tmp`;
  const data = JSON.stringify(map, null, 2);
  fs.writeFileSync(tmp, data, 'utf8');
  fs.renameSync(tmp, p);
}

export function readPluginFlickConfigSync(name: string): PluginFlickConfig {
  if (!name || SKIP_NAMES.has(name)) return {};
  const map = loadStore();
  if (Object.prototype.hasOwnProperty.call(map, name)) {
    const row = map[name];
    return row && typeof row === 'object' ? { ...row } : {};
  }
  return {};
}

export function writePluginFlickConfigSync(
  name: string,
  patch: Partial<PluginFlickConfig>
): boolean {
  if (!name || SKIP_NAMES.has(name)) return false;
  try {
    const map = loadStore();
    const prev = map[name] || {};
    map[name] = { ...prev, ...patch };
    saveStore(map);
    return true;
  } catch {
    return false;
  }
}

export function flipPluginAutoDetachSync(name: string): boolean {
  const cur = readPluginFlickConfigSync(name).autoDetach === true;
  const next = !cur;
  writePluginFlickConfigSync(name, { autoDetach: next });
  return next;
}

export function flipPluginDetachAlwaysShowSearchSync(name: string): boolean {
  const cur = readPluginFlickConfigSync(name).detachAlwaysShowSearch === true;
  const next = !cur;
  writePluginFlickConfigSync(name, { detachAlwaysShowSearch: next });
  return next;
}
