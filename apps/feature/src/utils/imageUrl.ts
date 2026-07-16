export function featureImageUrl(raw: unknown): string {
  const value = String(raw || '');
  if (value.startsWith('file://')) {
    return `image://${value.slice('file://'.length)}`;
  }
  if (value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value)) {
    return `image://${value}`;
  }
  return value;
}
