import js from '@eslint/js';
import pluginVue from 'eslint-plugin-vue';
import prettier from '@vue/eslint-config-prettier';
import {
  defineConfigWithVueTs,
  vueTsConfigs,
} from '@vue/eslint-config-typescript';

const isProd = process.env.NODE_ENV === 'production';

export default defineConfigWithVueTs(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/public/**'],
  },
  js.configs.recommended,
  ...pluginVue.configs['flat/essential'],
  vueTsConfigs.recommended,
  {
    rules: {
      'no-console': isProd ? 'warn' : 'off',
      'no-debugger': isProd ? 'warn' : 'off',
      'vue/multi-word-component-names': 'off',
      'vue/block-lang': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'none',
        },
      ],
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/no-unused-expressions': 'off',
      '@typescript-eslint/no-this-alias': 'warn',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
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
);
