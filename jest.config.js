/**
 * Jest Configuration for SuiteScript 2.1 Unit Testing
 * Uses @oracle/suitecloud-unit-testing for proper AMD module transformation
 */
const SuiteCloudJestConfiguration = require('@oracle/suitecloud-unit-testing/jest-configuration/SuiteCloudJestConfiguration');

const baseConfig = SuiteCloudJestConfiguration.build({
  projectFolder: 'src',
  projectType: SuiteCloudJestConfiguration.ProjectType.ACP,
  customStubs: [
    {
      module: 'N/dialog',
      path: '<rootDir>/node_modules/@oracle/suitecloud-unit-testing/stubs/ui/dialog/dialog.js'
    }
  ]
});

module.exports = {
  ...baseConfig,
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.js'],
  collectCoverageFrom: [
    'src/FileCabinet/SuiteScripts/**/*.js',
    '!**/node_modules/**',
    // Exclude Suitelet client helper - browser-only code that can't be unit tested in Node.js
    '!src/FileCabinet/SuiteScripts/OrderToCash/Suitelet/OTC_SL_CollectionsDashboard_Client.js'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'text-summary', 'lcov', 'html'],
  verbose: true,
  setupFilesAfterEnv: ['<rootDir>/__tests__/setup.js'],
  coverageThreshold: {
    global: {
      lines: 85,
      statements: 85,
      branches: 75,
      functions: 85
    }
  }
};
