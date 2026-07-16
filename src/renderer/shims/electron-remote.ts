const remoteMod =
  (window as any).require?.('@electron/remote') ||
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('@electron/remote');

export const getGlobal = remoteMod.getGlobal;
export const BrowserWindow = remoteMod.BrowserWindow;
export const nativeTheme = remoteMod.nativeTheme;
export const screen = remoteMod.screen;
export const app = remoteMod.app;
export default remoteMod;

