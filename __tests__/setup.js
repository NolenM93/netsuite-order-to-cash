/**
 * Jest Test Setup
 * Configures SuiteScript module mocks for unit testing
 *
 * The @oracle/suitecloud-unit-testing package provides stubs for N/ modules,
 * but we need to configure jest.mock for modules we want to control in tests.
 */

// Global log mock (available in all SuiteScript contexts)
global.log = {
  debug: jest.fn(),
  audit: jest.fn(),
  error: jest.fn(),
  emergency: jest.fn()
};

// Reset all mocks between tests
beforeEach(() => {
  jest.clearAllMocks();
});
