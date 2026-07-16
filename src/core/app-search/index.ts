export default async () => {
  if (!window.flick.isWindows()) return [];
  const { default: winSearch } = await import('./win');
  return winSearch();
};
