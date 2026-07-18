import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { resolveDetachInputState } from '../src/common/utils/detachInput';

const request = (overrides: Record<string, unknown> = {}) => ({
  requested: false,
  value: '',
  placeholder: '',
  focus: false,
  role: 'search',
  ...overrides,
});

test('detach input visibility is driven by capability and explicit request, not content', () => {
  const state = resolveDetachInputState({
    capability: undefined,
    policy: 'auto',
    request: request({ value: '{"sid":"launch-context"}' }),
  });
  assert.equal(state.capability, 'optional');
  assert.equal(state.visible, false);
  assert.equal(state.value, '{"sid":"launch-context"}');
});

test('an optional plugin can explicitly request an empty detach input', () => {
  const state = resolveDetachInputState({
    capability: 'optional',
    policy: 'auto',
    request: request({ requested: true, placeholder: '' }),
  });
  assert.equal(state.visible, true);
});

test('none and required capabilities override optional input policy', () => {
  const hidden = resolveDetachInputState({
    capability: 'none',
    policy: 'always',
    request: request({ requested: true, focus: true }),
  });
  assert.equal(hidden.visible, false);
  assert.equal(hidden.focus, false);

  const visible = resolveDetachInputState({
    capability: 'required',
    policy: 'auto',
    request: request(),
  });
  assert.equal(visible.visible, true);
});

test('detach flow does not merge plugin payload into title-bar input state', () => {
  const apiSource = readFileSync(
    path.join(process.cwd(), 'src/main/common/api.ts'),
    'utf8'
  );
  const detachBlock = apiSource.slice(
    apiSource.indexOf('public detachPlugin'),
    apiSource.indexOf('public detachInputChange')
  );
  assert.match(detachBlock, /resolveDetachInputState/);
  assert.doesNotMatch(detachBlock, /ext\.payload|mergeMainInputWithPluginExt/);
  assert.doesNotMatch(detachBlock, /subInput,/);
});

test('detach input has an explicit non-draggable visual boundary', () => {
  const shellSource = readFileSync(
    path.join(process.cwd(), 'apps/detach/src/App.vue'),
    'utf8'
  );
  assert.match(shellSource, /class="detach-input-frame"/);
  assert.match(
    shellSource,
    /\.detach-input-frame\s*\{[\s\S]*?border:\s*1px solid[\s\S]*?-webkit-app-region:\s*no-drag/
  );
  assert.match(shellSource, /\.detach-input-frame:focus-within/);
});
