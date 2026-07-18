export default async () => {
  if (process.platform === 'win32') {
    const { default: winSearch } = await import('./win');
    return winSearch();
  }
  if (process.platform === 'darwin') {
    const { default: macSearch } = await import('./darwin');
    return macSearch(null);
  }
  if (process.platform === 'linux') {
    const { default: linuxSearch } = await import('./linux');
    return linuxSearch();
  }
  return [];
};
