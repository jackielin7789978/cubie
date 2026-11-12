import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

// 分層規則：core 不可以 import three / react；engine 不可以 import react
const banImports = (names) => ({
  'no-restricted-imports': ['error', { patterns: names.map((n) => ({ group: [n, `${n}/*`], message: `這一層不可以 import ${n}` })) }],
})

export default tseslint.config(
  { ignores: ['dist', 'src/vendor', 'previews', 'node_modules', 'playwright-report', 'test-results', '.claude'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { ecmaVersion: 2023, globals: { ...globals.browser, ...globals.node } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  { files: ['src/core/**/*.ts'], rules: banImports(['three', 'react', 'react-dom', 'zustand']) },
  { files: ['src/engine/**/*.ts'], rules: banImports(['react', 'react-dom', 'zustand']) },
)
