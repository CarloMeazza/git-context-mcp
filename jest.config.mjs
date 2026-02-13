/**
 * Jest configuration for the Git MCP Server.
 *
 * Uses the `ts-jest` ESM preset so TypeScript tests can use native
 * `import`/`export` syntax without a separate compilation step.
 *
 * @see https://kulshekhar.github.io/ts-jest/docs/guides/esm-support
 */
export default {
  preset: 'ts-jest/presets/default-esm',
  clearMocks: true,
  coverageDirectory: "coverage",
  roots: [
    "./tests"
  ],

  // Rewrite `.js` imports to their extensionless form so ts-jest can resolve
  // TypeScript source files when ESM-style imports include the `.js` suffix.
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },

  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        isolatedModules: true,
        useESM: true,
        tsconfig: './tsconfig.json'
      }
    ]
  },

  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node', 'mjs'],
  extensionsToTreatAsEsm: ['.ts', '.mts'],

  // Allow transforming specific ESM-only dependencies inside node_modules
  transformIgnorePatterns: [
    'node_modules/(?!(@huggingface)/)'
  ],

  testMatch: [
    '**/?(*.)+(spec|test).ts',
    '**/tests/*EmbeddingsTest.ts',
    '**/tests/githubRepoTest.ts'
  ],

  globals: {
    'ts-jest': {
      useESM: true,
    },
  },

  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  verbose: true
};
