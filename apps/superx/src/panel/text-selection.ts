import { parseCmdRegex } from '../../../shared/cmd-regex';
import type { CmdItem } from './types';

/** 清理会让正则匹配结果产生歧义的不可见文本。 */
export function normalizeSelectionText(raw: string): string {
  return String(raw || '')
    .replace(/[\u200B-\u200D\uFEFF\u2060\u00AD\u200E\u200F\u202A-\u202E]/g, '')
    .trim();
}

export function matchesTextCommand(cmd: CmdItem, rawText: string): boolean {
  const custom = cmd.matchRules;
  if (custom?.enabled === false) return false;
  if (custom?.selection && custom.selection !== 'text') return false;
  if (
    cmd.type !== 'regex' &&
    cmd.type !== 'over' &&
    custom?.selection !== 'text'
  ) {
    return false;
  }

  const text = normalizeSelectionText(rawText);
  if (!text) return false;
  const minLength = validLimit(custom?.minLength ?? cmd.minLength, 0);
  const maxLength = validLimit(
    custom?.maxLength ?? cmd.maxLength,
    Number.POSITIVE_INFINITY
  );
  if (text.length < minLength || text.length > maxLength) return false;

  const pattern = custom?.pattern ?? cmd.match;
  if (!pattern) {
    return cmd.type === 'over' || custom?.selection === 'text';
  }
  const regex = parseCmdRegex(pattern);
  regex.lastIndex = 0;
  return regex.test(text);
}

function validLimit(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : fallback;
}
