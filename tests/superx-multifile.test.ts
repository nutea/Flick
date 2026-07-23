import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  matchesFileCommand,
  toPluginFilePayload,
} from '../apps/superx/src/panel/file-selection';
import { matchesTextCommand } from '../apps/superx/src/panel/text-selection';
import {
  commandMatchKey,
  matchRuleOverrideId,
  normalizeMatchRulesDocument,
} from '../apps/shared/super-panel-match-rules';
import { parseCmdRegex } from '../apps/shared/cmd-regex';

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

test('SuperX carries file arrays through capture, IPC and panel state', () => {
  const clipboard = read('apps/superx/node-src/clipboard-helpers.ts');
  const main = read('apps/superx/node-src/main.ts');
  const types = read('apps/superx/src/panel/types.ts');
  const panel = read('apps/superx/src/panel/use-super-panel.ts');

  assert.match(clipboard, /fileUrls:\s*string\[\]/);
  assert.match(clipboard, /normalizeSelectedPaths\(selectedPaths\)/);
  assert.match(main, /copyResult\.selectedFiles/);
  assert.match(main, /describeSelectedFiles\(copyResult\.fileUrls\)/);
  assert.match(main, /Math\.min\(8, selectedPaths\.length\)/);
  assert.match(main, /fs\.promises\.stat\(selectedPath\)/);
  assert.doesNotMatch(main, /fs\.statSync\(cleanPath\)/);
  assert.match(main, /selectedFiles,/);
  assert.match(types, /selectedFiles\?: SelectedFileItem\[\]/);
  assert.match(panel, /state\.selectedFiles = normalizedFiles/);
});

test('SuperX sends file plugins arrays and only matches supported files', () => {
  const png = {
    path: '/tmp/a.png',
    name: 'a.png',
    extension: '.png',
    isFile: true,
    isDirectory: false,
  };
  const jpg = { ...png, path: '/tmp/b.jpg', name: 'b.jpg', extension: '.jpg' };
  const txt = { ...png, path: '/tmp/c.txt', name: 'c.txt', extension: '.txt' };
  const folder = {
    ...png,
    path: '/tmp/folder',
    name: 'folder',
    extension: '',
    isFile: false,
    isDirectory: true,
  };
  const imageCommand = { type: 'files', match: '/\\.(png|jpe?g)$/i' };

  assert.equal(matchesFileCommand(imageCommand, [png]), true);
  assert.equal(matchesFileCommand(imageCommand, [png, jpg]), true);
  assert.equal(matchesFileCommand(imageCommand, [png, txt]), false);
  assert.equal(matchesFileCommand(imageCommand, [png, folder]), false);
  assert.deepEqual(toPluginFilePayload([png, jpg]), [
    {
      isFile: true,
      isDirectory: false,
      name: 'a.png',
      path: '/tmp/a.png',
    },
    {
      isFile: true,
      isDirectory: false,
      name: 'b.jpg',
      path: '/tmp/b.jpg',
    },
  ]);

  const panel = read('apps/superx/src/panel/use-super-panel.ts');
  assert.match(
    panel,
    /cmd\.type === 'img' \? selectedFileDataUrl : pluginPayload/
  );
  assert.match(panel, /singleFile\?\.isFile/);
});

test('SuperX uses files for one or more ordinary files', () => {
  const file = {
    path: '/tmp/a.txt',
    name: 'a.txt',
    extension: '.txt',
    isFile: true,
    isDirectory: false,
  };
  const folder = {
    path: '/tmp/folder',
    name: 'folder',
    extension: '',
    isFile: false,
    isDirectory: true,
  };

  const secondFile = {
    ...file,
    path: '/tmp/b.txt',
    name: 'b.txt',
  };
  const applicationFallback = {
    path: '/System/Library/CoreServices/Finder.app',
    name: 'Finder.app',
    extension: '.app',
    isFile: false,
    isDirectory: false,
  };

  assert.equal(matchesFileCommand({ type: 'file' }, [file]), false);
  assert.equal(matchesFileCommand({ type: 'files' }, [file]), true);
  assert.equal(matchesFileCommand({ type: 'files' }, [file, secondFile]), true);
  assert.equal(matchesFileCommand({ type: 'files' }, [file, folder]), false);
  assert.equal(
    matchesFileCommand({ type: 'files' }, [applicationFallback]),
    false
  );
  assert.equal(
    matchesFileCommand(
      {
        type: 'files',
        fileType: 'file',
        maxLength: 1,
        match: '/\\.json$/i',
      },
      [{ ...file, name: 'a.json', path: '/tmp/a.json', extension: '.json' }]
    ),
    true
  );
  assert.equal(
    matchesFileCommand({ type: 'files', fileType: 'file', maxLength: 2 }, [
      file,
      secondFile,
      { ...file, path: '/tmp/c.txt', name: 'c.txt' },
    ]),
    false
  );
});

