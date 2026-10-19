/**
 * Unit Tests for OTC_RL_OrderAPI
 * Tests RESTlet for order status and lead creation
 */

const fs = require('fs');
const path = require('path');

const mockRecord = {
  create: jest.fn(),
  load: jest.fn(),
  Type: { SALES_ORDER: 'salesorder', LEAD: 'lead' }
};

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
  Type: { SALES_ORDER: 'salesorder', CUSTOMER: 'customer' }
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
  path.join(__dirname, '../../src/FileCabinet/SuiteScripts/OrderToCash/RESTlet/OTC_RL_OrderAPI.js'),
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

describe('OTC_RL_OrderAPI', () => {
  let script;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSearchResults = [];
    script = scriptFactory(mockRecord, mockSearch, mockError, utils);
  });

  describe('GET - Order Status', () => {
    it('should return error when no parameters provided', () => {
      const result = script.get({});

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('OTC_MISSING_PARAMETER');
      expect(result.httpStatus).toBe(400);
    });

    it('should return order status by orderId', () => {
      const mockOrderRecord = {
        getValue: jest.fn((opts) => {
          switch (opts.fieldId) {
            case 'status': return 'pendingFulfillment';
            case 'tranid': return 'SO-001';
            case 'trandate': return new Date('2024-01-15');
            case 'total': return 1500;
            case 'shipdate': return new Date('2024-01-20');
            case 'linkedtrackingnumbers': return '1Z999AA10123456784';
            default: return null;
          }
        }),
        getText: jest.fn((opts) => {
          if (opts.fieldId === 'status') return 'Pending Fulfillment';
          if (opts.fieldId === 'entity') return 'Test Customer';
          return null;
        }),
        getLineCount: jest.fn().mockReturnValue(1),
        getSublistText: jest.fn().mockReturnValue('Widget A'),
        getSublistValue: jest.fn((opts) => {
          if (opts.fieldId === 'quantity') return 10;
          if (opts.fieldId === 'rate') return 100;
          if (opts.fieldId === 'amount') return 1000;
          return null;
        })
      };

      mockRecord.load.mockReturnValue(mockOrderRecord);

      const result = script.get({ orderId: '123' });

      expect(result.success).toBe(true);
      expect(result.data.orderNumber).toBe('SO-001');
      expect(result.data.statusDisplay).toBe('Pending Fulfillment');
      expect(result.data.customer).toBe('Test Customer');
      expect(result.data.total).toBe(1500);
      expect(result.data.items).toHaveLength(1);
    });

    it('should lookup order by orderNumber', () => {
      mockSearchResults = [{ id: '456' }];

      const mockOrderRecord = {
        getValue: jest.fn((opts) => {
          if (opts.fieldId === 'status') return 'pending';
          if (opts.fieldId === 'tranid') return 'SO-001';
          if (opts.fieldId === 'trandate') return new Date('2024-01-15');
          if (opts.fieldId === 'total') return 1500;
          if (opts.fieldId === 'shipdate') return null;
          if (opts.fieldId === 'linkedtrackingnumbers') return null;
          return null;
        }),
        getText: jest.fn((opts) => {
          if (opts.fieldId === 'status') return 'Pending';
          if (opts.fieldId === 'entity') return 'Test Customer';
          return null;
        }),
        getLineCount: jest.fn().mockReturnValue(0),
        getSublistText: jest.fn(),
        getSublistValue: jest.fn()
      };

      mockRecord.load.mockReturnValue(mockOrderRecord);

      const result = script.get({ orderNumber: 'SO-001' });

      expect(mockSearch.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'salesorder' })
      );
      expect(result.success).toBe(true);
    });

    it('should return 404 when order not found by number', () => {
      mockSearchResults = [];

      const result = script.get({ orderNumber: 'SO-NOTFOUND' });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('OTC_NOT_FOUND');
      expect(result.httpStatus).toBe(404);
    });

    it('should handle internal errors gracefully', () => {
      mockRecord.load.mockImplementation(() => {
        throw new Error('Record not found');
      });

      const result = script.get({ orderId: '999' });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('OTC_INTERNAL_ERROR');
      expect(result.httpStatus).toBe(500);
    });
  });

  describe('POST - Lead Creation', () => {
    it('should return error for missing body', () => {
      const result = script.post(null);

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('OTC_VALIDATION_ERROR');
      expect(result.httpStatus).toBe(400);
    });

    it('should return validation error for missing required fields', () => {
      const result = script.post({ companyName: 'Test Corp' });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('OTC_VALIDATION_ERROR');
      expect(result.error.message).toContain('email is required');
    });

    it('should return validation error for invalid email', () => {
      const result = script.post({
        companyName: 'Test Corp',
        firstName: 'John',
        lastName: 'Doe',
        email: 'invalid-email'
      });

      expect(result.success).toBe(false);
      expect(result.error.message).toContain('valid email address');
    });

    it('should return validation error for short company name', () => {
      const result = script.post({
        companyName: 'A',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@test.com'
      });

      expect(result.success).toBe(false);
      expect(result.error.message).toContain('at least 2 characters');
    });

    it('should return validation error for invalid phone', () => {
      const result = script.post({
        companyName: 'Test Corp',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@test.com',
        phone: '123'
      });

      expect(result.success).toBe(false);
      expect(result.error.message).toContain('valid phone number');
    });

    it('should create lead successfully', () => {
      mockSearchResults = [];

      const mockLeadRecord = {
        setValue: jest.fn(),
        save: jest.fn().mockReturnValue('789')
      };

      mockRecord.create.mockReturnValue(mockLeadRecord);

      const result = script.post({
        companyName: 'Test Corporation',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john.doe@test.com',
        phone: '555-123-4567',
        comments: 'Interested in bulk pricing'
      });

      expect(result.success).toBe(true);
      expect(result.data.leadId).toBe('789');
      expect(result.message).toBe('Lead created successfully');

      expect(mockLeadRecord.setValue).toHaveBeenCalledWith({
        fieldId: 'companyname',
        value: 'Test Corporation'
      });
    });

    it('should return 409 for duplicate lead', () => {
      mockSearchResults = [{ id: '123' }];

      const result = script.post({
        companyName: 'Test Corp',
        firstName: 'John',
        lastName: 'Doe',
        email: 'existing@test.com'
      });

      expect(result.success).toBe(false);
      expect(result.error.code).toBe('OTC_DUPLICATE_LEAD');
      expect(result.httpStatus).toBe(409);
    });

    it('should sanitize input data', () => {
      mockSearchResults = [];

      const mockLeadRecord = {
        setValue: jest.fn(),
        save: jest.fn().mockReturnValue('789')
      };

      mockRecord.create.mockReturnValue(mockLeadRecord);

      const result = script.post({
        companyName: '  Whitespace Corp  ',
        firstName: '  John  ',
        lastName: '  Doe  ',
        email: '  john@test.com  '
      });

      expect(result.success).toBe(true);

      expect(mockLeadRecord.setValue).toHaveBeenCalledWith({
        fieldId: 'companyname',
        value: 'Whitespace Corp'
      });
    });

    it('should handle optional fields', () => {
      mockSearchResults = [];

      const mockLeadRecord = {
        setValue: jest.fn(),
        save: jest.fn().mockReturnValue('789')
      };

      mockRecord.create.mockReturnValue(mockLeadRecord);

      const result = script.post({
        companyName: 'Test Corp',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@test.com',
        leadSource: 123
      });

      expect(result.success).toBe(true);

      expect(mockLeadRecord.setValue).toHaveBeenCalledWith({
        fieldId: 'leadsource',
        value: 123
      });
    });
  });
});
