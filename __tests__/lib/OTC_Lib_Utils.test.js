/**
 * Unit Tests for OTC_Lib_Utils
 * Tests pure utility functions used across Order-to-Cash Toolkit
 */

const fs = require('fs');
const path = require('path');

const moduleContent = fs.readFileSync(
  path.join(__dirname, '../../src/FileCabinet/SuiteScripts/OrderToCash/lib/OTC_Lib_Utils.js'),
  'utf8'
);

let moduleFactory;
// eslint-disable-next-line no-unused-vars
const mockDefine = (deps, factory) => {
  moduleFactory = typeof deps === 'function' ? deps : factory;
};
eval(moduleContent.replace('define(', 'mockDefine('));

const utils = moduleFactory();

describe('OTC_Lib_Utils', () => {

  describe('escapeHtml', () => {
    it('should escape HTML special characters', () => {
      expect(utils.escapeHtml('<script>alert("xss")</script>'))
        .toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;');
    });

    it('should escape ampersands', () => {
      expect(utils.escapeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry');
    });

    it('should escape single quotes', () => {
      expect(utils.escapeHtml("it's")).toBe('it&#x27;s');
    });

    it('should return empty string for null/undefined', () => {
      expect(utils.escapeHtml(null)).toBe('');
      expect(utils.escapeHtml(undefined)).toBe('');
      expect(utils.escapeHtml('')).toBe('');
    });

    it('should return empty string for non-strings', () => {
      expect(utils.escapeHtml(123)).toBe('');
      expect(utils.escapeHtml({})).toBe('');
    });

    it('should pass through safe strings unchanged', () => {
      expect(utils.escapeHtml('Hello World')).toBe('Hello World');
    });
  });

  describe('calculateCreditUtilization', () => {
    it('should return correct utilization percentage', () => {
      expect(utils.calculateCreditUtilization(5000, 10000)).toBe(0.5);
      expect(utils.calculateCreditUtilization(10000, 10000)).toBe(1.0);
      expect(utils.calculateCreditUtilization(15000, 10000)).toBe(1.5);
    });

    it('should return null when no credit limit', () => {
      expect(utils.calculateCreditUtilization(5000, 0)).toBeNull();
      expect(utils.calculateCreditUtilization(5000, null)).toBeNull();
      expect(utils.calculateCreditUtilization(5000, -100)).toBeNull();
    });

    it('should handle zero balance', () => {
      expect(utils.calculateCreditUtilization(0, 10000)).toBe(0);
    });

    it('should handle string inputs', () => {
      expect(utils.calculateCreditUtilization('5000', '10000')).toBe(0.5);
    });
  });

  describe('getCreditStatus', () => {
    it('should return GOOD for low utilization', () => {
      const status = utils.getCreditStatus(0.5);
      expect(status.label).toBe('Good Standing');
      expect(status.color).toBe('green');
    });

    it('should return WARNING for high utilization', () => {
      const status = utils.getCreditStatus(0.95);
      expect(status.label).toBe('Near Limit');
      expect(status.color).toBe('orange');
    });

    it('should return OVER for exceeded limit', () => {
      const status = utils.getCreditStatus(1.1);
      expect(status.label).toBe('Over Limit');
      expect(status.color).toBe('red');
    });

    it('should return NO_LIMIT for null utilization', () => {
      const status = utils.getCreditStatus(null);
      expect(status.label).toBe('No Credit Limit');
    });

    it('should accept custom thresholds', () => {
      const status = utils.getCreditStatus(0.75, 0.7, 0.8);
      expect(status.label).toBe('Near Limit');
    });
  });

  describe('wouldExceedCreditLimit', () => {
    it('should return true when order exceeds limit', () => {
      expect(utils.wouldExceedCreditLimit(8000, 10000, 3000)).toBe(true);
    });

    it('should return false when order within limit', () => {
      expect(utils.wouldExceedCreditLimit(5000, 10000, 3000)).toBe(false);
    });

    it('should return false when no credit limit set', () => {
      expect(utils.wouldExceedCreditLimit(5000, 0, 3000)).toBe(false);
      expect(utils.wouldExceedCreditLimit(5000, null, 3000)).toBe(false);
    });

    it('should handle edge case at exact limit', () => {
      expect(utils.wouldExceedCreditLimit(5000, 10000, 5000)).toBe(false);
      expect(utils.wouldExceedCreditLimit(5000, 10000, 5001)).toBe(true);
    });
  });

  describe('calculateAvailableCredit', () => {
    it('should calculate available credit correctly', () => {
      expect(utils.calculateAvailableCredit(10000, 3000)).toBe(7000);
    });

    it('should return zero when over limit', () => {
      expect(utils.calculateAvailableCredit(10000, 12000)).toBe(0);
    });

    it('should handle no balance', () => {
      expect(utils.calculateAvailableCredit(10000, 0)).toBe(10000);
    });
  });

  describe('isLargeOrder', () => {
    it('should identify large orders using default threshold', () => {
      expect(utils.isLargeOrder(15000)).toBe(true);
      expect(utils.isLargeOrder(10000)).toBe(true);
    });

    it('should identify small orders', () => {
      expect(utils.isLargeOrder(5000)).toBe(false);
      expect(utils.isLargeOrder(9999.99)).toBe(false);
    });

    it('should accept custom threshold', () => {
      expect(utils.isLargeOrder(5000, 4000)).toBe(true);
      expect(utils.isLargeOrder(5000, 6000)).toBe(false);
    });
  });

  describe('getDiscountTier', () => {
    it('should return correct discount for quantity tiers', () => {
      expect(utils.getDiscountTier(100)).toBe(0.15);
      expect(utils.getDiscountTier(150)).toBe(0.15);
      expect(utils.getDiscountTier(50)).toBe(0.10);
      expect(utils.getDiscountTier(75)).toBe(0.10);
      expect(utils.getDiscountTier(25)).toBe(0.05);
      expect(utils.getDiscountTier(10)).toBe(0);
    });

    it('should handle edge cases', () => {
      expect(utils.getDiscountTier(0)).toBe(0);
      expect(utils.getDiscountTier(null)).toBe(0);
      expect(utils.getDiscountTier('50')).toBe(0.10);
    });

    it('should accept custom tiers', () => {
      const customTiers = [
        { minQty: 10, discount: 0.20 },
        { minQty: 0, discount: 0 }
      ];
      expect(utils.getDiscountTier(15, customTiers)).toBe(0.20);
    });
  });

  describe('calculateDaysOverdue', () => {
    it('should calculate positive days overdue', () => {
      const dueDate = new Date('2024-01-01');
      const asOfDate = new Date('2024-01-15');
      expect(utils.calculateDaysOverdue(dueDate, asOfDate)).toBe(14);
    });

    it('should return negative for future due dates', () => {
      const dueDate = new Date('2024-01-15');
      const asOfDate = new Date('2024-01-01');
      expect(utils.calculateDaysOverdue(dueDate, asOfDate)).toBe(-14);
    });

    it('should return zero for same day', () => {
      const date = new Date('2024-01-15');
      expect(utils.calculateDaysOverdue(date, date)).toBe(0);
    });
  });

  describe('getAgingBucket', () => {
    it('should categorize aging correctly', () => {
      expect(utils.getAgingBucket(0)).toBe('Current');
      expect(utils.getAgingBucket(-5)).toBe('Current');
      expect(utils.getAgingBucket(15)).toBe('1-30 Days');
      expect(utils.getAgingBucket(30)).toBe('1-30 Days');
      expect(utils.getAgingBucket(45)).toBe('31-60 Days');
      expect(utils.getAgingBucket(75)).toBe('61-90 Days');
      expect(utils.getAgingBucket(120)).toBe('Over 90 Days');
    });
  });

  describe('formatCurrency', () => {
    it('should format currency with default symbol', () => {
      expect(utils.formatCurrency(1234.56)).toBe('$1,234.56');
      expect(utils.formatCurrency(1000000)).toBe('$1,000,000.00');
    });

    it('should use custom currency symbol', () => {
      expect(utils.formatCurrency(1234.56, '€')).toBe('€1,234.56');
    });

    it('should handle zero and null', () => {
      expect(utils.formatCurrency(0)).toBe('$0.00');
      expect(utils.formatCurrency(null)).toBe('$0.00');
    });
  });

  describe('isValidEmail', () => {
    it('should validate correct emails', () => {
      expect(utils.isValidEmail('test@example.com')).toBe(true);
      expect(utils.isValidEmail('user.name@domain.co.uk')).toBe(true);
    });

    it('should reject invalid emails', () => {
      expect(utils.isValidEmail('invalid')).toBe(false);
      expect(utils.isValidEmail('test@')).toBe(false);
      expect(utils.isValidEmail('@domain.com')).toBe(false);
      expect(utils.isValidEmail('')).toBe(false);
      expect(utils.isValidEmail(null)).toBe(false);
    });
  });

  describe('isValidPhone', () => {
    it('should validate correct phone numbers', () => {
      expect(utils.isValidPhone('1234567890')).toBe(true);
      expect(utils.isValidPhone('+1 (234) 567-8901')).toBe(true);
      expect(utils.isValidPhone('123-456-7890')).toBe(true);
    });

    it('should reject invalid phone numbers', () => {
      expect(utils.isValidPhone('123')).toBe(false);
      expect(utils.isValidPhone('')).toBe(false);
      expect(utils.isValidPhone(null)).toBe(false);
    });
  });

  describe('sanitizeInput', () => {
    it('should trim whitespace', () => {
      expect(utils.sanitizeInput('  test  ')).toBe('test');
    });

    it('should truncate long strings', () => {
      const longString = 'a'.repeat(600);
      expect(utils.sanitizeInput(longString).length).toBe(500);
    });

    it('should handle custom max length', () => {
      expect(utils.sanitizeInput('hello world', 5)).toBe('hello');
    });

    it('should handle null/empty input', () => {
      expect(utils.sanitizeInput(null)).toBe('');
      expect(utils.sanitizeInput('')).toBe('');
    });
  });

  describe('hasGovernanceCapacity', () => {
    it('should return true when capacity is sufficient', () => {
      expect(utils.hasGovernanceCapacity(1000, 100)).toBe(true);
    });

    it('should return false when capacity is low', () => {
      expect(utils.hasGovernanceCapacity(50, 100)).toBe(false);
    });

    it('should use default threshold', () => {
      expect(utils.hasGovernanceCapacity(300)).toBe(true);
      expect(utils.hasGovernanceCapacity(100)).toBe(false);
    });
  });

  describe('buildErrorResponse', () => {
    it('should build standardized error response', () => {
      const response = utils.buildErrorResponse('INVALID_INPUT', 'Missing required field');
      expect(response.success).toBe(false);
      expect(response.error.code).toBe('INVALID_INPUT');
      expect(response.error.message).toBe('Missing required field');
      expect(response.httpStatus).toBe(400);
    });

    it('should accept custom http status', () => {
      const response = utils.buildErrorResponse('NOT_FOUND', 'Order not found', 404);
      expect(response.httpStatus).toBe(404);
    });
  });

  describe('buildSuccessResponse', () => {
    it('should build standardized success response', () => {
      const response = utils.buildSuccessResponse({ id: 123 }, 'Order created');
      expect(response.success).toBe(true);
      expect(response.data.id).toBe(123);
      expect(response.message).toBe('Order created');
    });

    it('should work without message', () => {
      const response = utils.buildSuccessResponse({ id: 123 });
      expect(response.success).toBe(true);
      expect(response.message).toBeUndefined();
    });
  });

  describe('safeParseJSON', () => {
    it('should parse valid JSON', () => {
      expect(utils.safeParseJSON('{"key": "value"}')).toEqual({ key: 'value' });
    });

    it('should return null for invalid JSON', () => {
      expect(utils.safeParseJSON('invalid')).toBeNull();
      expect(utils.safeParseJSON('')).toBeNull();
    });
  });

  describe('DEFAULTS', () => {
    it('should export default configuration values', () => {
      expect(utils.DEFAULTS.LARGE_ORDER_THRESHOLD).toBe(10000);
      expect(utils.DEFAULTS.CREDIT_WARNING_PERCENT).toBe(0.9);
      expect(utils.DEFAULTS.GOVERNANCE_THRESHOLD).toBe(200);
    });
  });

});
