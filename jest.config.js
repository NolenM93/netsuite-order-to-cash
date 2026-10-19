/**
 * Jest Configuration for SuiteScript 2.1 Unit Testing
 */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js'],
  collectCoverageFrom: [
    'src/FileCabinet/SuiteScripts/**/*.js',
    '!**/node_modules/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  moduleFileExtensions: ['js', 'json'],
  verbose: true,
  setupFilesAfterEnv: ['<rootDir>/__tests__/setup.js']
};
