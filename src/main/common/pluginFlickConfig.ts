import fs from 'fs';
import path from 'path';
import { PLUGIN_INSTALL_DIR as baseDir } from '@/common/constans/main';
import type { DetachInputUserPolicy } from '@/common/types/detachInput';

/** 合并存储：各插件 UI 设置，顶层 key 为插件 `name` */
export const PLUGIN_UI_SETTINGS_FILE = 'flick-plugin-ui-settings.json';

/** 不读写文件的系统插件（无独立包目录、无对应 market name） */
const SKIP_NAMES = new Set(['flick-system-super-panel']);
const PLUGIN_NAME_RE = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i;

export function isValidPluginFlickConfigName(name: unknown): name is string {
  return (
    typeof name === 'string' &&
    name.length > 0 &&
    name.length <= 214 &&
    name !== '__proto__' &&
    name !== 'constructor' &&
    name !== 'prototype' &&
    PLUGIN_NAME_RE.test(name)
  );
}

export type PluginFlickConfig = {
  autoDetach?: boolean;
  /** 标题栏输入框策略；是否显示仍受插件声明的 input capability 约束。 */
  detachInputPolicy?: DetachInputUserPolicy;
  /** @deprecated 旧配置字段，仅用于读取迁移。 */
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
  const detachInputPolicy: DetachInputUserPolicy =
    o.detachInputPolicy === 'always' || o.detachAlwaysShowSearch === true
      ? 'always'
      : 'auto';
  return {
    ...(typeof o.autoDetach === 'boolean' ? { autoDetach: o.autoDetach } : {}),
    detachInputPolicy,
  };
}

function parseStoreFile(parsed: unknown): SettingsMap {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {};
  }
  const out: SettingsMap = {};
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (
      isValidPluginFlickConfigName(k) &&
      v &&
      typeof v === 'object' &&
      !Array.isArray(v)
    ) {
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
    const parsed = JSON.parse(raw) as unknown;
    const normalized = parseStoreFile(parsed);
    if (JSON.stringify(parsed) !== JSON.stringify(normalized)) {
      saveStore(normalized);
    }
    return normalized;
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
  if (!isValidPluginFlickConfigName(name) || SKIP_NAMES.has(name)) return {};
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
  if (!isValidPluginFlickConfigName(name) || SKIP_NAMES.has(name)) return false;
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

export function flipPluginDetachInputPolicySync(
  name: string
): DetachInputUserPolicy {
  const cur = readPluginFlickConfigSync(name).detachInputPolicy ?? 'auto';
  const next: DetachInputUserPolicy = cur === 'always' ? 'auto' : 'always';
  writePluginFlickConfigSync(name, { detachInputPolicy: next });
  return next;
}
