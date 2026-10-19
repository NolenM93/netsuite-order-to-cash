/**
 * Unit Tests for OTC_SS_OverdueReminder
 * Tests Scheduled Script for overdue invoice reminders
 */

const fs = require('fs');
const path = require('path');

let mockSearchResults = [];
const mockSearch = {
  create: jest.fn().mockReturnValue({
    run: jest.fn().mockReturnValue({
      each: jest.fn((callback) => {
        for (const result of mockSearchResults) {
          const shouldContinue = callback(result);
          if (!shouldContinue) break;
        }
      })
    })
  }),
  createColumn: jest.fn((opts) => opts),
  Type: { INVOICE: 'invoice' }
};

const mockEmail = {
  send: jest.fn()
};

const mockRuntime = {
  getCurrentUser: jest.fn(() => ({ id: 1 })),
  getCurrentScript: jest.fn(() => ({
    getRemainingUsage: jest.fn().mockReturnValue(1000),
    getParameter: jest.fn().mockReturnValue(null)
  }))
};

// Load utils module
const utilsContent = fs.readFileSync(
  path.join(__dirname, '../../src/FileCabinet/SuiteScripts/OrderToCash/lib/OTC_Lib_Utils.js'),
  'utf8'
);
let utilsFactory;
// eslint-disable-next-line no-unused-vars
const mockDefineUtils = (deps, factory) => {
  utilsFactory = typeof deps === 'function' ? deps : factory;
};
eval(utilsContent.replace('define(', 'mockDefineUtils('));
const utils = utilsFactory();

// Load script module
const scriptContent = fs.readFileSync(
  path.join(__dirname, '../../src/FileCabinet/SuiteScripts/OrderToCash/Scheduled/OTC_SS_OverdueReminder.js'),
  'utf8'
);

let scriptFactory;
// eslint-disable-next-line no-unused-vars
const mockDefine = (deps, factory) => {
  scriptFactory = factory;
};

global.log = {
  debug: jest.fn(),
  audit: jest.fn(),
  error: jest.fn()
};

eval(scriptContent.replace('define(', 'mockDefine('));

