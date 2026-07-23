import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { collectResolvedDependencyClosure } from '../src/main/common/pluginDependencies';

function writePackage(
  packageDir: string,
  name: string,
  dependencies: Record<string, string> = {}
): void {
  fs.mkdirSync(packageDir, { recursive: true });
  fs.writeFileSync(
    path.join(packageDir, 'package.json'),
    JSON.stringify({ name, version: '1.0.0', dependencies })
  );
}

test('plugin dependency bundles preserve nested package instances', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flick-deps-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const nm = path.join(root, 'node_modules');
  writePackage(path.join(nm, 'legacy-plugin'), 'legacy-plugin', {
    'concat-stream': '1.0.0',
  });
  writePackage(path.join(nm, 'concat-stream'), 'concat-stream', {
    'readable-stream': '2.0.0',
  });
  writePackage(path.join(nm, 'readable-stream'), 'readable-stream');
  writePackage(
    path.join(
      nm,
      'concat-stream',
      'node_modules',
      'readable-stream'
    ),
    'readable-stream',
    { 'process-nextick-args': '2.0.1' }
  );
  writePackage(
    path.join(nm, 'process-nextick-args'),
    'process-nextick-args'
  );

  const result = await collectResolvedDependencyClosure(nm, 'legacy-plugin');
  const relative = result.packageDirs.map((dir) =>
    path.relative(nm, dir).split(path.sep).join('/')
  );

  assert.deepEqual(result.missing, []);
  assert.ok(relative.includes('legacy-plugin'));
  assert.ok(relative.includes('concat-stream'));
  assert.ok(
    relative.includes('concat-stream/node_modules/readable-stream'),
    'the nested readable-stream instance must be retained'
  );
  assert.ok(relative.includes('process-nextick-args'));
  assert.equal(relative.includes('readable-stream'), false);
});

test('plugin dependency validation reports a missing transitive package', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flick-deps-missing-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const nm = path.join(root, 'node_modules');
  writePackage(path.join(nm, 'legacy-plugin'), 'legacy-plugin', {
    'readable-stream': '2.0.0',
  });
  writePackage(path.join(nm, 'readable-stream'), 'readable-stream', {
    'process-nextick-args': '2.0.1',
  });

  const result = await collectResolvedDependencyClosure(nm, 'legacy-plugin');
  assert.deepEqual(result.missing, [
    'readable-stream -> process-nextick-args',
  ]);
});

test('plugin runtime paths go through the isolated-storage resolver', () => {
  const root = process.cwd();
  const files = [
    'src/main/browsers/runner.ts',
    'src/main/common/api.ts',
    'src/main/common/detachWindowIcon.ts',
    'src/main/common/pluginPresentation.ts',
    'src/main/common/registerSystemPlugin.ts',
    'src/common/utils/localPlugin.ts',
  ];
  for (const file of files) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    assert.doesNotMatch(
      source,
      /(?:PLUGIN_INSTALL_DIR|baseDir),\s*['"]node_modules['"]/,
      `${file} bypasses pluginStorage`
    );
  }
  const storage = fs.readFileSync(
    path.join(root, 'src/main/common/pluginStorage.ts'),
    'utf8'
  );
  assert.match(storage, /ISOLATED_PLUGIN_DIR/);
  assert.match(storage, /resolveInstalledPluginRoot/);
  assert.match(storage, /legacyPluginRoot/);
});
