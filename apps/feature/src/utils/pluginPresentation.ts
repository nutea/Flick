type PluginRecord = Record<string, any>;

function rendererImageUrl(value: unknown): string {
  const url = typeof value === 'string' ? value.trim() : '';
  return /^(?:image|data|blob|https?):/i.test(url) ? url : '';
}

/** Renderer contract: components consume `logoUrl`; raw manifest paths stay data-only. */
export function normalizePluginPresentation<T extends PluginRecord>(
  plugin: T
): T & { logoUrl: string } {
  return {
    ...plugin,
    logoUrl: rendererImageUrl(plugin.logoUrl) || rendererImageUrl(plugin.logo),
  };
}

export function normalizePluginPresentations<T extends object = PluginRecord>(
  value: unknown
): Array<T & { logoUrl: string }> {
  return Array.isArray(value)
    ? value
        .filter(
          (item): item is PluginRecord =>
            !!item && typeof item === 'object' && !Array.isArray(item)
        )
        .map(
          (item) =>
            normalizePluginPresentation(item) as T & {
              logoUrl: string;
            }
        )
    : [];
}
