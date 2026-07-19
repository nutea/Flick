import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import test from 'node:test';
import { normalizeCaptureRegion } from '../src/core/screen-capture/region';

const root = process.cwd();

test('screenshot regions support negative display coordinates', () => {
  assert.deepEqual(
    normalizeCaptureRegion(
      { x: -1810, y: 44, width: 640, height: 360 },
      { x: -1920, y: 0, width: 1920, height: 1080 }
    ),
    { x: -1810, y: 44, width: 640, height: 360 }
  );
});

test('untrusted screenshot selections are clipped to their source display', () => {
  assert.deepEqual(
    normalizeCaptureRegion(
      { x: 900, y: 650, width: 500, height: 400 },
      { x: 0, y: 0, width: 1280, height: 720 }
    ),
    { x: 900, y: 650, width: 380, height: 70 }
  );
  assert.equal(
    normalizeCaptureRegion(
      { x: 1, y: 1, width: Number.NaN, height: 20 },
      { x: 0, y: 0, width: 1280, height: 720 }
    ),
    null
  );
});

test('screen capture uses the packaged native addon without an executable helper', () => {
  const captureSource = fs.readFileSync(
    path.join(root, 'src', 'core', 'screen-capture', 'index.ts'),
    'utf8'
  );
  const rustSource = fs.readFileSync(
    path.join(root, 'packages', 'flick-native', 'native', 'src', 'lib.rs'),
    'utf8'
  );

  assert.equal(
    fs.existsSync(path.join(root, 'public', 'bin', 'ScreenCapture.exe')),
    false
  );
  assert.doesNotMatch(captureSource, /child_process|execFile|screencapture/);
  assert.doesNotMatch(captureSource, /clipboard\.writeText\(['"]{2}\)/);
  assert.match(captureSource, /nativeRuntime\.screen\.captureRegion/);
  assert.match(captureSource, /clipboard\.writeImage/);
  assert.match(rustSource, /js_name = "captureScreenRegion"/);
});

test('screenshot overlay is isolated and offers explicit complete and cancel paths', () => {
  const browserSource = fs.readFileSync(
    path.join(root, 'src', 'core', 'screen-capture', 'index.ts'),
    'utf8'
  );
  const preloadSource = fs.readFileSync(
    path.join(root, 'src', 'preload', 'screenCapture.ts'),
    'utf8'
  );
  const overlaySource = fs.readFileSync(
    path.join(root, 'public', 'screen-capture', 'overlay.js'),
    'utf8'
  );

  assert.match(browserSource, /contextIsolation:\s*true/);
  assert.match(browserSource, /nodeIntegration:\s*false/);
  assert.match(browserSource, /getAllDisplays\(\)/);
  assert.match(preloadSource, /contextBridge\.exposeInMainWorld/);
  assert.match(overlaySource, /bridge\.complete/);
  assert.match(overlaySource, /bridge\.cancel/);
  assert.match(overlaySource, /event\.key === 'Escape'/);
});
