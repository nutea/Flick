import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  RUBICK_PRELOAD_API_KEYS,
  canonicalRubickPluginName,
  installRubickElectronRemoteCompatibility,
  installRubickPreloadCompatibility,
  normalizeRubickPluginManifest,
} from '../src/compat/rubick';

test('Rubick system aliases normalize at the compatibility boundary', () => {
  assert.equal(
    canonicalRubickPluginName('rubick-system-feature'),
    'flick-system-feature'
  );
  assert.equal(
    canonicalRubickPluginName('rubick-system-super-panel'),
    'flick-system-super-panel'
  );
  assert.equal(canonicalRubickPluginName('third-party-plugin'), 'third-party-plugin');
});

test('Rubick manifests preserve private fields and normalize launch metadata', () => {
  const manifest = normalizeRubickPluginManifest({
    name: 'legacy-demo',
    privateFlag: true,
    features: [
      {
        explain: 'legacy feature',
        cmds: [
          '  Search  ',
          null,
          { type: 'regex', label: ' Match ' },
          { type: 'file', label: 'Legacy file' },
        ],
      },
    ],
  });

  assert.equal(manifest.name, 'legacy-demo');
  assert.equal(manifest.pluginName, 'legacy-demo');
  assert.equal(manifest.privateFlag, true);
  assert.deepEqual(manifest.features, [
    {
      code: 'legacy-feature-1',
      explain: 'legacy feature',
      cmds: [
        'Search',
        { type: 'regex', label: 'Match' },
        { type: 'files', label: 'Legacy file' },
      ],
    },
  ]);
});

test('Rubick restores the removed Electron remote export in plugin sessions', () => {
  const electronModule: Record<string, unknown> = {};
  const remoteModule = { getGlobal: () => null };

  assert.equal(
    installRubickElectronRemoteCompatibility(electronModule, remoteModule),
    true
  );
  assert.equal(electronModule.remote, remoteModule);
});

test('Rubick preload aliases the audited Flick bridge without copying state', () => {
  const bridge = Object.fromEntries(
    RUBICK_PRELOAD_API_KEYS.map((key) => [key, key === 'hooks' ? {} : () => {}])
  );
  const target: any = { flick: bridge };

  const result = installRubickPreloadCompatibility(target);

  assert.equal(result, bridge);
  assert.equal(target.rubick, target.flick);
  assert.deepEqual(target.__flickRubickCompatibility, {
    version: 1,
    missingApis: [],
  });
});

test('Rubick compatibility is wired through one removable module', () => {
  const root = process.cwd();
  const pluginPreload = fs.readFileSync(
    path.join(root, 'src', 'preload', 'plugin.ts'),
    'utf8'
  );
  const storage = fs.readFileSync(
    path.join(root, 'src', 'common', 'utils', 'localPlugin.ts'),
    'utf8'
  );
  const runner = fs.readFileSync(
    path.join(root, 'src', 'main', 'browsers', 'runner.ts'),
    'utf8'
  );
  const publicPreload = fs.readFileSync(
    path.join(root, 'public', 'preload.js'),
    'utf8'
  );

  assert.match(pluginPreload, /installRubickPreloadCompatibility/);
  assert.match(pluginPreload, /installRubickElectronRemoteCompatibility/);
  assert.match(storage, /normalizeRubickPluginManifest/);
  assert.match(runner, /normalizeRubickRuntimePlugin/);
  assert.doesNotMatch(publicPreload, /window\.rubick\s*=/);
  assert.match(publicPreload, /return nativeTheme\.shouldUseDarkColors/);
});
