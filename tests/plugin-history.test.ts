import assert from 'node:assert/strict';
import test from 'node:test';
import {
  rehydrateRecentPlugin,
  recentPluginTaskKey,
  sanitizeRecentPlugin,
  sanitizeRecentPluginHistory,
} from '../src/renderer/plugins-manager/pluginHistory';

test('recent plugins never persist runtime entry locations', () => {
  const result = sanitizeRecentPlugin({
    name: 'demo-plugin',
    cmd: 'Demo',
    indexPath: 'file:///old/checkout/index.html',
    indexUrl: 'file:///old/install/index.html',
    tplPath: 'file:///old/template/index.html',
    development: 'http://localhost:9999',
  });

  assert.deepEqual(result, { name: 'demo-plugin', cmd: 'Demo' });
});

test('recent history deduplicates legacy and canonical records for the same task', () => {
  const history = sanitizeRecentPluginHistory([
    {
      name: 'Search',
      originName: 'search-plugin',
      cmd: 'Search',
      feature: { code: 'find' },
    },
    {
      name: 'search-plugin',
      originName: 'search-plugin',
      cmd: 'Search',
      feature: { code: 'find' },
      pin: true,
    },
  ]);

  assert.equal(history.length, 1);
  assert.equal(history[0].name, 'Search');
  assert.equal(history[0].pin, true);
});

test('recent task identity keeps different commands from one plugin distinct', () => {
  const plugin = { originName: 'search-plugin', feature: { code: 'find' } };
  assert.notEqual(
    recentPluginTaskKey({ ...plugin, cmd: 'Search' }),
    recentPluginTaskKey({ ...plugin, cmd: 'Find' })
  );
});

test('recent plugins use the current installed manifest while retaining the command', () => {
  const result = rehydrateRecentPlugin(
    {
      name: 'old-name',
      originName: 'demo-plugin',
      cmd: { label: 'Format JSON', type: 'text' },
      feature: { code: 'format' },
      pin: true,
      main: 'old.html',
      tplPath: 'file:///old/template/index.html',
    },
    {
      name: 'demo-plugin',
      main: 'index.html',
      preload: 'preload.js',
      pluginType: 'ui',
      indexUrl: 'file:///current/install/index.html',
    }
  );

  assert.equal(result.name, 'demo-plugin');
  assert.equal(result.originName, 'demo-plugin');
  assert.equal(result.main, 'index.html');
  assert.equal(result.preload, 'preload.js');
  assert.deepEqual(result.cmd, { label: 'Format JSON', type: 'text' });
  assert.deepEqual(result.feature, { code: 'format' });
  assert.equal(result.pin, true);
  assert.equal('indexUrl' in result, false);
  assert.equal('tplPath' in result, false);
});
