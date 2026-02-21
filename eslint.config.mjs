// @ts-check
import eslint from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';

export default tseslint.config(
  // 1) Global ignores
  {
    ignores: [
      'eslint.config.mjs',
      'dist/**',
      'node_modules/**',
      'deploy/**',
      'apps/lmstudio-web/src/migrations/**',
      '**/*.generated.*',
      '**/*spec.ts'
    ],
  },

  // 2) Base JS recommended
  eslint.configs.recommended,

  // 3) TypeScript base (non-type-aware) for all TS files
  ...tseslint.configs.recommended,

  // 4) Prettier (runs late)
  eslintPluginPrettierRecommended,

  // 5) Default language options (shared)
  {
    languageOptions: {
      ecmaVersion: 'latest',
    },
  },

  // 6) Angular / Browser side: apps/* and libs/* that are frontend-ish
  {
    files: [
      'apps/**/src/**/*.ts',
      'apps/**/src/**/*.tsx',
      'libs/**/src/**/*.ts',
      'libs/**/src/**/*.tsx',
    ],
    // We'll override specifically for backend below; this is the "frontend default".
    languageOptions: {
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2021,
      },
      parserOptions: {
        // Great for monorepos: figures out correct TS program automatically.
        // If you ever hit performance issues, switch to explicit tsconfig.eslint.json.
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Frontend dev is usually happier with these as warnings:
      '@typescript-eslint/no-floating-promises': 'warn',

      // These are often too noisy in Angular templates/services when libs have imperfect types.
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',

      // Angular often uses function refs; this rule is useful but can be noisy:
      '@typescript-eslint/unbound-method': 'off',

      "no-useless-escape": 'off',

      // You already had this:
      '@typescript-eslint/no-explicit-any': 'off',

      // Prettier
      'prettier/prettier': ['error', { endOfLine: 'auto' }],
    },
  },

  // 7) Nest / Node side: backend-specific override
  {
    files: ['apps/lmstudio-web/src/**/*.ts', 'apps/lmstudio-web/test/**/*.ts'],
    // Only target backend app(s) explicitly (adjust paths if your backend is elsewhere)
    // If your Nest app is exactly apps/lmstudio-web, tighten to that:
    // files: ['apps/lmstudio-web/**/*.ts'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
        ...globals.jest,
        ...globals.es2021,
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Backend: these are actually valuable and usually less noisy
      '@typescript-eslint/no-floating-promises': 'warn',

      // Keep unsafe-* as WARN in backend so you notice real "unknown/any" leaks,
      // but it won't block you while integrating third-party libs.
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-return': 'warn',
      '@typescript-eslint/no-unsafe-call': 'warn',

      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/unbound-method': 'off',

      'prettier/prettier': ['error', { endOfLine: 'auto' }],
    },
  },

  // 8) “Tooling / scripts / config” files: allow CommonJS and looser typing
  {
    files: ['**/*.mjs', '**/*.cjs', '**/*.js'],
    languageOptions: {
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.es2021,
      },
    },
    rules: {
      '@typescript-eslint/no-var-requires': 'off',
    },
  },
);
