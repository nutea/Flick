import path from 'path';

const staticDir = process.env.ELECTRON_RENDERER_URL
  ? path.join(process.cwd(), 'public')
  : path.join(process.resourcesPath, 'app.asar', 'public');

globalThis.__static = staticDir;

// Keep legacy preload API surface for minimal-risk migration.
// eslint-disable-next-line @typescript-eslint/no-var-requires
require(path.join(staticDir, 'preload.js'));
