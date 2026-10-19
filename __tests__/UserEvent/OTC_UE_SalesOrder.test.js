/**
 * Unit Tests for OTC_UE_SalesOrder
 * Tests User Event script entry points for Sales Order
 */

// Mock N/ modules before requiring the script
jest.mock('N/record', () => ({
  create: jest.fn(),
  Type: { TASK: 'task' }
}), { virtual: true });

jest.mock('N/search', () => ({
  lookupFields: jest.fn(),
  Type: { CUSTOMER: 'customer' }
}), { virtual: true });

jest.mock('N/ui/serverWidget', () => ({
  FieldType: { INLINEHTML: 'inlinehtml' }
}), { virtual: true });

jest.mock('N/runtime', () => ({
  getCurrentScript: jest.fn(() => ({
    getParameter: jest.fn().mockReturnValue(null)
  }))
}), { virtual: true });

jest.mock('N/error', () => ({
  create: jest.fn((opts) => {
    const err = new Error(opts.message);
    err.name = opts.name;
    return err;
  })
}), { virtual: true });

// Get mocked modules
const record = require('N/record');
const search = require('N/search');
const runtime = require('N/runtime');
const error = require('N/error');

// Load the script under test
const script = require('../../src/FileCabinet/SuiteScripts/OrderToCash/UserEvent/OTC_UE_SalesOrder');

