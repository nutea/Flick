/**
 * contextBridge clones arguments before the exposed preload function runs.
 * Vue proxies therefore have to be flattened on the renderer side first.
 */
export function toMarketPayload<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
