import { spawnSync } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';

const require = createRequire(import.meta.url);
const electronViteEntry = require.resolve('electron-vite');
const { build } = require(
  require.resolve('esbuild', { paths: [electronViteEntry] })
);

const root = process.cwd();
const outDir = path.join(root, '.test-build');
const outfile = path.join(outDir, 'index.test.cjs');

await rm(outDir, { recursive: true, force: true });
await build({
  entryPoints: [path.join(root, 'tests', 'index.test.ts')],
  outfile,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  sourcemap: 'inline',
  external: ['better-sqlite3', 'electron', 'webdav'],
});

const electronExecutable = require('electron');
const result = spawnSync(electronExecutable, ['--test', outfile], {
  cwd: root,
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  stdio: 'inherit',
});

await rm(outDir, { recursive: true, force: true });
process.exit(result.status ?? 1);
