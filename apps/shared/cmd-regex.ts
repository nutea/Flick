/**
 * Parse plugin command patterns. Slash-delimited patterns support flags;
 * malformed input produces a regex that never matches instead of throwing.
 */
export function parseCmdRegex(match: string): RegExp {
  if (match.startsWith('/') && match.lastIndexOf('/') > 0) {
    const last = match.lastIndexOf('/');
    const body = match.slice(1, last);
    const flags = match.slice(last + 1);
    try {
      return new RegExp(body, flags);
    } catch {
      return /$^/;
    }
  }
  try {
    return new RegExp(match);
  } catch {
    return /$^/;
  }
}
