import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const native = require('../packages/flick-native/native');

const expectedFunctions = [
  'captureSelection',
  'getActiveWindow',
  'getClipboardChangeToken',
  'getFolderOpenPath',
  'getFolderOpenPathSync',
  'getForegroundFolderPath',
  'getSelectedFilePaths',
  'getSelectedText',
  'readClipboardFilePaths',
  'sendKeyboardChord',
  'startInputHook',
  'writeClipboardFilePaths',
];

for (const name of expectedFunctions) {
  assert.equal(
    typeof native[name],
    'function',
    `missing native export: ${name}`
  );
}

const [
  activeWindow,
  folder,
  foregroundFolder,
  selectedText,
  selectedFiles,
  selectionSnapshot,
] = await Promise.all([
  native.getActiveWindow(),
  native.getFolderOpenPath(),
  native.getForegroundFolderPath(),
  native.getSelectedText(),
  native.getSelectedFilePaths(),
  native.captureSelection(),
]);

assert.ok(activeWindow === null || typeof activeWindow === 'object');
if (activeWindow) {
  assert.ok(
    activeWindow.title === undefined || typeof activeWindow.title === 'string'
  );
  assert.ok(
    activeWindow.processId === undefined ||
      Number.isInteger(activeWindow.processId)
  );
}
assert.equal(typeof folder, 'string');
assert.equal(typeof foregroundFolder, 'string');
assert.equal(typeof selectedText, 'string');
assert.ok(Array.isArray(selectedFiles));
assert.ok(selectionSnapshot && typeof selectionSnapshot === 'object');
assert.ok(Array.isArray(selectionSnapshot.files));
assert.equal(typeof selectionSnapshot.text, 'string');
assert.equal(typeof selectionSnapshot.foregroundFolder, 'string');

const clipboardToken = native.getClipboardChangeToken();
assert.ok(Number.isInteger(clipboardToken) && clipboardToken >= 0);
assert.ok(Array.isArray(native.readClipboardFilePaths()));

console.log(
  `[native-smoke] verified ${process.platform}/${process.arch}; active window: ${
    activeWindow?.appName || activeWindow?.title || 'unavailable'
  }`
);
