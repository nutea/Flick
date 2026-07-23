import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  DEFAULT_MARKET_SOURCE_CONFIG,
  resolveMarketSourceConfig,
} from '../apps/feature/src/assets/marketConfig';

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

test('first-run plugin market uses the same valid source as settings', () => {
  assert.deepEqual(resolveMarketSourceConfig(undefined), {
    register: 'https://registry.npmmirror.com',
    database: 'https://gitee.com/monkeyWang/rubickdatabase/raw/master',
    access_token: '',
  });

  const request = read('apps/feature/src/assets/request/index.ts');
  const settings = read('apps/feature/src/views/settings/localhost.vue');
  assert.match(request, /resolveMarketSourceConfig/);
  assert.match(settings, /resolveMarketSourceConfig/);
  assert.doesNotMatch(request, /flickdatabase/);
});

test('partial market configuration falls back without discarding overrides', () => {
  assert.deepEqual(resolveMarketSourceConfig({ database: '  ' }), {
    ...DEFAULT_MARKET_SOURCE_CONFIG,
  });
  assert.deepEqual(
    resolveMarketSourceConfig({
      register: ' https://registry.example.com/ ',
      database: ' https://market.example.com/ ',
      access_token: ' token ',
    }),
    {
      register: 'https://registry.example.com/',
      database: 'https://market.example.com/',
      access_token: 'token',
    }
  );
});

test('market source connection test uses the main-process network path', () => {
  const settings = read('apps/feature/src/views/settings/localhost.vue');
  const preload = read('src/preload/feature.ts');
  const bridge = read('src/main/common/featureBridgeIpc.ts');
  const runner = read('src/main/browsers/runner.ts');

  assert.match(settings, /window\.market\.testSourceConnection/);
  assert.doesNotMatch(settings, /fetch\(/);
  assert.match(preload, /feature:test-source-connection/);
  assert.match(bridge, /net\.fetch/);
  assert.match(bridge, /AbortSignal\.timeout\(8000\)/);
  assert.match(bridge, /\['http:', 'https:'\]/);
  assert.match(runner, /hasCorsHeader/);
});

test('plugin operations wait for registry initialization and use isolated managers', () => {
  const source = read('src/common/utils/localPlugin.ts');
  assert.match(source, /registryPromise/);
  assert.match(source, /ensurePluginWorkspace\(pluginName\)/);
  assert.match(source, /new PluginHandler\(\{/);
  assert.doesNotMatch(source, /Plugin manager is unavailable/);
  assert.equal(source.match(/await getPluginInstance\(/g)?.length, 3);
});
