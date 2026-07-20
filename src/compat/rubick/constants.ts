export const RUBICK_COMPATIBILITY_VERSION = 1;

export const RUBICK_SYSTEM_PLUGIN_ALIASES = Object.freeze({
  'rubick-system-feature': 'flick-system-feature',
  'rubick-system-super-panel': 'flick-system-super-panel',
} as const);

/**
 * Public APIs exposed by the last Rubick preload contract. Keep this list
 * explicit: adding an API is deliberate and removing compatibility later is a
 * single-module change instead of a repository-wide hunt for legacy branches.
 */
export const RUBICK_PRELOAD_API_KEYS = Object.freeze([
  'hooks',
  '__event__',
  'onPluginEnter',
  'onPluginReady',
  'onPluginOut',
  'openPlugin',
  'onShow',
  'onHide',
  'hideMainWindow',
  'showMainWindow',
  'showOpenDialog',
  'showSaveDialog',
  'setExpendHeight',
  'setSubInput',
  'removeSubInput',
  'setSubInputValue',
  'subInputBlur',
  'getPath',
  'showNotification',
  'copyImage',
  'copyText',
  'copyFile',
  'db',
  'dbStorage',
  'isDarkColors',
  'getFeatures',
  'setFeature',
  'screenCapture',
  'removeFeature',
  'shellOpenExternal',
  'isMacOs',
  'isWindows',
  'isLinux',
  'shellOpenPath',
  'getLocalId',
  'removePlugin',
  'shellShowItemInFolder',
  'redirect',
  'shellBeep',
  'getFileIcon',
  'getCopyedFiles',
  'simulateKeyboardTap',
  'getCursorScreenPoint',
  'getDisplayNearestPoint',
  'outPlugin',
  'createBrowserWindow',
] as const);

export type RubickPreloadApiKey = (typeof RUBICK_PRELOAD_API_KEYS)[number];
