import { parseCmdRegex } from '../../../shared/cmd-regex';
import type { CmdItem, SelectedFileItem, SelectionFileKind } from './types';

export interface PluginFilePayload {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  path: string;
}

export function toPluginFilePayload(
  files: SelectedFileItem[]
): PluginFilePayload[] {
  return files.map((file) => ({
    isFile: file.isFile,
    isDirectory: file.isDirectory,
    name: file.name,
    path: file.path,
  }));
}

export function matchesFileCommand(
  cmd: CmdItem,
  files: SelectedFileItem[]
): boolean {
  const custom = cmd.matchRules;
  if (custom?.enabled === false) return false;
  if (custom?.selection && custom.selection !== 'files') return false;
  if (cmd.type !== 'files' && custom?.selection !== 'files') {
    return false;
  }
  if (files.length === 0) return false;

  const defaultMinCount = 1;
  const defaultMaxCount = Number.POSITIVE_INFINITY;
  const minCount = validLimit(
    custom?.minCount ?? cmd.minLength,
    defaultMinCount
  );
  const maxCount = validLimit(
    custom?.maxCount ?? cmd.maxLength,
    defaultMaxCount
  );
  if (files.length < minCount || files.length > maxCount) return false;

  const kinds = resolveKinds(cmd);
  const kindMatches = (file: SelectedFileItem) => {
    const kind = fileKind(file);
    return kind !== null && kinds.has(kind);
  };
  const kindMode = custom?.mode === 'any' ? 'any' : 'all';
  if (!testCollection(files, kindMatches, kindMode)) return false;

  const pattern = custom?.pattern ?? cmd.match;
  if (!pattern) return true;
  const target = custom?.target ?? 'extension';
  const regex = parseCmdRegex(pattern);
  const patternMatches = (file: SelectedFileItem) => {
    regex.lastIndex = 0;
    return regex.test(String(file[target] || ''));
  };
  return testCollection(files, patternMatches, custom?.mode ?? 'all');
}

function validLimit(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : fallback;
}

function fileKind(file: SelectedFileItem): SelectionFileKind | null {
  if (file.isDirectory) return 'directory';
  if (file.isFile) return 'file';
  return null;
}

function resolveKinds(cmd: CmdItem): Set<SelectionFileKind> {
  const customKinds = cmd.matchRules?.kinds?.filter(
    (kind): kind is SelectionFileKind => kind === 'file' || kind === 'directory'
  );
  if (customKinds?.length) return new Set(customKinds);
  if (cmd.fileType === 'directory' || cmd.fileType === 'folder') {
    return new Set(['directory']);
  }
  if (cmd.fileType === 'file' || cmd.type === 'files') {
    return new Set(['file']);
  }
  return new Set(['file', 'directory']);
}

function testCollection<T>(
  items: T[],
  predicate: (item: T) => boolean,
  mode: 'all' | 'any'
): boolean {
  return mode === 'any' ? items.some(predicate) : items.every(predicate);
}
