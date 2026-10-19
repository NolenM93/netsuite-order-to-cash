/**
 * Unit Tests for OTC_CS_SalesOrder
 * Tests Client Script entry points for Sales Order
 */

// Mock N/ modules
const mockCurrentRecord = {};

const mockDialog = {
  alert: jest.fn()
};

const mockRuntime = {
  getCurrentUser: jest.fn(() => ({ id: 1 }))
};

// Load utils module
const fs = require('fs');
const path = require('path');

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
  path.join(__dirname, '../../src/FileCabinet/SuiteScripts/OrderToCash/Client/OTC_CS_SalesOrder.js'),
  'utf8'
);

let scriptFactory;
// eslint-disable-next-line no-unused-vars
const mockDefine = (deps, factory) => {
  scriptFactory = factory;
};

// Mock log globally
global.log = {
  debug: jest.fn(),
  audit: jest.fn(),
  error: jest.fn()
};

eval(scriptContent.replace('define(', 'mockDefine('));

describe('OTC_CS_SalesOrder', () => {
  let script;

  beforeEach(() => {
    jest.clearAllMocks();
    script = scriptFactory(mockCurrentRecord, mockDialog, mockRuntime, utils);
  });

  describe('pageInit', () => {
    it('should set defaults for create mode', () => {
      const mockRecord = {
        getValue: jest.fn().mockReturnValue(null),
        setValue: jest.fn()
      };

      const context = {
        currentRecord: mockRecord,
        mode: 'create'
      };

      script.pageInit(context);

      expect(mockRecord.setValue).toHaveBeenCalledWith(
        expect.objectContaining({
          fieldId: 'trandate'
        })
      );
      expect(mockRecord.setValue).toHaveBeenCalledWith(
        expect.objectContaining({
          fieldId: 'memo',
          value: 'Order created via Order-to-Cash Toolkit'
        })
      );
    });

    it('should skip defaults for edit mode', () => {
      const mockRecord = {
        getValue: jest.fn(),
        setValue: jest.fn()
      };

      const context = {
        currentRecord: mockRecord,
        mode: 'edit'
      };

      script.pageInit(context);

      expect(mockRecord.setValue).not.toHaveBeenCalled();
    });

    it('should not override existing values', () => {
      const mockRecord = {
        getValue: jest.fn().mockImplementation((opts) => {
          if (opts.fieldId === 'trandate') return new Date();
          if (opts.fieldId === 'memo') return 'Existing memo';
          return null;
        }),
        setValue: jest.fn()
      };

      const context = {
        currentRecord: mockRecord,
        mode: 'create'
      };

      script.pageInit(context);

      expect(mockRecord.setValue).not.toHaveBeenCalled();
    });
  });

  describe('fieldChanged', () => {
    it('should handle quantity change on item sublist', () => {
      const mockRecord = {
        getCurrentSublistValue: jest.fn().mockImplementation((opts) => {
          if (opts.fieldId === 'quantity') return 100;
          if (opts.fieldId === 'rate') return 50;
          return null;
        })
      };

      const context = {
        currentRecord: mockRecord,
        fieldId: 'quantity',
        sublistId: 'item',
        line: 0
      };

      script.fieldChanged(context);

      expect(global.log.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Discount Applied'
        })
      );
    });

    it('should handle customer change', () => {
      const mockRecord = {
        getValue: jest.fn().mockReturnValue(123)
      };

      const context = {
        currentRecord: mockRecord,
        fieldId: 'entity',
        sublistId: null
      };

      script.fieldChanged(context);

      expect(global.log.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Customer Selected',
          details: 'Customer ID: 123'
        })
      );
    });
  });

  describe('validateLine', () => {
    it('should return true for non-item sublists', () => {
      const context = {
        currentRecord: {},
        sublistId: 'partners'
      };

      expect(script.validateLine(context)).toBe(true);
    });

    it('should return false if no item selected', () => {
      const mockRecord = {
        getCurrentSublistValue: jest.fn().mockReturnValue(null)
      };

      const context = {
        currentRecord: mockRecord,
        sublistId: 'item'
      };

      const result = script.validateLine(context);

      expect(result).toBe(false);
      expect(mockDialog.alert).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Please select an item.'
        })
      );
    });

    it('should return false for zero quantity', () => {
      const mockRecord = {
        getCurrentSublistValue: jest.fn().mockImplementation((opts) => {
          if (opts.fieldId === 'item') return 123;
          if (opts.fieldId === 'quantity') return 0;
          return null;
        })
      };

      const context = {
        currentRecord: mockRecord,
        sublistId: 'item'
      };

      expect(script.validateLine(context)).toBe(false);
      expect(mockDialog.alert).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Please enter a valid quantity greater than zero.'
        })
      );
    });

    it('should return false for negative rate', () => {
      const mockRecord = {
        getCurrentSublistValue: jest.fn().mockImplementation((opts) => {
          if (opts.fieldId === 'item') return 123;
          if (opts.fieldId === 'quantity') return 10;
          if (opts.fieldId === 'rate') return -5;
          return null;
        })
      };

      const context = {
        currentRecord: mockRecord,
        sublistId: 'item'
      };

      expect(script.validateLine(context)).toBe(false);
      expect(mockDialog.alert).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Please enter a valid rate.'
        })
      );
    });

    it('should return true for valid line item', () => {
      const mockRecord = {
        getCurrentSublistValue: jest.fn().mockImplementation((opts) => {
          if (opts.fieldId === 'item') return 123;
          if (opts.fieldId === 'quantity') return 10;
          if (opts.fieldId === 'rate') return 50;
          return null;
        })
      };

      const context = {
        currentRecord: mockRecord,
        sublistId: 'item'
      };

      expect(script.validateLine(context)).toBe(true);
    });
  });

  describe('saveRecord', () => {
    it('should return false if no customer', () => {
      const mockRecord = {
        getValue: jest.fn().mockReturnValue(null)
      };

      const context = {
        currentRecord: mockRecord
      };

      expect(script.saveRecord(context)).toBe(false);
      expect(mockDialog.alert).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Please select a customer before saving.'
        })
      );
    });

    it('should return false if no line items', () => {
      const mockRecord = {
        getValue: jest.fn().mockImplementation((opts) => {
          if (opts.fieldId === 'entity') return 123;
          return null;
        }),
        getLineCount: jest.fn().mockReturnValue(0)
      };

      const context = {
        currentRecord: mockRecord
      };

      expect(script.saveRecord(context)).toBe(false);
      expect(mockDialog.alert).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Please add at least one item to the order.'
        })
      );
    });

    it('should return false if no transaction date', () => {
      const mockRecord = {
        getValue: jest.fn().mockImplementation((opts) => {
          if (opts.fieldId === 'entity') return 123;
          if (opts.fieldId === 'trandate') return null;
          return null;
        }),
        getLineCount: jest.fn().mockReturnValue(1)
      };

      const context = {
        currentRecord: mockRecord
      };

      expect(script.saveRecord(context)).toBe(false);
      expect(mockDialog.alert).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Please enter a transaction date.'
        })
      );
    });

    it('should return false for zero total', () => {
      const mockRecord = {
        getValue: jest.fn().mockImplementation((opts) => {
          if (opts.fieldId === 'entity') return 123;
          if (opts.fieldId === 'trandate') return new Date();
          if (opts.fieldId === 'total') return 0;
          return null;
        }),
        getLineCount: jest.fn().mockReturnValue(1)
      };

      const context = {
        currentRecord: mockRecord
      };

      expect(script.saveRecord(context)).toBe(false);
      expect(mockDialog.alert).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Order total must be greater than zero.'
        })
      );
    });

    it('should return true for valid record', () => {
      const mockRecord = {
        getValue: jest.fn().mockImplementation((opts) => {
          if (opts.fieldId === 'entity') return 123;
          if (opts.fieldId === 'trandate') return new Date();
          if (opts.fieldId === 'total') return 1000;
          return null;
        }),
        getLineCount: jest.fn().mockReturnValue(1)
      };

      const context = {
        currentRecord: mockRecord
      };

      expect(script.saveRecord(context)).toBe(true);
    });
  });
});
