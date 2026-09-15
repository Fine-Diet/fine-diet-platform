/**
 * Separate project for the real-PostgreSQL integration suite.
 *
 * These tests start a run-owned disposable local cluster, so they are excluded
 * from `npm test` and invoked explicitly. Keeping them out of the default suite
 * means the ordinary suite result stays comparable to the baseline, and it means
 * a missing local server is reported as a blocked check rather than silently
 * skipped inside a green run.
 *
 * Run with: npm run test:localdb
 *
 * @type {import('jest').Config}
 */
const config = {
  testEnvironment: 'node',
  roots: ['<rootDir>/test/localdb'],
  testMatch: ['<rootDir>/test/localdb/__tests__/**/*.test.ts'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', { tsconfig: { jsx: 'react' } }],
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  // One cluster per worker would multiply servers; these tests share a fixture
  // and coordinate their own sessions.
  maxWorkers: 1,
  testTimeout: 180000,
};

module.exports = config;
