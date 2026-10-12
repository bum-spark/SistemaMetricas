/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
  globalSetup: '<rootDir>/tests/mongo/globalSetup.ts',
  globalTeardown: '<rootDir>/tests/mongo/globalTeardown.ts',
  clearMocks: true,
  // La primera corrida descarga el binario de MongoDB.
  testTimeout: 30000,
};
