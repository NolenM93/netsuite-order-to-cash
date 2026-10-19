/**
 * Jest Configuration for SuiteScript 2.1 Unit Testing
 *
 * Note: Coverage instrumentation doesn't work with AMD modules loaded via eval().
 * This is a known limitation when testing SuiteScript modules outside NetSuite.
 * The tests do exercise the code paths, but coverage metrics show 0%.
 * See README for details.
 */
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js'],
  collectCoverageFrom: [
    'src/FileCabinet/SuiteScripts/**/*.js',
    '!**/node_modules/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'text-summary', 'lcov', 'html'],
  moduleFileExtensions: ['js', 'json'],
  verbose: true,
  setupFilesAfterEnv: ['<rootDir>/__tests__/setup.js']
};
