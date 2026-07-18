import assert from 'node:assert/strict';
import test from 'node:test';
import { toMarketPayload } from '../apps/feature/src/utils/marketPayload';
import { toIpcPayload } from '../src/preload/ipcPayload';

test('feature renderer flattens Vue-style proxies before contextBridge', () => {
  const source = new Proxy(
    {
      name: 'ip-config',
      nested: { isDev: false },
    },
    {}
  );

  const payload = toMarketPayload(source);
  assert.deepEqual(payload, {
    name: 'ip-config',
    nested: { isDev: false },
  });
  assert.notEqual(payload, source);
  assert.notEqual(payload.nested, source.nested);
});

test('feature preload keeps a cloneable IPC payload as a second boundary', () => {
  const source = { name: 'ip-config', nested: { isDev: false } };
  const payload = toIpcPayload(source);

  assert.deepEqual(payload, source);
  assert.notEqual(payload, source);
  assert.notEqual(payload.nested, source.nested);
});
