/**
 * 面板窗口开启 nodeIntegration，可直接 require。
 * 仅在此模块内使用，便于类型收口。
 */
export function getElectron() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('electron') as typeof import('electron');
}

export function getOs() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('os') as typeof import('os');
}

export function getPath() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('path') as typeof import('path');
}

export function getChildProcess() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('child_process') as typeof import('child_process');
}