describe('OTC_UE_SalesOrder', () => {

  beforeEach(() => {
    jest.clearAllMocks();
    runtime.getCurrentScript.mockReturnValue({
      getParameter: jest.fn().mockReturnValue(null)
    });
  });

  describe('beforeLoad', () => {
    it('should skip for CREATE context', () => {
      const context = {
        type: 'create',
        UserEventType: { CREATE: 'create', VIEW: 'view', EDIT: 'edit' },
        newRecord: { getValue: jest.fn() },
        form: { addField: jest.fn() }
      };

      script.beforeLoad(context);
      expect(context.form.addField).not.toHaveBeenCalled();
    });

    it('should add credit status field for VIEW context', () => {
      const mockField = { defaultValue: '' };
      const context = {
        type: 'view',
        UserEventType: { CREATE: 'create', VIEW: 'view', EDIT: 'edit' },
        newRecord: { getValue: jest.fn().mockReturnValue(123) },
        form: { addField: jest.fn().mockReturnValue(mockField) }
      };

      search.lookupFields.mockReturnValue({
        creditlimit: '10000',
        balance: '5000',
        companyname: 'Test Customer'
      });

      script.beforeLoad(context);

      expect(context.form.addField).toHaveBeenCalledWith({
        id: 'custpage_credit_status',
        type: 'inlinehtml',
        label: 'Credit Status'
      });
      expect(mockField.defaultValue).toContain('Good Standing');
    });

    it('should skip if no customer selected', () => {
      const context = {
        type: 'view',
        UserEventType: { CREATE: 'create', VIEW: 'view', EDIT: 'edit' },
        newRecord: { getValue: jest.fn().mockReturnValue(null) },
        form: { addField: jest.fn() }
      };

      script.beforeLoad(context);
      expect(context.form.addField).not.toHaveBeenCalled();
    });

    it('should escape HTML in status labels', () => {
      const mockField = { defaultValue: '' };
      const context = {
        type: 'view',
        UserEventType: { CREATE: 'create', VIEW: 'view', EDIT: 'edit' },
        newRecord: { getValue: jest.fn().mockReturnValue(123) },
        form: { addField: jest.fn().mockReturnValue(mockField) }
      };

      search.lookupFields.mockReturnValue({
        creditlimit: '10000',
        balance: '5000',
        companyname: '<script>alert("xss")</script>'
      });

      script.beforeLoad(context);

      expect(mockField.defaultValue).not.toContain('<script>');
    });
  });

  describe('beforeSubmit', () => {
    it('should skip for DELETE context', () => {
      const context = {
        type: 'delete',
        UserEventType: { CREATE: 'create', EDIT: 'edit', DELETE: 'delete' },
        newRecord: { getValue: jest.fn() }
      };

      expect(() => script.beforeSubmit(context)).not.toThrow();
    });

    it('should throw OTC_MISSING_FIELDS for missing customer', () => {
      const context = {
        type: 'create',
        UserEventType: { CREATE: 'create', EDIT: 'edit' },
        newRecord: {
          getValue: jest.fn((opts) => {
            if (opts.fieldId === 'entity') return null;
            if (opts.fieldId === 'trandate') return new Date();
            return null;
          }),
          getLineCount: jest.fn().mockReturnValue(1)
        }
      };

      expect(() => script.beforeSubmit(context)).toThrow();
      expect(error.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'OTC_MISSING_FIELDS' })
      );
    });

    it('should throw OTC_CREDIT_LIMIT_EXCEEDED when order exceeds limit', () => {
      const context = {
        type: 'create',
        UserEventType: { CREATE: 'create', EDIT: 'edit' },
        newRecord: {
          getValue: jest.fn((opts) => {
            if (opts.fieldId === 'entity') return 123;
            if (opts.fieldId === 'trandate') return new Date();
            if (opts.fieldId === 'total') return 8000;
            return null;
          }),
          getLineCount: jest.fn().mockReturnValue(1)
        }
      };

      search.lookupFields.mockReturnValue({
        creditlimit: '10000',
        balance: '5000'
      });

      expect(() => script.beforeSubmit(context)).toThrow();
      expect(error.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'OTC_CREDIT_LIMIT_EXCEEDED' })
      );
    });

    it('should skip credit check on EDIT when total unchanged', () => {
      const context = {
        type: 'edit',
        UserEventType: { CREATE: 'create', EDIT: 'edit' },
        newRecord: {
          getValue: jest.fn((opts) => {
            if (opts.fieldId === 'entity') return 123;
            if (opts.fieldId === 'trandate') return new Date();
            if (opts.fieldId === 'total') return 5000;
            return null;
          }),
          getLineCount: jest.fn().mockReturnValue(1)
        },
        oldRecord: {
          getValue: jest.fn((opts) => {
            if (opts.fieldId === 'entity') return 123;
            if (opts.fieldId === 'total') return 5000;
            return null;
          })
        }
      };

      search.lookupFields.mockReturnValue({
        creditlimit: '10000',
        balance: '8000'
      });

      expect(() => script.beforeSubmit(context)).not.toThrow();
    });

    it('should check credit on EDIT when total changed', () => {
      const context = {
        type: 'edit',
        UserEventType: { CREATE: 'create', EDIT: 'edit' },
        newRecord: {
          getValue: jest.fn((opts) => {
            if (opts.fieldId === 'entity') return 123;
            if (opts.fieldId === 'trandate') return new Date();
            if (opts.fieldId === 'total') return 8000;
            return null;
          }),
          getLineCount: jest.fn().mockReturnValue(1)
        },
        oldRecord: {
          getValue: jest.fn((opts) => {
            if (opts.fieldId === 'entity') return 123;
            if (opts.fieldId === 'total') return 2000;
            return null;
          })
        }
      };

      search.lookupFields.mockReturnValue({
        creditlimit: '10000',
        balance: '5000'
      });

      expect(() => script.beforeSubmit(context)).toThrow();
    });

    it('should skip credit check for customer with no credit limit', () => {
      const context = {
        type: 'edit',
        UserEventType: { CREATE: 'create', EDIT: 'edit' },
        newRecord: {
          getValue: jest.fn((opts) => {
            if (opts.fieldId === 'entity') return 123;
            if (opts.fieldId === 'trandate') return new Date();
            if (opts.fieldId === 'total') return 50000;
            return null;
          }),
          getLineCount: jest.fn().mockReturnValue(1)
        },
        oldRecord: {
          getValue: jest.fn((opts) => {
            if (opts.fieldId === 'entity') return 123;
            if (opts.fieldId === 'total') return 1000;
            return null;
          })
        }
      };

      search.lookupFields.mockReturnValue({
        creditlimit: '0',
        balance: '0'
      });

      expect(() => script.beforeSubmit(context)).not.toThrow();
    });
  });

  describe('afterSubmit', () => {
    it('should skip for EDIT context', () => {
      const context = {
        type: 'edit',
        UserEventType: { CREATE: 'create', EDIT: 'edit' },
        newRecord: { getValue: jest.fn() }
      };

      script.afterSubmit(context);
      expect(record.create).not.toHaveBeenCalled();
    });

    it('should skip for small orders', () => {
      const context = {
        type: 'create',
        UserEventType: { CREATE: 'create', EDIT: 'edit' },
        newRecord: { getValue: jest.fn().mockReturnValue(5000) }
      };

      script.afterSubmit(context);
      expect(record.create).not.toHaveBeenCalled();
    });

    it('should create task for large orders', () => {
      const mockTask = {
        setValue: jest.fn(),
        save: jest.fn().mockReturnValue(456)
      };
      record.create.mockReturnValue(mockTask);

      const context = {
        type: 'create',
        UserEventType: { CREATE: 'create', EDIT: 'edit' },
        newRecord: {
          id: 123,
          getValue: jest.fn((opts) => {
            if (opts.fieldId === 'total') return 15000;
            if (opts.fieldId === 'tranid') return 'SO-001';
            if (opts.fieldId === 'entity') return 100;
            if (opts.fieldId === 'salesrep') return 5;
            return null;
          })
        }
      };

      script.afterSubmit(context);

      expect(record.create).toHaveBeenCalledWith({
        type: 'task',
        isDynamic: true
      });
      expect(mockTask.save).toHaveBeenCalled();
      expect(global.log.audit).toHaveBeenCalled();
    });

    it('should use custom threshold from script parameter', () => {
      runtime.getCurrentScript.mockReturnValue({
        getParameter: jest.fn((opts) => {
          if (opts.name === 'custscript_otc_large_order_amt') return 5000;
          return null;
        })
      });

      const mockTask = {
        setValue: jest.fn(),
        save: jest.fn().mockReturnValue(456)
      };
      record.create.mockReturnValue(mockTask);

      const context = {
        type: 'create',
        UserEventType: { CREATE: 'create', EDIT: 'edit' },
        newRecord: {
          id: 123,
          getValue: jest.fn((opts) => {
            if (opts.fieldId === 'total') return 6000;
            if (opts.fieldId === 'tranid') return 'SO-001';
            if (opts.fieldId === 'entity') return 100;
            return null;
          })
        }
      };

      script.afterSubmit(context);

      expect(record.create).toHaveBeenCalled();
    });
  });
});
