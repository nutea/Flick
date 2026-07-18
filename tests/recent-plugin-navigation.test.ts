import assert from 'node:assert/strict';
import test from 'node:test';
import {
  recentPluginItemKey,
  resolveRecentPluginNavigation,
} from '../src/renderer/utils/recentPluginNavigation';

const resolve = (overrides: Record<string, unknown> = {}) =>
  resolveRecentPluginNavigation({
    key: 'ArrowRight',
    value: '',
    enabled: true,
    ...overrides,
  });

test('empty home input uses horizontal arrows to navigate recent plugins', () => {
  assert.equal(resolve({ key: 'ArrowLeft' }), -1);
  assert.equal(resolve({ key: 'ArrowRight' }), 1);
});

test('horizontal arrows retain native cursor behavior when input has content', () => {
  assert.equal(resolve({ value: 'json' }), 0);
  assert.equal(resolve({ value: ' ' }), 0);
});

test('recent navigation does not claim selection, word, or IME key events', () => {
  assert.equal(resolve({ shiftKey: true }), 0);
  assert.equal(resolve({ ctrlKey: true }), 0);
  assert.equal(resolve({ altKey: true }), 0);
  assert.equal(resolve({ metaKey: true }), 0);
  assert.equal(resolve({ isComposing: true }), 0);
});

test('recent navigation only runs while the parent reports a visible history view', () => {
  assert.equal(resolve({ enabled: false }), 0);
  assert.equal(resolve({ key: 'ArrowUp' }), 0);
});

test('commands from the same plugin always receive distinct Vue keys', () => {
  const plugin = { originName: 'search-plugin' };
  const first = recentPluginItemKey(
    { ...plugin, cmd: { label: 'Search files' }, feature: { code: 'files' } },
    0
  );
  const second = recentPluginItemKey(
    { ...plugin, cmd: { label: 'Search text' }, feature: { code: 'text' } },
    1
  );

  assert.notEqual(first, second);
  assert.match(first, /search-plugin::files::Search files::0/);
});
