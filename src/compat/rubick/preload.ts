import {
  RUBICK_COMPATIBILITY_VERSION,
  RUBICK_PRELOAD_API_KEYS,
} from './constants';

type CompatibilityWindow = typeof globalThis & {
  flick?: Record<string, unknown>;
  rubick?: Record<string, unknown>;
  __flickRubickCompatibility?: Readonly<{
    version: number;
    missingApis: string[];
  }>;
};

type ElectronWithLegacyRemote = Record<string, unknown> & {
  remote?: unknown;
};

/** Restore Electron's removed `electron.remote` export for old plugin code. */
export function installRubickElectronRemoteCompatibility(
  electronModule: ElectronWithLegacyRemote,
  remoteModule: unknown
): boolean {
  if (electronModule.remote) return true;
  try {
    Object.defineProperty(electronModule, 'remote', {
      configurable: true,
      enumerable: true,
      value: remoteModule,
    });
    return electronModule.remote === remoteModule;
  } catch {
    return false;
  }
}

/** Install the legacy global only inside third-party plugin sessions. */
export function installRubickPreloadCompatibility(target: CompatibilityWindow) {
  const flick = target.flick;
  if (!flick || typeof flick !== 'object') {
    throw new Error('Rubick compatibility requires the Flick plugin bridge');
  }
  const missingApis = RUBICK_PRELOAD_API_KEYS.filter((key) => !(key in flick));
  target.rubick = flick;
  target.__flickRubickCompatibility = Object.freeze({
    version: RUBICK_COMPATIBILITY_VERSION,
    missingApis: [...missingApis],
  });
  if (missingApis.length > 0) {
    console.warn(
      `[rubick-compat] missing preload APIs: ${missingApis.join(', ')}`
    );
  }
  return target.rubick;
}
