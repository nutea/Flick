import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';

export default defineConfig(({ command }) => ({
  plugins: [vue()],
  base: command === 'build' ? './' : '/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  css: {
    preprocessorOptions: {
      less: {
        javascriptEnabled: true,
      },
    },
  },
  server: {
    port: 8081,
    open: false,
  },
  build: {
    outDir: path.join(__dirname, '../../public/feature'),
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('@ant-design/icons-vue')) return 'icons';
          if (id.includes('ant-design-vue')) return 'antd';
          if (
            id.includes('/vue/') ||
            id.includes('/vue-router/') ||
            id.includes('/vuex/') ||
            id.includes('/vue-i18n/')
          ) {
            return 'vue-vendor';
          }
          if (id.includes('/axios/') || id.includes('/markdown-it/')) {
            return 'data-vendor';
          }
          return undefined;
        },
      },
    },
    chunkSizeWarningLimit: 550,
  },
}));
