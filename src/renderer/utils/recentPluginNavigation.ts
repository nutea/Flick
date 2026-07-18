export type RecentPluginNavigationInput = {
  key: string;
  value: unknown;
  enabled: boolean;
  isComposing?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  metaKey?: boolean;
};

export type RecentPluginNavigationDirection = -1 | 0 | 1;

const identityPart = (value: unknown): string => {
  if (value == null) return '';
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return String(record.code ?? record.label ?? record.type ?? '');
  }
  return String(value);
};

/** Vue keys must remain unique even when one plugin contributes many commands. */
export const recentPluginItemKey = (
  item: Record<string, unknown>,
  index: number
): string =>
  [
    item.id ?? item._id ?? item.originName ?? item.name ?? 'item',
    identityPart(item.feature),
    identityPart(item.cmd),
    index,
  ].join('::');

/**
 * Resolve horizontal navigation without taking cursor and selection shortcuts
 * away from the input. The parent decides whether the recent-plugin view is
 * actually visible; this function only owns keyboard semantics.
 */
export const resolveRecentPluginNavigation = ({
  key,
  value,
  enabled,
  isComposing = false,
  ctrlKey = false,
  shiftKey = false,
  altKey = false,
  metaKey = false,
}: RecentPluginNavigationInput): RecentPluginNavigationDirection => {
  if (
    !enabled ||
    String(value ?? '').length > 0 ||
    isComposing ||
    ctrlKey ||
    shiftKey ||
    altKey ||
    metaKey
  ) {
    return 0;
  }

  if (key === 'ArrowLeft') return -1;
  if (key === 'ArrowRight') return 1;
  return 0;
};
