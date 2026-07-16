import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';

/** 与 apps/feature 一致：构建产物直接写入仓库 public/superx，静态清单走 publicDir。 */
export default defineConfig({
  plugins: [vue()],
  base: './',
  publicDir: 'public',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: path.join(__dirname, '../../public/superx'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'main.html'),
      },
    },
  },
});
