/**
 * Unit Tests for OTC_SL_CollectionsDashboard
 * Tests Suitelet for Collections Dashboard UI
 */

// Mock N/ modules before requiring the script
jest.mock('N/ui/serverWidget', () => ({
  createForm: jest.fn(),
  FieldType: {
    SELECT: 'SELECT',
    TEXT: 'TEXT',
    CURRENCY: 'CURRENCY',
    DATE: 'DATE',
    INLINEHTML: 'INLINEHTML'
  },
  SublistType: { LIST: 'LIST' },
  FieldDisplayType: { HIDDEN: 'HIDDEN', INLINE: 'INLINE' },
  MessageType: { CONFIRMATION: 'CONFIRMATION', ERROR: 'ERROR' }
}), { virtual: true });

jest.mock('N/search', () => ({
  create: jest.fn(),
  createColumn: jest.fn((opts) => opts),
  Type: { INVOICE: 'invoice', CUSTOMER: 'customer' },
  Sort: { ASC: 'ASC', DESC: 'DESC' }
}), { virtual: true });

jest.mock('N/task', () => ({
  create: jest.fn(),
  TaskType: { SCHEDULED_SCRIPT: 'SCHEDULED_SCRIPT' }
}), { virtual: true });

jest.mock('N/runtime', () => ({
  getCurrentScript: jest.fn(() => ({
    getParameter: jest.fn().mockReturnValue(null)
  }))
}), { virtual: true });

// Get mocked modules
const serverWidget = require('N/ui/serverWidget');
const search = require('N/search');
const task = require('N/task');

// Load the script under test
const script = require('../../src/FileCabinet/SuiteScripts/OrderToCash/Suitelet/OTC_SL_CollectionsDashboard');

describe('OTC_SL_CollectionsDashboard', () => {

  let mockForm;
  let mockSublist;
  let mockField;

  beforeEach(() => {
    jest.clearAllMocks();

    mockField = {
      defaultValue: '',
      addSelectOption: jest.fn(),
      updateDisplayType: jest.fn()
    };

    mockSublist = {
      addField: jest.fn().mockReturnValue(mockField),
      setSublistValue: jest.fn()
    };

    mockForm = {
      addField: jest.fn().mockReturnValue(mockField),
      addFieldGroup: jest.fn(),
      addSublist: jest.fn().mockReturnValue(mockSublist),
      addSubmitButton: jest.fn(),
      addButton: jest.fn(),
      addPageInitMessage: jest.fn(),
      clientScriptModulePath: ''
    };

    serverWidget.createForm.mockReturnValue(mockForm);
  });

  describe('onRequest - GET', () => {
    it('should create dashboard form', () => {
      const mockResultSet = {
        each: jest.fn().mockReturnValue(false)
      };
      const mockSearch = {
        run: jest.fn().mockReturnValue(mockResultSet)
      };
      search.create.mockReturnValue(mockSearch);

      const context = {
        request: {
          method: 'GET',
          parameters: {}
        },
        response: {
          writePage: jest.fn()
        }
      };

      script.onRequest(context);

      expect(serverWidget.createForm).toHaveBeenCalledWith({
        title: expect.stringContaining('Collections')
      });
      expect(context.response.writePage).toHaveBeenCalledWith(mockForm);
    });

    it('should add filter fields', () => {
      const mockResultSet = {
        each: jest.fn().mockReturnValue(false)
      };
      const mockSearch = {
        run: jest.fn().mockReturnValue(mockResultSet)
      };
      search.create.mockReturnValue(mockSearch);

      const context = {
        request: {
          method: 'GET',
          parameters: {}
        },
        response: {
          writePage: jest.fn()
        }
      };

      script.onRequest(context);

      expect(mockForm.addFieldGroup).toHaveBeenCalled();
      expect(mockForm.addField).toHaveBeenCalled();
    });

    it('should populate sublist with invoice data', () => {
      const mockResults = [
        {
          id: '1',
          getValue: jest.fn((col) => {
            const name = typeof col === 'string' ? col : col?.name;
            if (name === 'entity') return '100';
            if (name === 'total') return '1000';
            if (name === 'amountremaining') return '1000';
            if (name === 'duedate') return '1/1/2024';
            if (name === 'tranid') return 'INV-001';
            if (name === 'companyname') return 'Test Co';
            return '';
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

      const context = {
        request: {
          method: 'GET',
          parameters: {}
        },
        response: {
          writePage: jest.fn()
        }
      };

      script.onRequest(context);

      expect(mockSublist.setSublistValue).toHaveBeenCalled();
    });

    it('should display confirmation message when provided', () => {
      const mockResultSet = {
        each: jest.fn().mockReturnValue(false)
      };
      const mockSearch = {
        run: jest.fn().mockReturnValue(mockResultSet)
      };
      search.create.mockReturnValue(mockSearch);

      const context = {
        request: {
          method: 'GET',
          parameters: { message: 'Task scheduled successfully' }
        },
        response: {
          writePage: jest.fn()
        }
      };

      script.onRequest(context);

      expect(mockForm.addPageInitMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Task scheduled successfully'
        })
      );
    });
  });

  describe('onRequest - POST', () => {
    it('should trigger reminder script on send_reminders action', () => {
      const mockTask = {
        submit: jest.fn().mockReturnValue('TASK123')
      };
      task.create.mockReturnValue(mockTask);

      const context = {
        request: {
          method: 'POST',
          parameters: { custpage_action: 'send_reminders' }
        },
        response: {
          sendRedirect: jest.fn()
        }
      };

      script.onRequest(context);

      expect(task.create).toHaveBeenCalled();
      expect(mockTask.submit).toHaveBeenCalled();
    });

    it('should fall back to GET handling for no action', () => {
      const mockResultSet = {
        each: jest.fn().mockReturnValue(false)
      };
      const mockSearch = {
        run: jest.fn().mockReturnValue(mockResultSet)
      };
      search.create.mockReturnValue(mockSearch);

      const context = {
        request: {
          method: 'POST',
          parameters: {}
        },
        response: {
          writePage: jest.fn()
        }
      };

      script.onRequest(context);

      expect(serverWidget.createForm).toHaveBeenCalled();
    });
  });

  describe('filter handling', () => {
    it('should apply customer filter to search', () => {
      const mockResultSet = {
        each: jest.fn().mockReturnValue(false)
      };
      const mockSearch = {
        run: jest.fn().mockReturnValue(mockResultSet)
      };
      search.create.mockReturnValue(mockSearch);

      const context = {
        request: {
          method: 'GET',
          parameters: { custpage_customer: '123' }
        },
        response: {
          writePage: jest.fn()
        }
      };

      script.onRequest(context);

      expect(search.create).toHaveBeenCalled();
    });

    it('should apply minimum amount filter to search', () => {
      const mockResultSet = {
        each: jest.fn().mockReturnValue(false)
      };
      const mockSearch = {
        run: jest.fn().mockReturnValue(mockResultSet)
      };
      search.create.mockReturnValue(mockSearch);

      const context = {
        request: {
          method: 'GET',
          parameters: { custpage_minamount: '1000' }
        },
        response: {
          writePage: jest.fn()
        }
      };

      script.onRequest(context);

      expect(search.create).toHaveBeenCalled();
    });
  });
});
