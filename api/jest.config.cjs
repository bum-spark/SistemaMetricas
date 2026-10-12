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
  // Tiempo máximo por test Y por hook (en Jest, testTimeout también rige beforeAll/afterEach…;
  // no existe una opción hookTimeout aparte). Holgado para máquinas lentas: las pruebas con
  // MongoDB en memoria pueden tardar varios segundos si el equipo está cargado.
  testTimeout: 120000,
};
