/**
 * Unit Tests for OTC_RL_OrderAPI
 * Tests RESTlet for external order integration
 */

// Mock N/ modules before requiring the script
jest.mock('N/record', () => ({
  create: jest.fn(),
  load: jest.fn(),
  Type: { SALES_ORDER: 'salesorder', LEAD: 'lead', CUSTOMER: 'customer' }
}), { virtual: true });

jest.mock('N/search', () => ({
  create: jest.fn(),
  lookupFields: jest.fn(),
  Type: { SALES_ORDER: 'salesorder', CUSTOMER: 'customer' }
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
const error = require('N/error');

// Load the script under test
const script = require('../../src/FileCabinet/SuiteScripts/OrderToCash/RESTlet/OTC_RL_OrderAPI');

describe('OTC_RL_OrderAPI', () => {

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('get', () => {
    it('should return order details when found by orderId', () => {
      const mockOrder = {
        id: 123,
        getValue: jest.fn((opts) => {
          const fieldMap = {
            'tranid': 'SO-001',
            'status': 'Pending Fulfillment',
            'total': '1500',
            'trandate': null,
            'shipdate': null,
            'linkedtrackingnumbers': null
          };
          return fieldMap[opts.fieldId] ?? null;
        }),
        getText: jest.fn((opts) => {
          const fieldMap = {
            'status': 'Pending Fulfillment',
            'entity': 'Test Customer'
          };
          return fieldMap[opts.fieldId] ?? '';
        }),
        getLineCount: jest.fn().mockReturnValue(2),
        getSublistValue: jest.fn().mockReturnValue(1),
        getSublistText: jest.fn().mockReturnValue('Item 1')
      };
      record.load.mockReturnValue(mockOrder);

      const result = script.get({ orderId: '123' });

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.orderNumber).toBe('SO-001');
    });

    it('should return error when neither orderId nor orderNumber provided', () => {
      const result = script.get({});

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('OTC_MISSING_PARAMETER');
      expect(result.httpStatus).toBe(400);
    });

    it('should return error when order not found', () => {
      record.load.mockImplementation(() => {
        throw new Error('Record not found');
      });

      const result = script.get({ orderId: '999' });

      expect(result.success).toBe(false);
      expect(result.httpStatus).toBe(500);
    });

    it('should lookup by orderNumber when provided', () => {
      const mockSearchRun = {
        each: jest.fn((callback) => {
          callback({ id: '123', getValue: jest.fn() });
          return false;
        })
      };
      search.create.mockReturnValue({
        run: jest.fn().mockReturnValue(mockSearchRun)
      });

      const mockOrder = {
        id: 123,
        getValue: jest.fn((opts) => {
          const fieldMap = {
            'tranid': 'SO-001',
            'status': 'Pending Fulfillment',
            'total': '1500',
            'trandate': null,
            'shipdate': null,
            'linkedtrackingnumbers': null
          };
          return fieldMap[opts.fieldId] ?? null;
        }),
        getText: jest.fn((opts) => {
          const fieldMap = {
            'status': 'Pending Fulfillment',
            'entity': 'Test Customer'
          };
          return fieldMap[opts.fieldId] ?? '';
        }),
        getLineCount: jest.fn().mockReturnValue(1),
        getSublistValue: jest.fn().mockReturnValue(1),
        getSublistText: jest.fn().mockReturnValue('Item')
      };
      record.load.mockReturnValue(mockOrder);

      const result = script.get({ orderNumber: 'SO-001' });

      expect(search.create).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('should return not found when orderNumber does not match', () => {
      const mockSearchRun = {
        each: jest.fn().mockReturnValue(false)
      };
      search.create.mockReturnValue({
        run: jest.fn().mockReturnValue(mockSearchRun)
      });

      const result = script.get({ orderNumber: 'INVALID' });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('OTC_NOT_FOUND');
      expect(result.httpStatus).toBe(404);
    });
  });

  describe('post', () => {
    it('should create lead successfully with valid data', () => {
      const mockLead = {
        setValue: jest.fn(),
        save: jest.fn().mockReturnValue(789)
      };
      record.create.mockReturnValue(mockLead);

      // Mock duplicate check - no duplicate found
      const mockSearchRun = {
        each: jest.fn().mockReturnValue(false)
      };
      search.create.mockReturnValue({
        run: jest.fn().mockReturnValue(mockSearchRun)
      });

      const requestBody = {
        email: 'new@example.com',
        companyName: 'New Company',
        firstName: 'John',
        lastName: 'Doe'
      };

      const result = script.post(requestBody);

      expect(result.success).toBe(true);
      expect(result.data.leadId).toBe(789);
    });

    it('should return validation error for missing email', () => {
      const requestBody = {
        companyName: 'New Company',
        firstName: 'John',
        lastName: 'Doe'
      };

      const result = script.post(requestBody);

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('OTC_VALIDATION_ERROR');
      expect(result.httpStatus).toBe(400);
    });

    it('should return validation error for invalid email format', () => {
      const requestBody = {
        email: 'invalid-email',
        companyName: 'New Company',
        firstName: 'John',
        lastName: 'Doe'
      };

      const result = script.post(requestBody);

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('OTC_VALIDATION_ERROR');
    });

    it('should return validation error for missing companyName', () => {
      const requestBody = {
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe'
      };

      const result = script.post(requestBody);

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('OTC_VALIDATION_ERROR');
    });

    it('should return duplicate lead error when email already exists', () => {
      // Mock duplicate check - duplicate found (throws error)
      const mockSearchRun = {
        each: jest.fn((callback) => {
          callback({ id: '999' });
          return false;
        })
      };
      search.create.mockReturnValue({
        run: jest.fn().mockReturnValue(mockSearchRun)
      });

      // Mock error.create to return proper error
      error.create.mockReturnValue({
        name: 'OTC_DUPLICATE_LEAD',
        message: 'A lead with this email already exists'
      });

      const requestBody = {
        email: 'existing@example.com',
        companyName: 'Existing Co',
        firstName: 'John',
        lastName: 'Doe'
      };

      const result = script.post(requestBody);

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('OTC_DUPLICATE_LEAD');
      expect(result.httpStatus).toBe(409);
    });

    it('should sanitize input data when creating lead', () => {
      const mockLead = {
        setValue: jest.fn(),
        save: jest.fn().mockReturnValue(789)
      };
      record.create.mockReturnValue(mockLead);

      const mockSearchRun = {
        each: jest.fn().mockReturnValue(false)
      };
      search.create.mockReturnValue({
        run: jest.fn().mockReturnValue(mockSearchRun)
      });

      const requestBody = {
        email: '  test@example.com  ',
        companyName: '  Test Company  ',
        firstName: '  John  ',
        lastName: '  Doe  '
      };

      script.post(requestBody);

      expect(mockLead.setValue).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle unexpected errors gracefully in get', () => {
      record.load.mockImplementation(() => {
        throw new Error('Unexpected database error');
      });

      const result = script.get({ orderId: '123' });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('OTC_INTERNAL_ERROR');
      expect(result.httpStatus).toBe(500);
    });

    it('should handle record creation errors gracefully', () => {
      const mockSearchRun = {
        each: jest.fn().mockReturnValue(false)
      };
      search.create.mockReturnValue({
        run: jest.fn().mockReturnValue(mockSearchRun)
      });

      const mockLead = {
        setValue: jest.fn(),
        save: jest.fn().mockImplementation(() => {
          throw new Error('Save failed');
        })
      };
      record.create.mockReturnValue(mockLead);

      const requestBody = {
        email: 'test@example.com',
        companyName: 'Test Co',
        firstName: 'John',
        lastName: 'Doe'
      };

      const result = script.post(requestBody);

      expect(result.success).toBe(false);
      expect(result.httpStatus).toBe(500);
    });
  });
});
