/**
 * Unit Tests for OTC_MR_ARAgingSummary
 * Tests Map/Reduce script for AR Aging Summary report generation
 */

// Mock N/ modules before requiring the script
jest.mock('N/search', () => ({
  create: jest.fn(),
  createColumn: jest.fn((opts) => opts),
  Type: { INVOICE: 'invoice' }
}), { virtual: true });

jest.mock('N/record', () => ({
  create: jest.fn(),
  load: jest.fn(),
  Type: { CUSTOM_RECORD: 'customrecord' }
}), { virtual: true });

// Get mocked modules
const search = require('N/search');
const record = require('N/record');

// Load the script under test
const script = require('../../src/FileCabinet/SuiteScripts/OrderToCash/MapReduce/OTC_MR_ARAgingSummary');

describe('OTC_MR_ARAgingSummary', () => {

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getInputData', () => {
    it('should return search object for open invoices', () => {
      const mockSearch = { type: 'invoice', filters: [], columns: [] };
      search.create.mockReturnValue(mockSearch);

      const result = script.getInputData();

      expect(search.create).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'invoice'
        })
      );
      expect(result).toBe(mockSearch);
    });

    it('should include proper columns', () => {
      const mockSearch = { type: 'invoice' };
      search.create.mockReturnValue(mockSearch);

      script.getInputData();

      expect(search.createColumn).toHaveBeenCalled();
    });
  });

  describe('map', () => {
    it('should extract customer data and write key-value pair', () => {
      const context = {
        value: JSON.stringify({
          id: '123',
          values: {
            'internalid.customer': { value: '100', text: '100' },
            'companyname.customer': 'Test Customer',
            amountremaining: '500.00',
            duedate: '1/1/2024',
            tranid: 'INV-001',
            internalid: { value: '123' }
          }
        }),
        write: jest.fn()
      };

      script.map(context);

      expect(context.write).toHaveBeenCalledWith(
        expect.objectContaining({
          key: '100'
        })
      );
    });

    it('should skip records without customer ID', () => {
      const context = {
        value: JSON.stringify({
          id: '123',
          values: {
            'internalid.customer': null,
            amountremaining: '500.00',
            duedate: '1/1/2024'
          }
        }),
        write: jest.fn()
      };

      script.map(context);

      expect(context.write).not.toHaveBeenCalled();
    });

    it('should handle different value structures', () => {
      const context = {
        value: JSON.stringify({
          id: '123',
          values: {
            'internalid.customer': { value: '100' },
            'companyname.customer': 'Test Customer',
            amountremaining: '500.00',
            duedate: '2024-01-01'
          }
        }),
        write: jest.fn()
      };

      expect(() => script.map(context)).not.toThrow();
    });
  });

  describe('reduce', () => {
    it('should aggregate invoice data by customer', () => {
      const mockRecord = {
        setValue: jest.fn(),
        save: jest.fn().mockReturnValue(1)
      };
      record.create.mockReturnValue(mockRecord);

      // Mock search for existing record check
      search.create.mockReturnValue({
        run: jest.fn().mockReturnValue({
          each: jest.fn().mockReturnValue(false)
        })
      });

      const context = {
        key: '100',
        values: [
          JSON.stringify({ customerName: 'Test', amountRemaining: 500, daysOverdue: 15, agingBucket: '1-30 Days', invoiceId: '1', tranId: 'INV-001' }),
          JSON.stringify({ customerName: 'Test', amountRemaining: 300, daysOverdue: 45, agingBucket: '31-60 Days', invoiceId: '2', tranId: 'INV-002' })
        ],
        write: jest.fn()
      };

      script.reduce(context);

      expect(context.write).toHaveBeenCalled();
    });

    it('should calculate total amount and invoice count', () => {
      const mockRecord = {
        setValue: jest.fn(),
        save: jest.fn().mockReturnValue(1)
      };
      record.create.mockReturnValue(mockRecord);

      search.create.mockReturnValue({
        run: jest.fn().mockReturnValue({
          each: jest.fn().mockReturnValue(false)
        })
      });

      const context = {
        key: '100',
        values: [
          JSON.stringify({ customerName: 'Test', amountRemaining: 500, daysOverdue: 15, agingBucket: '1-30 Days', invoiceId: '1' }),
          JSON.stringify({ customerName: 'Test', amountRemaining: 500, daysOverdue: 15, agingBucket: '1-30 Days', invoiceId: '2' })
        ],
        write: jest.fn()
      };

      script.reduce(context);

      const writeCall = context.write.mock.calls[0];
      expect(writeCall).toBeDefined();
      const writtenValue = JSON.parse(writeCall[0].value);
      expect(writtenValue.totalOutstanding).toBe(1000);
    });
  });

  describe('summarize', () => {
    it('should log summary statistics', () => {
      const context = {
        dateCreated: new Date(),
        seconds: 10,
        usage: 100,
        concurrency: 1,
        yields: 0,
        inputSummary: { error: null },
        mapSummary: {
          errors: { iterator: () => ({ each: () => {} }) }
        },
        reduceSummary: {
          errors: { iterator: () => ({ each: () => {} }) }
        },
        output: {
          iterator: () => ({
            each: jest.fn((callback) => {
              callback('100', JSON.stringify({ success: true, customerName: 'Test', totalOutstanding: 1000 }));
              return true;
            })
          })
        }
      };

      expect(() => script.summarize(context)).not.toThrow();
      expect(global.log.audit).toHaveBeenCalled();
    });

    it('should handle and log errors from map phase', () => {
      const context = {
        dateCreated: new Date(),
        seconds: 10,
        usage: 100,
        concurrency: 1,
        yields: 0,
        inputSummary: { error: null },
        mapSummary: {
          errors: {
            iterator: () => ({
              each: jest.fn((callback) => {
                callback('err1', 'Map error');
                return true;
              })
            })
          }
        },
        reduceSummary: {
          errors: { iterator: () => ({ each: () => {} }) }
        },
        output: {
          iterator: () => ({
            each: () => true
          })
        }
      };

      expect(() => script.summarize(context)).not.toThrow();
      expect(global.log.error).toHaveBeenCalled();
    });

    it('should log input errors if present', () => {
      const context = {
        dateCreated: new Date(),
        seconds: 10,
        usage: 100,
        concurrency: 1,
        yields: 0,
        inputSummary: { error: 'Input failed' },
        mapSummary: {
          errors: { iterator: () => ({ each: () => {} }) }
        },
        reduceSummary: {
          errors: { iterator: () => ({ each: () => {} }) }
        },
        output: {
          iterator: () => ({
            each: () => true
          })
        }
      };

      script.summarize(context);

      expect(global.log.error).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Input Error' })
      );
    });
  });
});
