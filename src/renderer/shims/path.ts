const pathMod =
  (window as any).require?.('path') ||
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('path');

export default pathMod;

