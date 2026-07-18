const IMAGE_PROTOCOL_BASE = 'image://local/';

export function toImageProtocolUrl(raw: unknown): string {
  const value = String(raw || '').trim();
  if (!value) return '';
  if (/^(?:image|data|blob|https?):/i.test(value)) return value;

  const isLocal =
    /^file:/i.test(value) ||
    value.startsWith('/') ||
    /^[A-Za-z]:[\\/]/.test(value) ||
    /^\\\\/.test(value);
  return isLocal
    ? `${IMAGE_PROTOCOL_BASE}?src=${encodeURIComponent(value)}`
    : value;
}

export function imageProtocolSource(requestUrl: string): string | null {
  try {
    const parsed = new URL(requestUrl);
    if (parsed.protocol !== 'image:') return null;
    const source = parsed.searchParams.get('src');
    if (source) return source;
  } catch {
    // Older Windows URLs such as image://C:\\path are not URL-parseable.
  }

  // Compatibility with URLs written by older Flick versions.
  try {
    return decodeURI(requestUrl.slice('image://'.length));
  } catch {
    return null;
  }
}
