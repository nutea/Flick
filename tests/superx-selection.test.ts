import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getSelectedContent,
  isDirectorySelection,
  parseMacClipboardFilePaths,
} from '../apps/superx/node-src/clipboard-helpers';
import {
  getActiveWindowFallbackPath,
  getActiveWindowSnapshot,
} from '../apps/superx/node-src/native';
import { normalizeKeyboardShortcut } from '../apps/superx/node-src/shortcut';
import { acceleratorKeyFromEvent } from '../apps/feature/src/utils/keyboardAccelerator';

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

test('SuperX bounds a stalled platform file-selection provider', async () => {
  const clipboard = createClipboard('old');
  let token = 1;
  const result = await getSelectedContent(
    clipboard.api,
    async () => {
      clipboard.setText('copied after file lookup timeout');
      token += 1;
    },
    {
      readSelectedText: async () => '',
      readSelectedFilePaths: () => new Promise<string[]>(() => {}),
      directFileReadTimeoutMs: 8,
      getClipboardChangeToken: () => token,
      copyTimeoutMs: 30,
      pollIntervalMs: 4,
    }
  );
  assert.equal(result.status, 'selected');
  assert.equal(result.text, 'copied after file lookup timeout');
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

test('SuperX keeps the foreground Finder folder instead of Finder.app', async () => {
  assert.equal(
    await getActiveWindowFallbackPath({
      getActiveWindow: async () => ({
        title: 'Desktop',
        path: '/System/Library/CoreServices/Finder.app',
        appName: 'Finder',
      }),
      getForegroundFolderPath: async () => '/Users/NUT/Desktop/',
    }),
    '/Users/NUT/Desktop/'
  );
});

test('SuperX uses the trigger-time window snapshot for Finder fallback', async () => {
  let activeReads = 0;
  const runtime = {
    getActiveWindow: async () => {
      activeReads += 1;
      return {
        title: 'Wrong later window',
        path: '/Applications/Other.app',
      };
    },
    getForegroundFolderPath: async () => '/Users/NUT/Project/',
  };
  const result = await getActiveWindowFallbackPath(runtime, {
    title: 'Project',
    path: '/System/Library/CoreServices/Finder.app',
    appName: 'Finder',
  });
  assert.equal(result, '/Users/NUT/Project/');
  assert.equal(activeReads, 0);
});

test('SuperX bounds a stalled Finder folder lookup', async () => {
  const result = await getActiveWindowFallbackPath(
    {
      getActiveWindow: async () => null,
      getForegroundFolderPath: () => new Promise<string>(() => {}),
    },
    {
      title: 'Finder',
      path: '/System/Library/CoreServices/Finder.app',
    },
    8
  );
  assert.equal(result, '');
});

test('SuperX bounds a stalled active-window snapshot', async () => {
  const result = await getActiveWindowSnapshot(
    { getActiveWindow: () => new Promise<null>(() => {}) },
    8
  );
  assert.equal(result, null);
});

test('SuperX never uses Finder.app when Finder folder lookup fails', async () => {
  assert.equal(
    await getActiveWindowFallbackPath({
      getActiveWindow: async () => ({
        title: 'Finder',
        path: '/System/Library/CoreServices/Finder.app/Contents/MacOS/Finder',
      }),
      getForegroundFolderPath: async () => '',
    }),
    ''
  );
});

test('SuperX keeps the foreground Linux file-manager folder', async () => {
  assert.equal(
    await getActiveWindowFallbackPath(
      {
        getActiveWindow: async () => ({
          title: 'Downloads',
          path: '/usr/bin/nautilus',
          appName: 'org.gnome.Nautilus.desktop',
        }),
        getForegroundFolderPath: async () => '/home/flick/Downloads',
      },
      undefined,
      500,
      'linux'
    ),
    '/home/flick/Downloads'
  );
});

test('SuperX never exposes a Linux file-manager executable as a selection', async () => {
  assert.equal(
    await getActiveWindowFallbackPath(
      {
        getActiveWindow: async () => ({
          title: 'Home',
          path: '/usr/bin/dolphin',
          appName: 'dolphin',
        }),
        getForegroundFolderPath: async () => '',
      },
      undefined,
      500,
      'linux'
    ),
    ''
  );
});

test('SuperX does not classify macOS application bundles as folders', () => {
  assert.equal(
    isDirectorySelection('/Applications/Notes.app', true, 'darwin'),
    false
  );
  assert.equal(
    isDirectorySelection('/Users/NUT/Desktop', true, 'darwin'),
    true
  );
});

test('SuperX decodes multiple macOS clipboard file paths', () => {
  assert.deepEqual(
    parseMacClipboardFilePaths(
      '<array><string>file:///Users/NUT/My%20File.txt</string><string>/Users/NUT/A&amp;B.md</string></array>'
    ),
    ['/Users/NUT/My File.txt', '/Users/NUT/A&B.md']
  );
  assert.deepEqual(
    parseMacClipboardFilePaths(
      '<array><string>/Users/NUT/Literal&amp;lt;name</string></array>'
    ),
    ['/Users/NUT/Literal&lt;name']
  );
});

test('SuperX captures the physical key for macOS Option combinations', () => {
  assert.equal(acceleratorKeyFromEvent({ key: '∑', code: 'KeyW' }), 'W');
  assert.equal(acceleratorKeyFromEvent({ key: 'Œ', code: 'KeyQ' }), 'Q');
  assert.equal(acceleratorKeyFromEvent({ key: '3', code: 'Digit3' }), '3');
});

test('SuperX rejects non-ASCII persisted Electron accelerators', () => {
  assert.equal(normalizeKeyboardShortcut('Alt+∑'), 'Ctrl+W');
  assert.equal(normalizeKeyboardShortcut(' Alt+W '), 'Alt+W');
});
