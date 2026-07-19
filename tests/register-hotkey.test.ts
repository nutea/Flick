import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

test('hot-key re-registration does not accumulate renderer listeners', () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), 'src/main/common/registerHotKey.ts'),
    'utf8'
  );
  const initStart = source.indexOf('const init = async () =>');
  const listenerStart = source.indexOf(
    "mainWindow.webContents.on('before-input-event'"
  );

  assert.notEqual(initStart, -1);
  assert.notEqual(listenerStart, -1);
  assert.ok(listenerStart > initStart);
  assert.equal(
    source.match(/mainWindow\.webContents\.on\('before-input-event'/g)?.length,
    1
  );
  assert.match(source, /ipcMain\.on\('re-register',[\s\S]*init\(\)/);
});
