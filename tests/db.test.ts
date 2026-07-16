import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import DB from '../src/core/db';

test('SQLite document lifecycle, conflicts, attachments and snapshots', async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'flick-db-test-'));
  const db = new DB(dir);
  db.init();
  t.after(async () => {
    db.close();
    await rm(dir, { recursive: true, force: true });
  });

  const created = await db.put('test', { _id: 'alpha', data: { value: 1 } });
  assert.equal('ok' in created && created.ok, true);
  if (!('ok' in created) || !created.ok) return;
  assert.match(created.rev, /^1-/);

  const stale = await db.put('test', { _id: 'alpha', data: { value: 2 } });
  assert.equal('error' in stale && stale.status === 409, true);

  const updated = await db.put('test', {
    _id: 'alpha',
    _rev: created.rev,
    data: { value: 2 },
  });
  assert.equal('error' in updated, false);

  const attachment = Buffer.from('snapshot-safe');
  const attached = await db.postAttachment('test', 'alpha', attachment, 'text/plain');
  assert.equal('error' in attached, false);
  assert.deepEqual(await db.getAttachment('test', 'alpha'), attachment);

  const snapshot = await db.exportSnapshot();
  await db.put('test', { _id: 'beta', data: { transient: true } });
  await db.restoreSnapshot(snapshot);

  assert.equal(await db.get('test', 'beta'), null);
  const restored = await db.get('test', 'alpha');
  assert.deepEqual(restored?.data, { value: 2 });
  assert.deepEqual(await db.getAttachment('test', 'alpha'), attachment);

  await assert.rejects(db.restoreSnapshot(Buffer.from('not sqlite')));
  assert.deepEqual((await db.get('test', 'alpha'))?.data, { value: 2 });
});
