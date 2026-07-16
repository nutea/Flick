const electronMod =
  (window as any).require?.('electron') ||
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('electron');

export const ipcRenderer = electronMod.ipcRenderer;
export const nativeImage = electronMod.nativeImage;
export const shell = electronMod.shell;
export const clipboard = electronMod.clipboard;
export const screen = electronMod.screen;
export default electronMod;

