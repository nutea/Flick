import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

import {
  imageProtocolSource,
  toImageProtocolUrl,
} from '@/common/utils/imageProtocol';
import { normalizeRubickPluginManifest } from '@/compat/rubick/manifest';
import { resolveInstalledPluginRoot } from '@/main/common/pluginStorage';

export type PluginPresentation = Record<string, unknown> & {
  name?: string;
  logoUrl: string;
  indexUrl?: string;
};

const BUILTIN_ROOTS: Record<string, () => string> = {
  'flick-system-feature': () => path.join(__static, 'feature'),
  'flick-system-super-panel': () => path.join(__static, 'superx'),
};

export function pluginRoot(pluginName: string): string {
  const builtin = BUILTIN_ROOTS[pluginName];
  return builtin ? builtin() : resolveInstalledPluginRoot(pluginName);
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return (
    relative === '' ||
    (!relative.startsWith('..') && !path.isAbsolute(relative))
  );
}

function localPath(raw: string): string | null {
  if (/^file:/i.test(raw)) {
    try {
      return fileURLToPath(raw);
    } catch {
      return null;
    }
  }
  return path.isAbsolute(raw) ? raw : null;
}

/** Resolve a manifest asset only inside its plugin directory. */
export function resolvePluginAsset(pluginName: string, raw: unknown): string {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) return '';
  if (/^(?:data|blob|https?):/i.test(value)) return value;

  const root = pluginRoot(pluginName);
  const source = /^image:/i.test(value)
    ? imageProtocolSource(value) || ''
    : value;
  const absolute = localPath(source) || path.resolve(root, source);
  if (!isInside(root, absolute)) return '';
  try {
    if (!fs.statSync(absolute).isFile()) return '';
  } catch {
    return '';
  }
  return toImageProtocolUrl(absolute);
}

export function presentPlugin(
  plugin: Record<string, unknown>
): PluginPresentation {
  const canonical = normalizeRubickPluginManifest(plugin);
  const name = canonical.name;
  const logoUrl = name ? resolvePluginAsset(name, canonical.logo) : '';
  const root = name ? pluginRoot(name) : '';
  const main = typeof canonical.main === 'string' ? canonical.main : '';
  const entry = root && main ? path.resolve(root, main) : '';
  const indexUrl =
    entry && isInside(root, entry)
      ? pathToFileURL(entry).toString()
      : undefined;
  return {
    ...canonical,
    logoUrl,
    icon: logoUrl,
    ...(indexUrl ? { indexUrl } : {}),
  };
}

export function presentPlugins(value: unknown): PluginPresentation[] {
  return Array.isArray(value)
    ? value
        .filter(
          (item): item is Record<string, unknown> =>
            !!item && typeof item === 'object'
        )
        .map(presentPlugin)
    : [];
}
