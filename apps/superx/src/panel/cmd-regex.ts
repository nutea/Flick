/**
 * 解析 cmd.match 中形如 `/pattern/flags` 的字符串；否则按普通字符串构造正则。
 */
export function parseCmdRegex(match: string): RegExp {
  if (match.startsWith('/') && match.lastIndexOf('/') > 0) {
    const last = match.lastIndexOf('/');
    const body = match.slice(1, last);
    const flags = match.slice(last + 1);
    try {
      return new RegExp(body, flags);
    } catch {
      /* fall through */
    }
  }
  try {
    return new RegExp(match);
  } catch {
    return /$^/;
  }
}
