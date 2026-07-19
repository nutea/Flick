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
          plugin: path.resolve(__dirname, 'src/preload/plugin.ts'),
          guide: path.resolve(__dirname, 'src/preload/guide.ts'),
          detach: path.resolve(__dirname, 'src/preload/detach.ts'),
          feature: path.resolve(__dirname, 'src/preload/feature.ts'),
          screenCapture: path.resolve(
            __dirname,
            'src/preload/screenCapture.ts'
          ),
        },
      },
    },
  },
  renderer: {
    root: path.resolve(__dirname, 'src/renderer'),
    optimizeDeps: {
      include: [
        'vue',
        '@ant-design/icons-vue',
        'ant-design-vue',
        'ant-design-vue/es/avatar/style/css',
        'ant-design-vue/es/button/style/css',
        'ant-design-vue/es/divider/style/css',
        'ant-design-vue/es/grid/style/css',
        'ant-design-vue/es/input/style/css',
        'ant-design-vue/es/list/style/css',
        'ant-design-vue/es/spin/style/css',
        'ant-design-vue/es/tag/style/css',
      ],
    },
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
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('@ant-design/icons-vue')) return 'icons';
            if (id.includes('ant-design-vue')) return 'antd';
            if (id.includes('/vue/')) return 'vue-vendor';
            return undefined;
          },
        },
      },
      emptyOutDir: true,
    },
    plugins: [vue()],
  },
});
