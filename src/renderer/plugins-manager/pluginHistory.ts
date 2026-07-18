export type RecentPlugin = Record<string, any>;

const RUNTIME_ENTRY_FIELDS = [
  'indexPath',
  'indexUrl',
  'tplPath',
  'development',
] as const;

/** Runtime entry URLs are checkout/build specific and must never be replayed. */
export function sanitizeRecentPlugin(plugin: RecentPlugin): RecentPlugin {
  const result = { ...plugin };
  for (const field of RUNTIME_ENTRY_FIELDS) delete result[field];
  return result;
}

const identityPart = (value: unknown): string => {
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }
  if (!value || typeof value !== 'object') return '';
  const item = value as Record<string, unknown>;
  return String(
    item.code ??
      item.label ??
      item.id ??
      item.name ??
      item.type ??
      item.match ??
      ''
  );
};

/** Stable identity for one launchable task, independent of legacy display names. */
export function recentPluginTaskKey(plugin: RecentPlugin): string {
  return [
    plugin.originName ?? plugin.name ?? plugin.desc ?? 'item',
    identityPart(plugin.feature),
    identityPart(plugin.cmd),
  ].join('::');
}

/**
 * Keep the command the user launched, but source executable metadata from the
 * currently installed manifest. This also migrates legacy history records.
 */
export function rehydrateRecentPlugin(
  historyItem: RecentPlugin,
  installedPlugin?: RecentPlugin
): RecentPlugin {
  const recent = sanitizeRecentPlugin(historyItem);
  if (!installedPlugin) return recent;

  const installed = sanitizeRecentPlugin(installedPlugin);
  return {
    ...recent,
    ...installed,
    originName: installed.name,
    ...(Object.prototype.hasOwnProperty.call(recent, 'cmd')
      ? { cmd: recent.cmd }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(recent, 'feature')
      ? { feature: recent.feature }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(recent, 'ext')
      ? { ext: recent.ext }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(recent, 'pin')
      ? { pin: recent.pin }
      : {}),
  };
}

export function sanitizeRecentPluginHistory(value: unknown): RecentPlugin[] {
  if (!Array.isArray(value)) return [];

  const history: RecentPlugin[] = [];
  const indexes = new Map<string, number>();
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const recent = sanitizeRecentPlugin(item as RecentPlugin);
    const key = recentPluginTaskKey(recent);
    const existingIndex = indexes.get(key);
    if (existingIndex === undefined) {
      indexes.set(key, history.length);
      history.push(recent);
    } else if (recent.pin && !history[existingIndex].pin) {
      history[existingIndex] = { ...history[existingIndex], pin: true };
    }
  }
  return history;
}
