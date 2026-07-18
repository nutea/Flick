import assert from 'node:assert/strict';
import test from 'node:test';
import { getSelectedContent } from '../apps/superx/node-src/clipboard-helpers';
import { getActiveWindowFallbackPath } from '../apps/superx/node-src/native';

const emptyImage = {
  isEmpty: () => true,
  toPNG: () => Buffer.alloc(0),
};

const createClipboard = (initialText: string) => {
  let text = initialText;
  return {
    api: {
      has: () => false,
      read: () => '',
      readText: () => text,
      readImage: () => emptyImage,
      readBuffer: () => Buffer.alloc(0),
    },
    setText(value: string) {
      text = value;
    },
  };
};

test('SuperX uses a direct text selection without touching the clipboard', async () => {
  const clipboard = createClipboard('same text');
  let copyCalls = 0;

  const result = await getSelectedContent(
    clipboard.api,
    async () => {
      copyCalls += 1;
    },
    {
      readSelectedText: async () => 'same text',
      getClipboardChangeToken: () => 7,
    }
  );

  assert.equal(result.status, 'selected');
  assert.equal(result.source, 'accessibility');
  assert.equal(result.text, 'same text');
  assert.equal(copyCalls, 0);
});

test('SuperX detects a copy when the clipboard republishes identical text', async () => {
  const clipboard = createClipboard('repeatable');
  let token = 41;

  const capture = () =>
    getSelectedContent(
      clipboard.api,
      async () => {
        token += 1;
      },
      {
        readSelectedText: async () => '',
        getClipboardChangeToken: () => token,
        copyTimeoutMs: 30,
        pollIntervalMs: 4,
      }
    );

  const first = await capture();
  const second = await capture();

  assert.equal(first.status, 'selected');
  assert.equal(first.source, 'clipboard-copy');
  assert.equal(first.text, 'repeatable');
  assert.equal(second.status, 'selected');
  assert.equal(second.source, 'clipboard-copy');
  assert.equal(second.text, 'repeatable');
});

test('SuperX reads an Explorer selection without touching the clipboard', async () => {
  const clipboard = createClipboard('unchanged');
  let copyCalls = 0;

  const result = await getSelectedContent(
    clipboard.api,
    async () => {
      copyCalls += 1;
    },
    {
      readSelectedText: async () => '',
      readSelectedFilePaths: async () => ['D:\\work\\selected.txt'],
      getClipboardChangeToken: () => 12,
    }
  );

  assert.equal(result.status, 'selected');
  assert.equal(result.source, 'shell');
  assert.equal(result.fileUrl, 'D:\\work\\selected.txt');
  assert.equal(copyCalls, 0);
});

test('SuperX waits for an asynchronous copy update', async () => {
  const clipboard = createClipboard('old');
  let token = 10;

  const result = await getSelectedContent(
    clipboard.api,
    async () => {
      setTimeout(() => {
        clipboard.setText('new selection');
        token += 1;
      }, 12);
    },
    {
      readSelectedText: async () => '',
      getClipboardChangeToken: () => token,
      copyTimeoutMs: 80,
      pollIntervalMs: 4,
    }
  );

  assert.equal(result.status, 'selected');
  assert.equal(result.text, 'new selection');
});

test('SuperX ignores the intermediate empty clipboard state', async () => {
  const clipboard = createClipboard('old');
  let token = 20;

  const result = await getSelectedContent(
    clipboard.api,
    async () => {
      setTimeout(() => {
        clipboard.setText('');
        token += 1;
      }, 4);
      setTimeout(() => {
        clipboard.setText('published selection');
        token += 1;
      }, 16);
    },
    {
      readSelectedText: async () => '',
      getClipboardChangeToken: () => token,
      copyTimeoutMs: 80,
      pollIntervalMs: 4,
    }
  );

  assert.equal(result.status, 'selected');
  assert.equal(result.text, 'published selection');
});

test('SuperX reports a timeout when no selection is copied', async () => {
  const clipboard = createClipboard('unchanged');

  const result = await getSelectedContent(clipboard.api, async () => {}, {
    readSelectedText: async () => '',
    getClipboardChangeToken: () => 9,
    copyTimeoutMs: 12,
    pollIntervalMs: 4,
  });

  assert.deepEqual(result, { status: 'timeout', text: '', fileUrl: '' });
});

test('SuperX keeps an active application as the no-selection fallback', async () => {
  assert.equal(
    await getActiveWindowFallbackPath({
      getActiveWindow: async () => ({
        title: 'Notes',
        path: 'C:\\Apps\\Notes.exe',
      }),
      getForegroundFolderPath: async () => '',
    }),
    'C:\\Apps\\Notes.exe'
  );
});

test('SuperX does not turn the desktop shell into a desktop selection', async () => {
  assert.equal(
    await getActiveWindowFallbackPath({
      getActiveWindow: async () => ({
        title: 'Program Manager',
        path: 'C:\\Windows\\explorer.exe',
      }),
      getForegroundFolderPath: async () => '',
    }),
    ''
  );
});

test('SuperX keeps the foreground Explorer folder as the window fallback', async () => {
  assert.equal(
    await getActiveWindowFallbackPath({
      getActiveWindow: async () => ({
        title: 'Downloads',
        path: 'C:\\Windows\\explorer.exe',
      }),
      getForegroundFolderPath: async () => 'C:\\Users\\NUT\\Downloads',
    }),
    'C:\\Users\\NUT\\Downloads'
  );
});
