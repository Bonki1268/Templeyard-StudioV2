import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['**/node_modules/**', '**/dist/**', '.features-gen/**', 'test-results/**', 'playwright-report/**', 'docs/**', '_to_delete/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      // _ 開頭的參數或變數表示刻意不使用
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.browser },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    files: ['**/*.test.{ts,tsx}', 'tests/**/*.ts'],
    rules: {
      // 不留下 .only／.skip
      'no-restricted-properties': [
        'error',
        { object: 'it', property: 'only' },
        { object: 'it', property: 'skip' },
        { object: 'describe', property: 'only' },
        { object: 'describe', property: 'skip' },
        { object: 'test', property: 'only' },
        { object: 'test', property: 'skip' },
      ],
    },
  },
);