test('plugin command regex parsing is safe and supports slash flags', () => {
  assert.equal(parseCmdRegex('/\\.PNG$/i').test('.png'), true);
  assert.equal(parseCmdRegex('/[/').test('.png'), false);
  assert.equal(parseCmdRegex('[invalid').test('.png'), false);
});

test('SuperX plugins can declare custom file selection rules', () => {
  const png = {
    path: '/tmp/a.png',
    name: 'a.png',
    extension: '.png',
    isFile: true,
    isDirectory: false,
  };
  const jpg = {
    ...png,
    path: '/tmp/b.jpg',
    name: 'b.jpg',
    extension: '.jpg',
  };
  const txt = {
    ...png,
    path: '/tmp/c.txt',
    name: 'c.txt',
    extension: '.txt',
  };
  const command = {
    type: 'files',
    matchRules: {
      selection: 'files' as const,
      minCount: 2,
      kinds: ['file' as const],
      target: 'name' as const,
      pattern: '/\\.(png|jpe?g)$/i',
      mode: 'all' as const,
    },
  };

  assert.equal(matchesFileCommand(command, [png, jpg]), true);
  assert.equal(
    matchesFileCommand(
      {
        ...command,
        matchRules: { ...command.matchRules, enabled: false },
      },
      [png, jpg]
    ),
    false
  );
  assert.equal(matchesFileCommand(command, [png]), false);
  assert.equal(matchesFileCommand(command, [png, txt]), false);
  assert.equal(
    matchesFileCommand(
      {
        ...command,
        matchRules: { ...command.matchRules, mode: 'any' as const },
      },
      [png, txt]
    ),
    true
  );
});

test('SuperX text matching respects custom length and pattern rules', () => {
  assert.equal(
    matchesTextCommand(
      {
        type: 'custom',
        matchRules: { selection: 'text' },
      },
      'any selected text'
    ),
    true
  );
  assert.equal(
    matchesTextCommand(
      {
        type: 'custom',
        matchRules: {
          selection: 'text',
          minLength: 3,
          maxLength: 12,
          pattern: '/^https?:/i',
        },
      },
      '\u200Bhttps://a'
    ),
    true
  );
  assert.equal(
    matchesTextCommand(
      {
        type: 'regex',
        minLength: 6,
        match: '/^https?:/i',
      },
      'http:'
    ),
    false
  );
  assert.equal(
    matchesTextCommand(
      {
        type: 'over',
        matchRules: { enabled: false, selection: 'text' },
      },
      'selected text'
    ),
    false
  );
});

test('SuperX match rule overrides have stable command identities', () => {
  const command = { type: 'files', label: 'Rename' };
  const commandKey = commandMatchKey(command, 1);
  const id = matchRuleOverrideId('rename-plugin', 'rename', commandKey);
  const document = normalizeMatchRulesDocument({
    _id: 'super-panel-match-rules',
    data: [
      {
        id,
        pluginName: 'rename-plugin',
        featureCode: 'rename',
        commandKey,
        priority: 10,
        matchRules: { enabled: true, minCount: 2 },
      },
      { broken: true },
    ],
  });

  assert.equal(document.data.length, 1);
  assert.equal(document.data[0].id, id);
  assert.equal(commandMatchKey(command, 1), commandKey);
});

test('existing singleton plugin windows receive the original file payload', () => {
  const api = read('src/main/common/api.ts');
  const hook = read('src/main/common/pluginSubInputHook.ts');
  assert.match(api, /Array\.isArray\(ep\) && ep\.length > 0/);
  assert.match(api, /executePluginEnterHook\([^;]+launchPlugin\?\.ext\)/);
  assert.match(api, /runnerInstance\.executeHooks\('PluginEnter', plugin\.ext/);
  assert.match(hook, /hooks\.onPluginEnter/);
});

test('main launcher file matching no longer discards multi-file selections', () => {
  const clipboardWatch = read('src/renderer/plugins-manager/clipboardWatch.ts');
  assert.doesNotMatch(clipboardWatch, /if \(fileList\.length === 1\) \{/);
  assert.match(clipboardWatch, /cmd\.type === 'files'/);
  assert.match(clipboardWatch, /hasOnlyRegularFiles/);
  assert.match(clipboardWatch, /payload: fileList/);
  assert.match(clipboardWatch, /parseCmdRegex/);
  assert.match(clipboardWatch, /name: cmd\.label \|\| fe\.code/);
});
