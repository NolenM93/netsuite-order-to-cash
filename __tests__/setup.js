/**
 * Jest Test Setup
 * Configures SuiteScript module mocks for unit testing
 */

// Mock the SuiteScript module loader
global.define = function(deps, factory) {
  if (typeof deps === 'function') {
    factory = deps;
    deps = [];
  }
  // Store the factory for testing
  if (factory) {
    module.exports = factory;
  }
};

// Base mock for N/log module
global.log = {
  debug: jest.fn(),
  audit: jest.fn(),
  error: jest.fn(),
  emergency: jest.fn()
};
