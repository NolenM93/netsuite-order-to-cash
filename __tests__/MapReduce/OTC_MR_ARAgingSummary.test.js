/**
 * Unit Tests for OTC_MR_ARAgingSummary
 * Tests Map/Reduce script for AR aging summary
 */

const fs = require('fs');
const path = require('path');

const mockSearch = {
  create: jest.fn().mockReturnValue({
    run: jest.fn().mockReturnValue({
      each: jest.fn()
    })
  }),
  createColumn: jest.fn((opts) => opts),
  Type: { INVOICE: 'invoice' }
};

const mockRecord = {
  create: jest.fn(),
  load: jest.fn()
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
  path.join(__dirname, '../../src/FileCabinet/SuiteScripts/OrderToCash/MapReduce/OTC_MR_ARAgingSummary.js'),
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

describe('OTC_MR_ARAgingSummary', () => {
  let script;

  beforeEach(() => {
    jest.clearAllMocks();
    script = scriptFactory(mockSearch, mockRecord, utils);
  });

  describe('getInputData', () => {
    it('should return a search object for open invoices', () => {
      const result = script.getInputData();

      expect(mockSearch.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'invoice' })
      );

      expect(global.log.audit).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'AR Aging Summary - getInputData' })
      );

      expect(result).toBeDefined();
    });
  });

  describe('map', () => {
    it('should write invoice data with aging bucket', () => {
      const pastDue = new Date();
      pastDue.setDate(pastDue.getDate() - 45);

      const mockContext = {
        key: '1',
        value: JSON.stringify({
          values: {
            'internalid.customer': { value: '123' },
            'companyname.customer': 'Test Customer',
            duedate: pastDue.toISOString().split('T')[0],
            amountremaining: '1500.00',
            tranid: 'INV-001',
            internalid: { value: '456' }
          }
        }),
        write: jest.fn()
      };

      script.map(mockContext);

      expect(mockContext.write).toHaveBeenCalledWith({
        key: '123',
        value: expect.stringContaining('INV-001')
      });

      const writtenValue = JSON.parse(mockContext.write.mock.calls[0][0].value);
      expect(writtenValue.agingBucket).toBe('31-60 Days');
    });

    it('should skip invoices without customer ID', () => {
      const mockContext = {
        key: '1',
        value: JSON.stringify({
          values: {
            'internalid.customer': null,
            duedate: '2024-01-01',
            amountremaining: '1000'
          }
        }),
        write: jest.fn()
      };

      script.map(mockContext);
      expect(mockContext.write).not.toHaveBeenCalled();
    });

    it('should log errors and continue processing', () => {
      const mockContext = {
        key: '1',
        value: 'invalid json',
        write: jest.fn()
      };

      script.map(mockContext);

      expect(global.log.error).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Map Error' })
      );
    });
  });

  describe('reduce', () => {
    it('should aggregate aging buckets correctly', () => {
      const mockAgingRecord = {
        setValue: jest.fn(),
        save: jest.fn().mockReturnValue('789')
      };

      mockRecord.create.mockReturnValue(mockAgingRecord);
      mockSearch.create.mockReturnValue({
        run: jest.fn().mockReturnValue({
          each: jest.fn()
        })
      });

      const mockContext = {
        key: '123',
        values: [
          JSON.stringify({
            invoiceId: '1',
            tranId: 'INV-001',
            amountRemaining: 1000,
            daysOverdue: 15,
            agingBucket: '1-30 Days',
            customerName: 'Test Corp'
          }),
          JSON.stringify({
            invoiceId: '2',
            tranId: 'INV-002',
            amountRemaining: 2000,
            daysOverdue: 45,
            agingBucket: '31-60 Days',
            customerName: 'Test Corp'
          }),
          JSON.stringify({
            invoiceId: '3',
            tranId: 'INV-003',
            amountRemaining: 500,
            daysOverdue: -5,
            agingBucket: 'Current',
            customerName: 'Test Corp'
          })
        ],
        write: jest.fn()
      };

      script.reduce(mockContext);

      expect(mockRecord.create).toHaveBeenCalledWith({
        type: 'customrecord_otc_ar_aging'
      });

      expect(mockAgingRecord.setValue).toHaveBeenCalledWith({
        fieldId: 'custrecord_otc_aging_current',
        value: 500
      });

      expect(mockAgingRecord.setValue).toHaveBeenCalledWith({
        fieldId: 'custrecord_otc_aging_1_30',
        value: 1000
      });

      expect(mockAgingRecord.setValue).toHaveBeenCalledWith({
        fieldId: 'custrecord_otc_aging_31_60',
        value: 2000
      });

      expect(mockAgingRecord.setValue).toHaveBeenCalledWith({
        fieldId: 'custrecord_otc_aging_total',
        value: 3500
      });

      expect(mockAgingRecord.setValue).toHaveBeenCalledWith({
        fieldId: 'custrecord_otc_aging_invoice_count',
        value: 3
      });

      expect(mockAgingRecord.save).toHaveBeenCalled();
    });

    it('should update existing record if found', () => {
      const mockAgingRecord = {
        setValue: jest.fn(),
        save: jest.fn().mockReturnValue('789')
      };

      mockRecord.load.mockReturnValue(mockAgingRecord);
      mockSearch.create.mockReturnValue({
        run: jest.fn().mockReturnValue({
          each: jest.fn((callback) => {
            callback({ id: '999' });
          })
        })
      });

      const mockContext = {
        key: '123',
        values: [
          JSON.stringify({
            amountRemaining: 1000,
            daysOverdue: 15,
            agingBucket: '1-30 Days',
            customerName: 'Test Corp'
          })
        ],
        write: jest.fn()
      };

      script.reduce(mockContext);

      expect(mockRecord.load).toHaveBeenCalledWith({
        type: 'customrecord_otc_ar_aging',
        id: '999'
      });
    });

    it('should write error on failure', () => {
      mockSearch.create.mockImplementation(() => {
        throw new Error('Search failed');
      });

      const mockContext = {
        key: '123',
        values: [
          JSON.stringify({
            amountRemaining: 1000,
            daysOverdue: 15,
            agingBucket: '1-30 Days',
            customerName: 'Test Corp'
          })
        ],
        write: jest.fn()
      };

      script.reduce(mockContext);

      expect(mockContext.write).toHaveBeenCalledWith({
        key: '123',
        value: expect.stringContaining('"success":false')
      });
    });
  });

  describe('summarize', () => {
    it('should log summary statistics', () => {
      const mockSummary = {
        dateCreated: new Date(),
        seconds: 30,
        usage: 500,
        concurrency: 1,
        yields: 0,
        inputSummary: { error: null },
        mapSummary: {
          errors: {
            iterator: jest.fn().mockReturnValue({ each: jest.fn() })
          }
        },
        reduceSummary: {
          errors: {
            iterator: jest.fn().mockReturnValue({ each: jest.fn() })
          }
        },
        output: {
          iterator: jest.fn().mockReturnValue({
            each: jest.fn((callback) => {
              callback('123', JSON.stringify({ success: true }));
              callback('456', JSON.stringify({ success: true }));
              return true;
            })
          })
        }
      };

      script.summarize(mockSummary);

      expect(global.log.audit).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'AR Aging Summary - Summarize' })
      );

      expect(global.log.audit).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Processing Results' })
      );
    });

    it('should log input errors', () => {
      const mockSummary = {
        dateCreated: new Date(),
        seconds: 30,
        usage: 500,
        concurrency: 1,
        yields: 0,
        inputSummary: { error: 'Input search failed' },
        mapSummary: {
          errors: {
            iterator: jest.fn().mockReturnValue({ each: jest.fn() })
          }
        },
        reduceSummary: {
          errors: {
            iterator: jest.fn().mockReturnValue({ each: jest.fn() })
          }
        },
        output: {
          iterator: jest.fn().mockReturnValue({
            each: jest.fn()
          })
        }
      };

      script.summarize(mockSummary);

      expect(global.log.error).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Input Error',
          details: 'Input search failed'
        })
      );
    });
  });
});
