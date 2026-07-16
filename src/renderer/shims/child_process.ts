const cp =
  (window as any).require?.('child_process') ||
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('child_process');

export const exec = cp.exec;
export const execFile = cp.execFile;
export default cp;

