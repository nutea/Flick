/** SuperX panel only needs two allowlisted read-only documents. */
export const flickDb = {
  get: <T = { data?: unknown }>(id: string): T | null =>
    window.superPanel.getDocument(id) as T | null,
};
