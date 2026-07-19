import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';

const root = process.cwd();

function sourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(target);
    return /\.(?:ts|vue)$/.test(entry.name) ? [target] : [];
  });
}

test('main renderer consumes typed capabilities instead of Node or local paths', () => {
  const rendererRoot = path.join(root, 'src', 'renderer');
  const sources = sourceFiles(rendererRoot)
    .map((file) => fs.readFileSync(file, 'utf8'))
    .join('\n');

  assert.doesNotMatch(sources, /window\.require|@electron\/remote/);
  assert.doesNotMatch(
    sources,
    /from\s+['"](?:node:)?(?:fs|path|os|electron)['"]/
  );
  assert.doesNotMatch(sources, /\b__static\b/);
  assert.doesNotMatch(sources, /toImageProtocolUrl|imageProtocolSource/);
});

test('main window exposes a typed isolated bridge', () => {
  const browser = fs.readFileSync(
    path.join(root, 'src', 'main', 'browsers', 'main.ts'),
    'utf8'
  );
  const preload = fs.readFileSync(
    path.join(root, 'src', 'preload', 'main.ts'),
    'utf8'
  );
  const contract = fs.readFileSync(
    path.join(root, 'src', 'common', 'types', 'mainBridge.ts'),
    'utf8'
  );

  assert.match(browser, /contextIsolation:\s*true/);
  assert.match(browser, /nodeIntegration:\s*false/);
  assert.match(preload, /const flick:\s*MainFlickBridge/);
  assert.match(preload, /contextBridge\.exposeInMainWorld\('flick', flick\)/);
  assert.match(contract, /export interface MainFlickBridge/);
});

test('legacy plugins use a separate compatibility preload', () => {
  const runner = fs.readFileSync(
    path.join(root, 'src', 'main', 'browsers', 'runner.ts'),
    'utf8'
  );
  const pluginPreload = fs.readFileSync(
    path.join(root, 'src', 'preload', 'plugin.ts'),
    'utf8'
  );
  assert.match(runner, /dist', 'preload', 'plugin\.js'/);
  assert.match(
    pluginPreload,
    /require\(path\.join\(staticDir, 'preload\.js'\)\)/
  );
  assert.doesNotMatch(pluginPreload, /contextBridge/);
});

test('plugin views establish layout before loading and secure feature skips legacy remote', () => {
  const runner = fs.readFileSync(
    path.join(root, 'src', 'main', 'browsers', 'runner.ts'),
    'utf8'
  );
  assert.match(
    runner,
    /window\.setBrowserView\(view\);\s*windowGeometryController\.setPluginViewActive\(window, true\);\s*layoutView\(window, view, plugin\.pluginSetting\);\s*secureWebContentsNavigation/
  );
  assert.match(
    runner,
    /runtimeName !== 'flick-system-feature'[\s\S]*@electron\/remote\/main/
  );
});

test('plugin presentation owns renderer URLs and validates plugin roots', () => {
  const presentation = fs.readFileSync(
    path.join(root, 'src', 'main', 'common', 'pluginPresentation.ts'),
    'utf8'
  );
  const featureBridge = fs.readFileSync(
    path.join(root, 'src', 'main', 'common', 'featureBridgeIpc.ts'),
    'utf8'
  );

  assert.match(presentation, /path\.relative/);
  assert.match(presentation, /fs\.statSync/);
  assert.match(presentation, /logoUrl/);
  assert.match(presentation, /pathToFileURL/);
  assert.match(featureBridge, /presentPlugins/);
});

test('image protocol is installed for the default and every plugin session', () => {
  const service = fs.readFileSync(
    path.join(root, 'src', 'main', 'common', 'imageProtocolService.ts'),
    'utf8'
  );
  const entry = fs.readFileSync(
    path.join(root, 'src', 'main', 'index.ts'),
    'utf8'
  );
  const runner = fs.readFileSync(
    path.join(root, 'src', 'main', 'browsers', 'runner.ts'),
    'utf8'
  );
  const mainBrowser = fs.readFileSync(
    path.join(root, 'src', 'main', 'browsers', 'main.ts'),
    'utf8'
  );

  assert.match(service, /registerSchemesAsPrivileged/);
  assert.match(service, /targetSession\.protocol\.handle/);
  assert.match(service, /await app\.getFileIcon/);
  assert.match(service, /icon\.toPNG\(\)/);
  assert.match(service, /WeakSet<Session>/);
  assert.match(entry, /installImageProtocol\(session\.defaultSession\)/);
  assert.match(runner, /installImageProtocol\(ses\)/);
  assert.doesNotMatch(mainBrowser, /interceptFileProtocol/);
});

test('Rubick compatibility getFileIcon remains synchronous for img src', () => {
  const preload = fs.readFileSync(
    path.join(root, 'public', 'preload.js'),
    'utf8'
  );

  assert.match(preload, /getFileIcon:\s*\(path\)\s*=>\s*toFileIconUrl\(path\)/);
  assert.doesNotMatch(
    preload,
    /getFileIcon:\s*\(path\)\s*=>\s*ipcInvoke\('getFileIcon'/
  );
});

test('feature plugin images consume normalized logoUrl only', () => {
  const featureRoot = path.join(root, 'apps', 'feature', 'src');
  const sources = sourceFiles(featureRoot)
    .map((file) => fs.readFileSync(file, 'utf8'))
    .join('\n');
  const presentation = fs.readFileSync(
    path.join(featureRoot, 'utils', 'pluginPresentation.ts'),
    'utf8'
  );

  assert.match(presentation, /normalizePluginPresentations/);
  assert.doesNotMatch(sources, /logoUrl\s*\|\|\s*[^\n]*\.logo/);
});

test('feature settings use a self-contained default avatar and bounded theme separators', () => {
  const configPresentation = fs.readFileSync(
    path.join(root, 'src', 'main', 'common', 'configPresentation.ts'),
    'utf8'
  );
  const userInfo = fs.readFileSync(
    path.join(
      root,
      'apps',
      'feature',
      'src',
      'views',
      'settings',
      'user-info.vue'
    ),
    'utf8'
  );

  assert.match(configPresentation, /data:image\/png;base64/);
  assert.match(userInfo, /class="theme-selector"/);
  assert.match(
    userInfo,
    /\.theme-selector[\s\S]*overflow:\s*hidden;[\s\S]*border-radius:\s*2px;/
  );
  assert.doesNotMatch(userInfo, /\.theme-selector[\s\S]*::before/);
});

test('recent items use one interaction modality for selection styling', () => {
  const app = fs.readFileSync(
    path.join(root, 'src', 'renderer', 'App.vue'),
    'utf8'
  );
  const result = fs.readFileSync(
    path.join(root, 'src', 'renderer', 'components', 'result.vue'),
    'utf8'
  );

  assert.match(app, /keyboardNavigation\.value = true/);
  assert.match(app, /keyboardNavigation\.value = false/);
  assert.match(result, /keyboard-navigation/);
  assert.match(result, /\.history-item:hover:not\(\.active\)/);
  assert.match(result, /@mousemove="emit\('selectIndex', index\)"/);
});
