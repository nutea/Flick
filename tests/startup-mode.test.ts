import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getLoginItemArgs,
  isSilentLoginStartup,
  LOGIN_STARTUP_ARG,
} from '../src/main/common/startupMode';

test('macOS login launch is silent but a manual launch is not', () => {
  assert.equal(
    isSilentLoginStartup({
      platform: 'darwin',
      argv: ['/Applications/flick.app/Contents/MacOS/flick'],
      wasOpenedAtLogin: true,
    }),
    true
  );
  assert.equal(
    isSilentLoginStartup({
      platform: 'darwin',
      argv: ['/Applications/flick.app/Contents/MacOS/flick'],
      wasOpenedAtLogin: false,
    }),
    false
  );
});

test('Windows login item uses an explicit silent-start marker', () => {
  assert.deepEqual(getLoginItemArgs('win32'), [LOGIN_STARTUP_ARG]);
  assert.equal(
    isSilentLoginStartup({
      platform: 'win32',
      argv: ['C:\\Program Files\\Flick\\flick.exe', LOGIN_STARTUP_ARG],
    }),
    true
  );
  assert.equal(
    isSilentLoginStartup({
      platform: 'win32',
      argv: ['C:\\Program Files\\Flick\\flick.exe'],
    }),
    false
  );
});

test('forced silent mode supports deterministic startup verification', () => {
  assert.equal(
    isSilentLoginStartup({
      platform: 'linux',
      argv: ['/opt/flick/flick'],
      forceSilent: true,
    }),
    true
  );
});
