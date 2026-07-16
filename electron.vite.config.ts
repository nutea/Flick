import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';
import { builtinModules } from 'module';
import pkg from './package.json';

const nodeExternals = [
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
  ...Object.keys(pkg.dependencies || {}),
  ...Object.keys(pkg.optionalDependencies || {}),
];

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
        'original-fs': 'fs',
        electron: path.resolve(__dirname, 'src/renderer/shims/electron.ts'),
        '@electron/remote': path.resolve(
          __dirname,
          'src/renderer/shims/electron-remote.ts'
        ),
        child_process: path.resolve(
          __dirname,
          'src/renderer/shims/child_process.ts'
        ),
        path: path.resolve(__dirname, 'src/renderer/shims/path.ts'),
        fs: path.resolve(__dirname, 'src/renderer/shims/fs.ts'),
      },
    },
    define: {
      __static: 'globalThis.__static',
    },
    build: {
      outDir: 'dist/main',
      rollupOptions: {
        input: {
          entry: path.resolve(__dirname, 'src/main/entry.ts'),
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
        'original-fs': 'fs',
      },
    },
    define: {
      __static: 'globalThis.__static',
    },
    build: {
      outDir: 'dist/preload',
      rollupOptions: {
        input: {
          index: path.resolve(__dirname, 'src/preload/main.ts'),
        },
      },
    },
  },
  renderer: {
    root: path.resolve(__dirname, 'src/renderer'),
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
        'original-fs': 'fs',
      },
    },
    define: {
      __static: 'globalThis.__static',
    },
    build: {
      outDir: path.resolve(__dirname, 'dist/renderer'),
      rollupOptions: {
        input: {
          index: path.resolve(__dirname, 'src/renderer/index.html'),
        },
      },
      emptyOutDir: true,
    },
    plugins: [vue()],
  },
});

