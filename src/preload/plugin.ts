// Compatibility preload for third-party plugin BrowserViews. Keep this entry
// separate from the context-isolated main-window bridge.
if (process.isMainFrame && globalThis.location?.protocol !== 'devtools:') {
  const path = require('path') as typeof import('path');
  const staticDir = process.env.ELECTRON_RENDERER_URL
    ? path.join(process.cwd(), 'public')
    : path.join(process.resourcesPath, 'app.asar', 'public');
  (globalThis as typeof globalThis & { __static: string }).__static = staticDir;
  require(path.join(staticDir, 'preload.js'));
}
