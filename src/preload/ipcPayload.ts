/** Convert Vue proxies and other renderer-owned objects into IPC-cloneable data. */
export function toIpcPayload<T>(value: T): T {
  if (value === undefined || value === null) return value;
  return JSON.parse(JSON.stringify(value)) as T;
}