describe('OTC_SS_OverdueReminder', () => {
  let script;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchResults = [];
    mockEmail.send.mockImplementation(() => {});
    mockRuntime.getCurrentScript.mockReturnValue({
      getRemainingUsage: jest.fn().mockReturnValue(1000),
      getParameter: jest.fn().mockReturnValue(null)
    });
    script = scriptFactory(mockSearch, mockEmail, mockRuntime, utils);
  });

  describe('execute', () => {
    it('should log start and completion', () => {
      script.execute({});

      expect(global.log.audit).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Overdue Reminder - Started' })
      );
      expect(global.log.audit).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Overdue Reminder - Completed' })
      );
    });

    it('should search for overdue invoices', () => {
      script.execute({});

      expect(mockSearch.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'invoice' })
      );
    });

    it('should process invoices and send emails', () => {
      const pastDue = new Date();
      pastDue.setDate(pastDue.getDate() - 15);

      mockSearchResults = [{
        id: '123',
        getValue: jest.fn((opts) => {
          if (opts.name === 'tranid') return 'INV-001';
          if (opts.name === 'internalid' && opts.join === 'customer') return '456';
          if (opts.name === 'companyname' && opts.join === 'customer') return 'Test Corp';
          if (opts.name === 'email' && opts.join === 'customer') return 'test@example.com';
          if (opts.name === 'duedate') return pastDue.toISOString().split('T')[0];
          if (opts.name === 'amountremaining') return '1500.00';
          if (opts.name === 'total') return '2000.00';
          return null;
        })
      }];

      script.execute({});

      expect(mockEmail.send).toHaveBeenCalledWith(
        expect.objectContaining({
          recipients: 'test@example.com',
          subject: expect.stringContaining('INV-001')
        })
      );
    });

    it('should skip invoices without valid email', () => {
      mockSearchResults = [{
        id: '123',
        getValue: jest.fn((opts) => {
          if (opts.name === 'tranid') return 'INV-001';
          if (opts.name === 'email' && opts.join === 'customer') return 'invalid-email';
          if (opts.name === 'companyname' && opts.join === 'customer') return 'Test Corp';
          if (opts.name === 'duedate') return '2024-01-01';
          if (opts.name === 'amountremaining') return '1500.00';
          return null;
        })
      }];

      script.execute({});

      expect(mockEmail.send).not.toHaveBeenCalled();
      expect(global.log.debug).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Skipped - No Valid Email' })
      );
    });

    it('should log errors for failed invoice processing', () => {
      const pastDue = new Date();
      pastDue.setDate(pastDue.getDate() - 15);

      mockSearchResults = [{
        id: '123',
        getValue: jest.fn((opts) => {
          if (opts.name === 'tranid') return 'INV-001';
          if (opts.name === 'internalid' && opts.join === 'customer') return '456';
          if (opts.name === 'companyname' && opts.join === 'customer') return 'Test Corp';
          if (opts.name === 'email' && opts.join === 'customer') return 'test@example.com';
          if (opts.name === 'duedate') return pastDue.toISOString().split('T')[0];
          if (opts.name === 'amountremaining') return '1500.00';
          if (opts.name === 'total') return '2000.00';
          return null;
        })
      }];

      mockEmail.send.mockImplementation(() => {
        throw new Error('Email send failed');
      });

      script.execute({});

      expect(global.log.error).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Invoice Processing Error' })
      );
    });

    it('should stop when governance threshold is reached', () => {
      mockRuntime.getCurrentScript.mockReturnValue({
        getRemainingUsage: jest.fn()
          .mockReturnValueOnce(1000)
          .mockReturnValueOnce(100),
        getParameter: jest.fn().mockReturnValue(null)
      });

      const pastDue = new Date();
      pastDue.setDate(pastDue.getDate() - 15);

      mockSearchResults = [
        {
          id: '123',
          getValue: jest.fn((opts) => {
            if (opts.name === 'tranid') return 'INV-001';
            if (opts.name === 'email' && opts.join === 'customer') return 'test1@example.com';
            if (opts.name === 'companyname' && opts.join === 'customer') return 'Test 1';
            if (opts.name === 'duedate') return pastDue.toISOString().split('T')[0];
            if (opts.name === 'amountremaining') return '1000';
            return null;
          })
        },
        {
          id: '456',
          getValue: jest.fn((opts) => {
            if (opts.name === 'tranid') return 'INV-002';
            if (opts.name === 'email' && opts.join === 'customer') return 'test2@example.com';
            if (opts.name === 'companyname' && opts.join === 'customer') return 'Test 2';
            if (opts.name === 'duedate') return pastDue.toISOString().split('T')[0];
            if (opts.name === 'amountremaining') return '1000';
            return null;
          })
        }
      ];

      script.execute({});

      expect(global.log.audit).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Governance Limit Approaching' })
      );
    });

    it('should include invoice details in reminder email', () => {
      const pastDue = new Date();
      pastDue.setDate(pastDue.getDate() - 30);

      mockSearchResults = [{
        id: '123',
        getValue: jest.fn((opts) => {
          if (opts.name === 'tranid') return 'INV-001';
          if (opts.name === 'email' && opts.join === 'customer') return 'test@example.com';
          if (opts.name === 'companyname' && opts.join === 'customer') return 'Acme Corp';
          if (opts.name === 'duedate') return pastDue.toISOString().split('T')[0];
          if (opts.name === 'amountremaining') return '2500.00';
          if (opts.name === 'total') return '3000.00';
          if (opts.name === 'internalid' && opts.join === 'customer') return '456';
          return null;
        })
      }];

      script.execute({});

      expect(mockEmail.send).toHaveBeenCalled();
      const emailCall = mockEmail.send.mock.calls[0][0];
      expect(emailCall.body).toContain('INV-001');
      expect(emailCall.body).toContain('Acme Corp');
      expect(emailCall.relatedRecords.transactionId).toBe('123');
      expect(emailCall.relatedRecords.entityId).toBe('456');
    });

    it('should escape HTML in email body', () => {
      const pastDue = new Date();
      pastDue.setDate(pastDue.getDate() - 15);

      mockSearchResults = [{
        id: '123',
        getValue: jest.fn((opts) => {
          if (opts.name === 'tranid') return '<script>alert("xss")</script>';
          if (opts.name === 'email' && opts.join === 'customer') return 'test@example.com';
          if (opts.name === 'companyname' && opts.join === 'customer') return '<b>Evil Corp</b>';
          if (opts.name === 'duedate') return pastDue.toISOString().split('T')[0];
          if (opts.name === 'amountremaining') return '1500.00';
          if (opts.name === 'internalid' && opts.join === 'customer') return '456';
          return null;
        })
      }];

      script.execute({});

      const emailCall = mockEmail.send.mock.calls[0][0];
      expect(emailCall.body).not.toContain('<script>');
      expect(emailCall.body).toContain('&lt;script&gt;');
    });

    it('should use custom batch size from parameter', () => {
      mockRuntime.getCurrentScript.mockReturnValue({
        getRemainingUsage: jest.fn().mockReturnValue(1000),
        getParameter: jest.fn((opts) => {
          if (opts.name === 'custscript_otc_batch_size') return 100;
          return null;
        })
      });

      script = scriptFactory(mockSearch, mockEmail, mockRuntime, utils);
      script.execute({});

      expect(mockSearch.create).toHaveBeenCalled();
    });
  });
});
