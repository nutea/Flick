const path = window.require('path');

const appPath = window.flick.getPath('userData');

const PLUGIN_INSTALL_DIR = path.join(appPath, './flick-plugins-new');
const PLUGIN_HISTORY = 'flick-plugin-history';

export { PLUGIN_INSTALL_DIR, PLUGIN_HISTORY };
