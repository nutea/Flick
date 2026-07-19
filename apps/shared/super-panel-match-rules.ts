export const SUPER_PANEL_MATCH_RULES_DB_ID = 'super-panel-match-rules';

export interface SuperPanelMatchRuleOverride {
  id: string;
  pluginName: string;
  featureCode: string;
  commandKey: string;
  priority?: number;
  matchRules: Record<string, unknown>;
}

export interface SuperPanelMatchRulesDocument {
  _id?: string;
  _rev?: string;
  data: SuperPanelMatchRuleOverride[];
}

export function commandMatchKey(command: unknown, index: number): string {
  if (!command || typeof command !== 'object') {
    return `text:${String(command || '')}:${index}`;
  }
  const cmd = command as Record<string, unknown>;
  return [
    String(cmd.type || 'custom'),
    String(cmd.label || ''),
    String(cmd.match || ''),
    String(index),
  ].join(':');
}

export function matchRuleOverrideId(
  pluginName: string,
  featureCode: string,
  commandKey: string
): string {
  return JSON.stringify([pluginName, featureCode, commandKey]);
}

export function normalizeMatchRulesDocument(
  value: unknown
): SuperPanelMatchRulesDocument {
  const source =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};
  return {
    ...(typeof source._id === 'string' ? { _id: source._id } : {}),
    ...(typeof source._rev === 'string' ? { _rev: source._rev } : {}),
    data: Array.isArray(source.data)
      ? source.data.filter(
          (row): row is SuperPanelMatchRuleOverride =>
            !!row &&
            typeof row === 'object' &&
            typeof row.id === 'string' &&
            typeof row.pluginName === 'string' &&
            typeof row.featureCode === 'string' &&
            typeof row.commandKey === 'string' &&
            !!row.matchRules &&
            typeof row.matchRules === 'object'
        )
      : [],
  };
}
