import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

test('plugin view slot is released before deferred webContents destruction', () => {
  const source = readFileSync(
    path.join(process.cwd(), 'src/main/browsers/runner.ts'),
    'utf8'
  );
  const block = source.slice(
    source.indexOf('const removeView ='),
    source.indexOf('const getView =')
  );
  const deferredDestroy = block.indexOf('setTimeout(() =>');

  assert.ok(deferredDestroy > 0);
  assert.ok(block.indexOf('window.setBrowserView(null)') < deferredDestroy);
  assert.ok(block.indexOf('view = undefined') < deferredDestroy);
  assert.ok(
    block.indexOf('snapshotView.webContents.destroy()') > deferredDestroy
  );
});

test('direct plugin switching suppresses the old view homepage reset', () => {
  const source = readFileSync(
    path.join(process.cwd(), 'src/main/common/api.ts'),
    'utf8'
  );
  const block = source.slice(
    source.indexOf('public async openPlugin'),
    source.indexOf('private redirectMainLaunchToSingletonDetach')
  );

  assert.match(block, /runnerInstance\.removeView\(window, false\)/);
  assert.ok(
    block.indexOf('runnerInstance.removeView(window, false)') <
      block.indexOf('runnerInstance.init(plugin, window)')
  );
});

test('a rejected plugin entry restores the launcher instead of leaving a header-only window', () => {
  const api = readFileSync(
    path.join(process.cwd(), 'src/main/common/api.ts'),
    'utf8'
  );
  const app = readFileSync(
    path.join(process.cwd(), 'src/renderer/App.vue'),
    'utf8'
  );
  const block = api.slice(
    api.indexOf('public async openPlugin'),
    api.indexOf('private redirectMainLaunchToSingletonDetach')
  );

  assert.match(
    block,
    /catch \(error\)[\s\S]*window\.initFlick\(\); window\.refreshLauncherHeight/
  );
  assert.match(app, /window\.refreshLauncherHeight = \(\) =>/);
  assert.match(app, /lastCommittedLauncherHeight = 0/);
});

test('Backspace waits for plugin disposal before exposing recent items again', () => {
  const preload = readFileSync(
    path.join(process.cwd(), 'src/preload/main.ts'),
    'utf8'
  );
  const search = readFileSync(
    path.join(process.cwd(), 'src/renderer/components/search.vue'),
    'utf8'
  );
  const closeBlock = search.slice(
    search.indexOf('const closeTag ='),
    search.indexOf('const showSeparate =')
  );

  assert.match(preload, /removePlugin: \(\) => invoke\('removePlugin'\)/);
  assert.match(
    preload,
    /openPlugin: \(plugin: unknown\) => invoke\('loadPlugin'/
  );
  assert.ok(
    closeBlock.indexOf('await window.flick.removePlugin()') <
      closeBlock.indexOf("emit('changeSelect', {})")
  );
  assert.match(closeBlock, /if \(closingPlugin\) return/);
});

test('singleton reuse requires a live BrowserView still attached to the main window', () => {
  const source = readFileSync(
    path.join(process.cwd(), 'src/main/common/api.ts'),
    'utf8'
  );
  const block = source.slice(
    source.indexOf('private isSingletonAlreadyInMainWindow'),
    source.indexOf('public async openPlugin')
  );

  assert.match(block, /runnerInstance\.getView\(\)/);
  assert.match(block, /currentView\.webContents\.isDestroyed\(\)/);
  assert.match(block, /window\.getBrowserView\(\) !== currentView/);
});
