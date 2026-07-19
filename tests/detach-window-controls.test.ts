import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { matchesInputAccelerator } from '../src/common/utils/inputAccelerator';

const read = (file: string) =>
  fs.readFileSync(path.join(process.cwd(), file), 'utf8');

test('plugin detach shortcut matches the configured accelerator exactly', () => {
  const input = {
    key: 'd',
    code: 'KeyD',
    control: true,
    shift: false,
    alt: false,
    meta: false,
  };
  assert.equal(matchesInputAccelerator(input, 'Ctrl+D', 'darwin'), true);
  assert.equal(
    matchesInputAccelerator({ ...input, shift: true }, 'Ctrl+D', 'darwin'),
    false
  );
  assert.equal(
    matchesInputAccelerator(
      { ...input, control: false, meta: true },
      'CommandOrControl+D',
      'darwin'
    ),
    true
  );
  assert.equal(
    matchesInputAccelerator(input, 'CommandOrControl+D', 'win32'),
    true
  );
});

test('main and plugin renderers both route the detach shortcut', () => {
  const api = read('src/main/common/api.ts');
  assert.match(api, /mainWindow\.webContents\.on\('before-input-event'/);
  assert.match(api, /view\.webContents\.on\('before-input-event'/);
  assert.match(api, /matchesInputAccelerator\(input, this\.separateShortcut\)/);
  assert.match(api, /this\.detachPlugin\(null, window\)\.catch/);
});

test('detached plugin devtools state follows actual lifecycle events', () => {
  const detach = read('src/main/browsers/detach.ts');
  assert.match(detach, /webContents\.on\('devtools-opened'/);
  assert.match(detach, /webContents\.on\('devtools-closed'/);
  assert.match(detach, /send\('detach:devtools-state', opened\)/);
  assert.match(detach, /const shouldOpen = !contents\.isDevToolsOpened\(\)/);
});
