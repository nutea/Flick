import { RUBICK_SYSTEM_PLUGIN_ALIASES } from './constants';

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function nonEmptyString(value: unknown): string | undefined {
  const text = typeof value === 'string' ? value.trim() : '';
  return text || undefined;
}

export function canonicalRubickPluginName(value: unknown): string {
  const name = nonEmptyString(value) || '';
  return (
    RUBICK_SYSTEM_PLUGIN_ALIASES[
      name as keyof typeof RUBICK_SYSTEM_PLUGIN_ALIASES
    ] || name
  );
}

function normalizeCommand(value: unknown): unknown | null {
  if (typeof value === 'string') {
    const command = value.trim();
    return command || null;
  }
  const source = record(value);
  if (!source) return null;
  const sourceType = nonEmptyString(source.type);
  const type = sourceType === 'file' ? 'files' : sourceType;
  if (!type) return null;
  return {
    ...source,
    type,
    ...(nonEmptyString(source.label)
      ? { label: nonEmptyString(source.label) }
      : {}),
  };
}

function normalizeFeature(value: unknown, index: number): UnknownRecord | null {
  const source = record(value);
  if (!source) return null;
  const code = nonEmptyString(source.code) || `legacy-feature-${index + 1}`;
  const commands = (Array.isArray(source.cmds) ? source.cmds : [])
    .map(normalizeCommand)
    .filter(
      (command): command is NonNullable<typeof command> => command !== null
    );
  return {
    ...source,
    code,
    cmds: commands,
  };
}

/**
 * Converts a Rubick package manifest into Flick's canonical runtime shape.
 * Unknown fields are intentionally preserved because third-party plugins often
 * carry private metadata consumed by their own preload scripts.
 */
export function normalizeRubickPluginManifest<T extends UnknownRecord>(
  input: T
): T & {
  name: string;
  pluginName: string;
  features: UnknownRecord[];
  originName?: string;
} {
  const sourceName = nonEmptyString(input.name) || '';
  const name = canonicalRubickPluginName(sourceName);
  const pluginName =
    nonEmptyString(input.pluginName) || nonEmptyString(input.name) || name;
  const features = (Array.isArray(input.features) ? input.features : [])
    .map(normalizeFeature)
    .filter((feature): feature is UnknownRecord => feature !== null);
  const result = {
    ...input,
    name,
    pluginName,
    features,
  } as T & {
    name: string;
    pluginName: string;
    features: UnknownRecord[];
    originName?: string;
  };

  if (sourceName && sourceName !== name && !nonEmptyString(input.originName)) {
    result.originName = sourceName;
  }
  return result;
}

export function normalizeRubickPluginList(value: unknown): UnknownRecord[] {
  return (Array.isArray(value) ? value : [])
    .map(record)
    .filter((plugin): plugin is UnknownRecord => plugin !== null)
    .map(normalizeRubickPluginManifest);
}
