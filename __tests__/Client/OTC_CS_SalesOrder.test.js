/**
 * Unit Tests for OTC_CS_SalesOrder
 * Tests Client Script entry points for Sales Order
 */

// Mock N/ modules before requiring the script
jest.mock('N/currentRecord', () => ({}), { virtual: true });

jest.mock('N/dialog', () => ({
  alert: jest.fn().mockResolvedValue(true),
  confirm: jest.fn().mockResolvedValue(true)
}), { virtual: true });

// Get mocked modules
const dialog = require('N/dialog');

// Load the script under test
const script = require('../../src/FileCabinet/SuiteScripts/OrderToCash/Client/OTC_CS_SalesOrder');

describe('OTC_CS_SalesOrder', () => {

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('pageInit', () => {
    it('should set default values for CREATE mode', () => {
      const mockRecord = {
        type: 'salesorder',
        getValue: jest.fn().mockReturnValue(null),
        setValue: jest.fn()
      };
      const context = {
        mode: 'create',
        currentRecord: mockRecord
      };

      script.pageInit(context);

      // Should set default date and memo
      expect(mockRecord.setValue).toHaveBeenCalled();
      expect(global.log.debug).toHaveBeenCalled();
    });

    it('should skip initialization for non-CREATE mode', () => {
      const mockRecord = {
        type: 'salesorder',
        setValue: jest.fn()
      };
      const context = {
        mode: 'edit',
        currentRecord: mockRecord
      };

      script.pageInit(context);
      expect(mockRecord.setValue).not.toHaveBeenCalled();
    });
  });

  describe('fieldChanged', () => {
    it('should log when customer changes', () => {
      const context = {
        fieldId: 'entity',
        currentRecord: {
          getValue: jest.fn().mockReturnValue(123)
        }
      };

      script.fieldChanged(context);

      expect(global.log.debug).toHaveBeenCalled();
    });

    it('should handle no customer selected', () => {
      const context = {
        fieldId: 'entity',
        currentRecord: {
          getValue: jest.fn().mockReturnValue(null)
        }
      };

      script.fieldChanged(context);
      // Should not throw
      expect(() => script.fieldChanged(context)).not.toThrow();
    });

    it('should calculate discount on quantity change', () => {
      const context = {
        fieldId: 'quantity',
        sublistId: 'item',
        line: 0,
        currentRecord: {
          getCurrentSublistValue: jest.fn((opts) => {
            if (opts.fieldId === 'quantity') return 100;
            if (opts.fieldId === 'rate') return 50;
            return null;
          })
        }
      };

      script.fieldChanged(context);
      // Script calculates but doesn't set - just logs
      expect(global.log.debug).toHaveBeenCalled();
    });
  });

  describe('validateLine', () => {
    it('should allow valid line items', () => {
      const context = {
        sublistId: 'item',
        currentRecord: {
          getCurrentSublistValue: jest.fn((opts) => {
            if (opts.fieldId === 'item') return 100;
            if (opts.fieldId === 'quantity') return 5;
            if (opts.fieldId === 'rate') return 50;
            return null;
          })
        }
      };

      expect(script.validateLine(context)).toBe(true);
    });

    it('should reject line with missing item', () => {
      const context = {
        sublistId: 'item',
        currentRecord: {
          getCurrentSublistValue: jest.fn((opts) => {
            if (opts.fieldId === 'item') return null;
            if (opts.fieldId === 'quantity') return 5;
            if (opts.fieldId === 'rate') return 50;
            return null;
          })
        }
      };

      expect(script.validateLine(context)).toBe(false);
      expect(dialog.alert).toHaveBeenCalled();
    });

    it('should reject line with zero quantity', () => {
      const context = {
        sublistId: 'item',
        currentRecord: {
          getCurrentSublistValue: jest.fn((opts) => {
            if (opts.fieldId === 'item') return 100;
            if (opts.fieldId === 'quantity') return 0;
            if (opts.fieldId === 'rate') return 50;
            return null;
          })
        }
      };

      expect(script.validateLine(context)).toBe(false);
      expect(dialog.alert).toHaveBeenCalled();
    });

    it('should reject line with negative rate', () => {
      const context = {
        sublistId: 'item',
        currentRecord: {
          getCurrentSublistValue: jest.fn((opts) => {
            if (opts.fieldId === 'item') return 100;
            if (opts.fieldId === 'quantity') return 5;
            if (opts.fieldId === 'rate') return -10;
            return null;
          })
        }
      };

      expect(script.validateLine(context)).toBe(false);
      expect(dialog.alert).toHaveBeenCalled();
    });

    it('should skip validation for non-item sublists', () => {
      const context = {
        sublistId: 'other',
        currentRecord: {
          getCurrentSublistValue: jest.fn()
        }
      };

      expect(script.validateLine(context)).toBe(true);
      expect(context.currentRecord.getCurrentSublistValue).not.toHaveBeenCalled();
    });
  });

  describe('saveRecord', () => {
    it('should allow save when all required fields are present', () => {
      const context = {
        currentRecord: {
          getValue: jest.fn((opts) => {
            if (opts.fieldId === 'entity') return 123;
            if (opts.fieldId === 'trandate') return new Date();
            if (opts.fieldId === 'total') return 100;
            return null;
          }),
          getLineCount: jest.fn().mockReturnValue(1)
        }
      };

      expect(script.saveRecord(context)).toBe(true);
    });

    it('should prevent save when customer is missing', () => {
      const context = {
        currentRecord: {
          getValue: jest.fn((opts) => {
            if (opts.fieldId === 'entity') return null;
            if (opts.fieldId === 'trandate') return new Date();
            if (opts.fieldId === 'total') return 100;
            return null;
          }),
          getLineCount: jest.fn().mockReturnValue(1)
        }
      };

      expect(script.saveRecord(context)).toBe(false);
      expect(dialog.alert).toHaveBeenCalled();
    });

    it('should prevent save when no line items', () => {
      const context = {
        currentRecord: {
          getValue: jest.fn((opts) => {
            if (opts.fieldId === 'entity') return 123;
            if (opts.fieldId === 'trandate') return new Date();
            if (opts.fieldId === 'total') return 100;
            return null;
          }),
          getLineCount: jest.fn().mockReturnValue(0)
        }
      };

      expect(script.saveRecord(context)).toBe(false);
    });

    it('should prevent save when total is zero', () => {
      const context = {
        currentRecord: {
          getValue: jest.fn((opts) => {
            if (opts.fieldId === 'entity') return 123;
            if (opts.fieldId === 'trandate') return new Date();
            if (opts.fieldId === 'total') return 0;
            return null;
          }),
          getLineCount: jest.fn().mockReturnValue(1)
        }
      };

      expect(script.saveRecord(context)).toBe(false);
    });
  });
});
