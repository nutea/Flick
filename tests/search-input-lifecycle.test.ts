import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  captureSearchLaunchSnapshot,
  resolveMainInputInfo,
} from '../src/renderer/plugins-manager/searchInputLifecycle';

const currentState = (overrides: Record<string, unknown> = {}) => ({
  searchValue: '',
  placeholder: '',
  detachInputRequested: false,
  detachInputFocus: false,
  detachInputRole: 'search' as const,
  ...overrides,
});

test('a plugin launch snapshot carries user text but not the previous plugin input contract', () => {
  const snapshot = captureSearchLaunchSnapshot('{"selected":true}');
  const info = resolveMainInputInfo(
    currentState({
      placeholder: '',
      detachInputRequested: false,
    }),
    snapshot
  );

  assert.deepEqual(snapshot, { value: '{"selected":true}' });
  assert.equal(info.value, '{"selected":true}');
  assert.equal(info.placeholder, '');
  assert.equal(info.requested, false);
});

test('the active plugin input contract overrides no fields from a launch snapshot', () => {
  const info = resolveMainInputInfo(
    currentState({
      searchValue: 'current',
      placeholder: 'JSON filter',
      detachInputRequested: true,
      detachInputFocus: true,
      detachInputRole: 'filter',
    }),
    { value: 'launch text' }
  );

  assert.deepEqual(info, {
    value: 'current',
    placeholder: 'JSON filter',
    requested: true,
    focus: true,
    role: 'filter',
  });
});

test('every plugin activation resets the previous plugin input declaration', () => {
  const managerSource = readFileSync(
    path.join(process.cwd(), 'src/renderer/plugins-manager/index.ts'),
    'utf8'
  );
  const loadPluginBlock = managerSource.slice(
    managerSource.indexOf('const loadPlugin ='),
    managerSource.indexOf('const openPlugin =')
  );
  const setCurrentPluginBlock = managerSource.slice(
    managerSource.indexOf('window.setCurrentPlugin ='),
    managerSource.indexOf('window.initFlick =')
  );

  assert.match(loadPluginBlock, /window\.removeSubInput\(\)/);
  assert.match(setCurrentPluginBlock, /window\.removeSubInput\(\)/);
});

test('main-renderer plugin launches never await JavaScript on their blocked sender', () => {
  const apiSource = readFileSync(
    path.join(process.cwd(), 'src/main/common/api.ts'),
    'utf8'
  );
  const loadPluginBlock = apiSource.slice(
    apiSource.indexOf('public async loadPlugin'),
    apiSource.indexOf('public tryRedirectSingletonDetach')
  );

  assert.match(
    loadPluginBlock,
    /openedFromMainRenderer\s*=\s*event\?\.sender\.id\s*===\s*window\.webContents\.id/
  );
  assert.match(
    loadPluginBlock,
    /if \(!openedFromMainRenderer\)\s*\{[\s\S]*?await window\.webContents\.executeJavaScript/
  );
});

test('homepage space input never triggers the selected result', () => {
  const searchSource = readFileSync(
    path.join(process.cwd(), 'src/renderer/components/search.vue'),
    'utf8'
  );
  const settingsSource = readFileSync(
    path.join(process.cwd(), 'apps/feature/src/views/settings/index.vue'),
    'utf8'
  );

  assert.doesNotMatch(searchSource, /['"] ['"]:\s*['"]space['"]/);
  assert.doesNotMatch(searchSource, /case ['"]space['"]/);
  assert.doesNotMatch(settingsSource, /common\.space|spaceExec/);
});

test('empty search results never fall back to a recent plugin on Enter', () => {
  const appSource = readFileSync(
    path.join(process.cwd(), 'src/renderer/App.vue'),
    'utf8'
  );
  const choosePluginBlock = appSource.slice(
    appSource.indexOf('const choosePlugin ='),
    appSource.indexOf('const clearSearchValue =')
  );

  assert.match(choosePluginBlock, /recentPluginNavigationEnabled\.value/);
  assert.doesNotMatch(
    choosePluginBlock,
    /plugin \|\| visibleHistory\.value\[currentSelect\.value\]/
  );
});

test('keyboard result navigation scrolls the selected item into view', () => {
  const resultSource = readFileSync(
    path.join(process.cwd(), 'src/renderer/components/result.vue'),
    'utf8'
  );

  assert.match(resultSource, /:data-result-index="index"/);
  assert.match(resultSource, /props\.keyboardNavigation/);
  assert.match(resultSource, /container\.scrollTop \+=/);
});
