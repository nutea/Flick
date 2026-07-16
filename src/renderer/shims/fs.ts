const fsMod =
  (window as any).require?.('fs') ||
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('fs');

export default fsMod;

