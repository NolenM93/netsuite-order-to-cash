/**
 * Unit Tests for OTC_SS_OverdueReminder
 * Tests Scheduled Script for sending overdue invoice reminders
 */

// Mock N/ modules before requiring the script
jest.mock('N/search', () => ({
  create: jest.fn(),
  createColumn: jest.fn((opts) => opts),
  Type: { INVOICE: 'invoice' }
}), { virtual: true });

jest.mock('N/email', () => ({
  send: jest.fn()
}), { virtual: true });

jest.mock('N/runtime', () => ({
  getCurrentScript: jest.fn(() => ({
    getRemainingUsage: jest.fn().mockReturnValue(1000),
    getParameter: jest.fn().mockReturnValue(null),
    id: 'customscript_test',
    deploymentId: 'customdeploy_test'
  })),
  getCurrentUser: jest.fn(() => ({
    id: 1,
    name: 'Test User',
    email: 'test@example.com'
  }))
}), { virtual: true });

jest.mock('N/task', () => ({
  create: jest.fn(),
  TaskType: { SCHEDULED_SCRIPT: 'SCHEDULED_SCRIPT' }
}), { virtual: true });

// Get mocked modules
const search = require('N/search');
const email = require('N/email');
const runtime = require('N/runtime');
// task module is mocked but not used directly in tests

// Load the script under test
const script = require('../../src/FileCabinet/SuiteScripts/OrderToCash/Scheduled/OTC_SS_OverdueReminder');

describe('OTC_SS_OverdueReminder', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    runtime.getCurrentScript.mockReturnValue({
      getRemainingUsage: jest.fn().mockReturnValue(1000),
      getParameter: jest.fn().mockReturnValue(null),
      id: 'customscript_test',
      deploymentId: 'customdeploy_test'
    });
    runtime.getCurrentUser.mockReturnValue({
      id: 1,
      name: 'Test User'
    });
  });

  describe('execute', () => {
    it('should create search for overdue invoices', () => {
      const mockResultSet = {
        each: jest.fn().mockReturnValue(false)
      };
      const mockSearch = {
        run: jest.fn().mockReturnValue(mockResultSet)
      };
      search.create.mockReturnValue(mockSearch);

      script.execute({});

      expect(search.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'invoice'
        })
      );
    });

    it('should send email for each overdue invoice', () => {
      const mockResults = [
        {
          id: '1',
          getValue: jest.fn((col) => {
            const name = typeof col === 'string' ? col : col?.name;
            if (name === 'entity') return '100';
            if (name === 'email') return 'customer@example.com';
            if (name === 'tranid') return 'INV-001';
            if (name === 'duedate') return '1/1/2024';
            if (name === 'total') return '1000';
            if (name === 'amountremaining') return '1000';
            if (name === 'companyname') return 'Test Co';
            return null;
          }),
          getText: jest.fn().mockReturnValue('Test Customer')
        }
      ];

      const mockResultSet = {
        each: jest.fn((callback) => {
          mockResults.forEach(r => callback(r));
          return true;
        })
      };
      const mockSearch = {
        run: jest.fn().mockReturnValue(mockResultSet)
      };
      search.create.mockReturnValue(mockSearch);

      script.execute({});

      expect(email.send).toHaveBeenCalled();
    });

    it('should check governance before each email', () => {
      let callCount = 0;
      runtime.getCurrentScript.mockReturnValue({
        getRemainingUsage: jest.fn(() => {
          callCount++;
          return callCount > 1 ? 50 : 1000;
        }),
        getParameter: jest.fn().mockReturnValue(null),
        id: 'customscript_test',
        deploymentId: 'customdeploy_test'
      });

      const mockResults = [
        { id: '1', getValue: jest.fn().mockReturnValue('test@example.com'), getText: jest.fn().mockReturnValue('Test') },
        { id: '2', getValue: jest.fn().mockReturnValue('test2@example.com'), getText: jest.fn().mockReturnValue('Test2') }
      ];

      const mockResultSet = {
        each: jest.fn((callback) => {
          for (const r of mockResults) {
            if (!callback(r)) return false;
          }
          return true;
        })
      };
      const mockSearch = {
        run: jest.fn().mockReturnValue(mockResultSet)
      };
      search.create.mockReturnValue(mockSearch);

      script.execute({});

      // Only one email should be sent before governance runs low
      expect(email.send).toHaveBeenCalledTimes(1);
    });

    it('should stop processing when governance limit reached', () => {
      runtime.getCurrentScript.mockReturnValue({
        getRemainingUsage: jest.fn().mockReturnValue(50),
        getParameter: jest.fn().mockReturnValue(null),
        id: 'customscript_test',
        deploymentId: 'customdeploy_test'
      });

      const mockResults = [
        { id: '1', getValue: jest.fn().mockReturnValue('test@example.com'), getText: jest.fn().mockReturnValue('Test') },
        { id: '2', getValue: jest.fn().mockReturnValue('test2@example.com'), getText: jest.fn().mockReturnValue('Test2') }
      ];

      const mockResultSet = {
        each: jest.fn((callback) => {
          for (const r of mockResults) {
            if (!callback(r)) return false;
          }
          return true;
        })
      };
      const mockSearch = {
        run: jest.fn().mockReturnValue(mockResultSet)
      };
      search.create.mockReturnValue(mockSearch);

      // Should not throw even with low governance
      expect(() => script.execute({})).not.toThrow();
      // Script logs that it stopped due to governance
      expect(global.log.audit).toHaveBeenCalled();
    });

    it('should use script parameters for configuration', () => {
      runtime.getCurrentScript.mockReturnValue({
        getRemainingUsage: jest.fn().mockReturnValue(1000),
        getParameter: jest.fn((opts) => {
          if (opts.name === 'custscript_otc_gov_threshold') return 300;
          if (opts.name === 'custscript_otc_email_sender') return 5;
          return null;
        }),
        id: 'customscript_test',
        deploymentId: 'customdeploy_test'
      });

      const mockResultSet = {
        each: jest.fn().mockReturnValue(false)
      };
      const mockSearch = {
        run: jest.fn().mockReturnValue(mockResultSet)
      };
      search.create.mockReturnValue(mockSearch);

      script.execute({});

      expect(search.create).toHaveBeenCalled();
    });

    it('should handle empty result set', () => {
      const mockResultSet = {
        each: jest.fn().mockReturnValue(false)
      };
      const mockSearch = {
        run: jest.fn().mockReturnValue(mockResultSet)
      };
      search.create.mockReturnValue(mockSearch);

      expect(() => script.execute({})).not.toThrow();
      expect(email.send).not.toHaveBeenCalled();
    });
  });
});
