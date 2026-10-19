/**
 * Unit Tests for OTC_UE_SalesOrder
 * Tests User Event script entry points for Sales Order
 */

const fs = require('fs');
const path = require('path');

// Mock N/ modules
const mockRecord = {
  create: jest.fn(),
  Type: { TASK: 'task' }
};

const mockSearch = {
  lookupFields: jest.fn(),
  Type: { CUSTOMER: 'customer' }
};

const mockServerWidget = {
  FieldType: { INLINEHTML: 'inlinehtml' }
};

const mockRuntime = {
  getCurrentScript: jest.fn(() => ({
    getParameter: jest.fn().mockReturnValue(null)
  }))
};

const mockError = {
  create: jest.fn((opts) => {
    const err = new Error(opts.message);
    err.name = opts.name;
    return err;
  })
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
  path.join(__dirname, '../../src/FileCabinet/SuiteScripts/OrderToCash/UserEvent/OTC_UE_SalesOrder.js'),
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

describe('OTC_UE_SalesOrder', () => {
  let script;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRuntime.getCurrentScript.mockReturnValue({
      getParameter: jest.fn().mockReturnValue(null)
    });
    script = scriptFactory(mockRecord, mockSearch, mockServerWidget, mockRuntime, mockError, utils);
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

      mockSearch.lookupFields.mockReturnValue({
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

      mockSearch.lookupFields.mockReturnValue({
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
      expect(mockError.create).toHaveBeenCalledWith(
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

      mockSearch.lookupFields.mockReturnValue({
        creditlimit: '10000',
        balance: '5000'
      });

      expect(() => script.beforeSubmit(context)).toThrow();
      expect(mockError.create).toHaveBeenCalledWith(
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

      mockSearch.lookupFields.mockReturnValue({
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

      mockSearch.lookupFields.mockReturnValue({
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

      mockSearch.lookupFields.mockReturnValue({
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
      expect(mockRecord.create).not.toHaveBeenCalled();
    });

    it('should skip for small orders', () => {
      const context = {
        type: 'create',
        UserEventType: { CREATE: 'create', EDIT: 'edit' },
        newRecord: { getValue: jest.fn().mockReturnValue(5000) }
      };

      script.afterSubmit(context);
      expect(mockRecord.create).not.toHaveBeenCalled();
    });

    it('should create task for large orders', () => {
      const mockTask = {
        setValue: jest.fn(),
        save: jest.fn().mockReturnValue(456)
      };
      mockRecord.create.mockReturnValue(mockTask);

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

      expect(mockRecord.create).toHaveBeenCalledWith({
        type: 'task',
        isDynamic: true
      });
      expect(mockTask.save).toHaveBeenCalled();
      expect(global.log.audit).toHaveBeenCalled();
    });

    it('should use custom threshold from script parameter', () => {
      mockRuntime.getCurrentScript.mockReturnValue({
        getParameter: jest.fn((opts) => {
          if (opts.name === 'custscript_otc_large_order_amt') return 5000;
          return null;
        })
      });

      const mockTask = {
        setValue: jest.fn(),
        save: jest.fn().mockReturnValue(456)
      };
      mockRecord.create.mockReturnValue(mockTask);

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

      script = scriptFactory(mockRecord, mockSearch, mockServerWidget, mockRuntime, mockError, utils);
      script.afterSubmit(context);

      expect(mockRecord.create).toHaveBeenCalled();
    });
  });
});
