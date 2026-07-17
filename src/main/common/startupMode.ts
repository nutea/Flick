export const LOGIN_STARTUP_ARG = '--flick-login-startup';

export type StartupModeInput = {
  platform: NodeJS.Platform;
  argv: string[];
  wasOpenedAtLogin?: boolean;
  forceSilent?: boolean;
};

/**
 * macOS exposes whether this process was launched by the login-item service.
 * Windows does not, so Flick registers a dedicated command-line marker with
 * its login item. The marker also provides a deterministic test hook on every
 * platform without treating a normal manual launch as silent.
 */
export function isSilentLoginStartup({
  platform,
  argv,
  wasOpenedAtLogin,
  forceSilent = false,
}: StartupModeInput): boolean {
  if (forceSilent || argv.includes(LOGIN_STARTUP_ARG)) return true;
  return platform === 'darwin' && wasOpenedAtLogin === true;
}

export function getLoginItemArgs(platform: NodeJS.Platform): string[] {
  return platform === 'win32' ? [LOGIN_STARTUP_ARG] : [];
}
