import {
  canonicalRubickPluginName,
  normalizeRubickPluginManifest,
} from './manifest';

type UnknownRecord = Record<string, unknown>;

export function normalizeRubickRuntimePlugin<T extends UnknownRecord>(
  plugin: T
): ReturnType<typeof normalizeRubickPluginManifest<T>> {
  return normalizeRubickPluginManifest(plugin);
}

export function rubickRuntimePluginName(plugin: UnknownRecord): string {
  return canonicalRubickPluginName(plugin.originName || plugin.name);
}

export function isFlickFeaturePlugin(plugin: UnknownRecord): boolean {
  return canonicalRubickPluginName(plugin.name) === 'flick-system-feature';
}

export function isFlickSuperPanelPlugin(plugin: UnknownRecord): boolean {
  return canonicalRubickPluginName(plugin.name) === 'flick-system-super-panel';
}
