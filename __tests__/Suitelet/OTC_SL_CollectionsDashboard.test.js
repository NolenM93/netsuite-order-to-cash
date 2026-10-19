/**
 * Unit Tests for OTC_SL_CollectionsDashboard
 * Tests Suitelet for Collections Dashboard
 */

// Mock N/ modules
let mockSearchResults = [];
const mockServerWidget = {
  createForm: jest.fn(),
  FieldType: {
    SELECT: 'select',
    CURRENCY: 'currency',
    TEXT: 'text',
    DATE: 'date',
    INTEGER: 'integer',
    URL: 'url'
  },
  SublistType: {
    LIST: 'list'
  },
  FieldDisplayType: {
    HIDDEN: 'hidden',
    INLINE: 'inline'
  },
  MessageType: {
    CONFIRMATION: 'confirmation'
  }
};

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
  Type: { INVOICE: 'invoice' },
  Sort: { ASC: 'asc' }
};

const mockUrl = {
  resolveRecord: jest.fn().mockReturnValue('/app/accounting/transactions/invoice.nl?id=123')
};

const mockRedirect = {
  toSuitelet: jest.fn()
};

const mockTask = {
  create: jest.fn().mockReturnValue({
    submit: jest.fn().mockReturnValue('TASK123')
  }),
  TaskType: { SCHEDULED_SCRIPT: 'SCHEDULED_SCRIPT' }
};

const mockRuntime = {
  getCurrentScript: jest.fn(() => ({
    id: 'customscript_test',
    deploymentId: 'customdeploy_test'
  }))
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
  path.join(__dirname, '../../src/FileCabinet/SuiteScripts/OrderToCash/Suitelet/OTC_SL_CollectionsDashboard.js'),
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

describe('OTC_SL_CollectionsDashboard', () => {
  let script;
  let mockForm;
  let mockSublist;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchResults = [];

    mockSublist = {
      addField: jest.fn().mockReturnValue({ linkText: '' }),
      setSublistValue: jest.fn()
    };

    mockForm = {
      addFieldGroup: jest.fn(),
      addField: jest.fn().mockReturnValue({
        addSelectOption: jest.fn(),
        defaultValue: '',
        isMandatory: false,
        updateDisplayType: jest.fn()
      }),
      addButton: jest.fn(),
      addSubmitButton: jest.fn(),
      addSublist: jest.fn().mockReturnValue(mockSublist),
      addPageInitMessage: jest.fn(),
      clientScriptModulePath: ''
    };

    mockServerWidget.createForm.mockReturnValue(mockForm);

    script = scriptFactory(
      mockServerWidget, mockSearch, mockUrl, mockRedirect,
      mockTask, mockRuntime, utils
    );
  });

  describe('onRequest - GET', () => {
    it('should create dashboard form', () => {
      const mockResponse = {
        writePage: jest.fn()
      };

      const context = {
        request: {
          method: 'GET',
          parameters: {}
        },
        response: mockResponse
      };

      script.onRequest(context);

      expect(mockServerWidget.createForm).toHaveBeenCalledWith({
        title: 'Collections Dashboard'
      });
      expect(mockResponse.writePage).toHaveBeenCalledWith(mockForm);
    });

    it('should add filter fields', () => {
      const mockResponse = {
        writePage: jest.fn()
      };

      const context = {
        request: {
          method: 'GET',
          parameters: {}
        },
        response: mockResponse
      };

      script.onRequest(context);

      expect(mockForm.addFieldGroup).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'custpage_filters'
        })
      );

      expect(mockForm.addField).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'custpage_customer',
          type: 'select'
        })
      );

      expect(mockForm.addField).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'custpage_aging',
          type: 'select'
        })
      );
    });

    it('should add invoice sublist', () => {
      const mockResponse = {
        writePage: jest.fn()
      };

      const context = {
        request: {
          method: 'GET',
          parameters: {}
        },
        response: mockResponse
      };

      script.onRequest(context);

      expect(mockForm.addSublist).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'custpage_invoices',
          type: 'list',
          label: 'Overdue Invoices'
        })
      );
    });

    it('should populate sublist with search results', () => {
      const pastDue = new Date();
      pastDue.setDate(pastDue.getDate() - 20);

      mockSearchResults = [{
        id: '123',
        getValue: jest.fn((opts) => {
          if (opts.name === 'tranid') return 'INV-001';
          if (opts.name === 'entity') return '456';
          if (opts.name === 'duedate') return pastDue.toISOString().split('T')[0];
          if (opts.name === 'amountremaining') return '1500.00';
          if (opts.name === 'companyname' && opts.join === 'customer') return 'Test Corp';
          if (opts.name === 'email' && opts.join === 'customer') return 'test@example.com';
          return null;
        }),
        getText: jest.fn().mockReturnValue('Test Corp')
      }];

      const mockResponse = {
        writePage: jest.fn()
      };

      const context = {
        request: {
          method: 'GET',
          parameters: {}
        },
        response: mockResponse
      };

      script.onRequest(context);

      expect(mockSublist.setSublistValue).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'custpage_inv_number',
          line: 0,
          value: 'INV-001'
        })
      );
    });

    it('should display confirmation message when provided', () => {
      const mockResponse = {
        writePage: jest.fn()
      };

      const context = {
        request: {
          method: 'GET',
          parameters: {
            message: 'Reminders sent successfully'
          }
        },
        response: mockResponse
      };

      script.onRequest(context);

      expect(mockForm.addPageInitMessage).toHaveBeenCalledWith({
        type: 'confirmation',
        message: 'Reminders sent successfully'
      });
    });
  });

  describe('onRequest - POST', () => {
    it('should trigger reminder script on send_reminders action', () => {
      const mockResponse = {
        writePage: jest.fn()
      };

      const context = {
        request: {
          method: 'POST',
          parameters: {
            custpage_action: 'send_reminders'
          }
        },
        response: mockResponse
      };

      script.onRequest(context);

      expect(mockTask.create).toHaveBeenCalledWith(
        expect.objectContaining({
          taskType: 'SCHEDULED_SCRIPT',
          scriptId: 'customscript_otc_ss_overdue_reminder'
        })
      );

      expect(mockRedirect.toSuitelet).toHaveBeenCalled();
    });

    it('should fall back to GET handling for unknown action', () => {
      const mockResponse = {
        writePage: jest.fn()
      };

      const context = {
        request: {
          method: 'POST',
          parameters: {
            custpage_action: 'unknown'
          }
        },
        response: mockResponse
      };

      script.onRequest(context);

      expect(mockServerWidget.createForm).toHaveBeenCalled();
      expect(mockResponse.writePage).toHaveBeenCalled();
    });
  });

  describe('filter handling', () => {
    it('should apply customer filter to search', () => {
      const mockResponse = {
        writePage: jest.fn()
      };

      const context = {
        request: {
          method: 'GET',
          parameters: {
            custpage_customer: '789'
          }
        },
        response: mockResponse
      };

      script.onRequest(context);

      expect(mockSearch.create).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: expect.arrayContaining([
            ['entity', 'anyof', '789']
          ])
        })
      );
    });

    it('should apply minimum amount filter to search', () => {
      const mockResponse = {
        writePage: jest.fn()
      };

      const context = {
        request: {
          method: 'GET',
          parameters: {
            custpage_min_amount: '1000'
          }
        },
        response: mockResponse
      };

      script.onRequest(context);

      expect(mockSearch.create).toHaveBeenCalledWith(
        expect.objectContaining({
          filters: expect.arrayContaining([
            ['amountremaining', 'greaterthanorequalto', '1000']
          ])
        })
      );
    });
  });
});
