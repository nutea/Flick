import js from '@eslint/js';
import pluginVue from 'eslint-plugin-vue';
import prettier from '@vue/eslint-config-prettier';

const isProd = process.env.NODE_ENV === 'production';

/** Guide 子应用：仅 JS + Vue，无 TypeScript */
export default [
  {
    ignores: ['**/dist/**', '**/node_modules/**'],
  },
  js.configs.recommended,
  ...pluginVue.configs['flat/essential'],
  {
    languageOptions: {
      globals: {
        window: 'readonly',
        require: 'readonly',
      },
    },
    rules: {
      'no-console': isProd ? 'warn' : 'off',
      'no-debugger': isProd ? 'warn' : 'off',
      'vue/multi-word-component-names': 'off',
      'vue/block-lang': 'off',
    },
  },
  prettier,
  {
    rules: {
      'prettier/prettier': [
        'warn',
        {
          singleQuote: true,
          endOfLine: 'auto',
        },
      ],
    },
  },
];
