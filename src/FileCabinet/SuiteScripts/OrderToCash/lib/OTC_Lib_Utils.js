/**
 * @NApiVersion 2.1
 * @NModuleScope Public
 * @module OTC_Lib_Utils
 *
 * Shared utility functions for Order-to-Cash Toolkit
 * Pure functions designed for unit testability
 *
 * @author Nolen Millington
 */
define([], function() {

  /**
   * Credit status thresholds and labels
   * @constant {Object}
   */
  const CREDIT_STATUS = {
    GOOD: { threshold: 0.7, label: 'Good Standing', color: 'green' },
    WARNING: { threshold: 0.9, label: 'Near Limit', color: 'orange' },
    OVER: { threshold: 1.0, label: 'Over Limit', color: 'red' },
    NO_LIMIT: { label: 'No Credit Limit', color: 'gray' }
  };

  /**
   * Large order threshold for follow-up task creation
   * @constant {number}
   */
  const LARGE_ORDER_THRESHOLD = 10000;

  /**
   * Discount tiers based on quantity
   * @constant {Array<Object>}
   */
  const DISCOUNT_TIERS = [
    { minQty: 100, discount: 0.15 },
    { minQty: 50, discount: 0.10 },
    { minQty: 25, discount: 0.05 },
    { minQty: 0, discount: 0 }
  ];

  /**
   * Calculate credit utilization percentage
   * @param {number} currentBalance - Current AR balance
   * @param {number} creditLimit - Customer credit limit
   * @returns {number|null} Utilization as decimal (0-1+), null if no limit
   */
  function calculateCreditUtilization(currentBalance, creditLimit) {
    if (!creditLimit || creditLimit <= 0) {
      return null;
    }
    const balance = parseFloat(currentBalance) || 0;
    const limit = parseFloat(creditLimit);
    return balance / limit;
  }

  /**
   * Determine credit status based on utilization
   * @param {number|null} utilization - Credit utilization (0-1+)
   * @returns {Object} Status object with label and color
   */
  function getCreditStatus(utilization) {
    if (utilization === null) {
      return CREDIT_STATUS.NO_LIMIT;
    }
    if (utilization >= CREDIT_STATUS.OVER.threshold) {
      return CREDIT_STATUS.OVER;
    }
    if (utilization >= CREDIT_STATUS.WARNING.threshold) {
      return CREDIT_STATUS.WARNING;
    }
    return CREDIT_STATUS.GOOD;
  }

  /**
   * Check if order would exceed credit limit
   * @param {number} currentBalance - Current AR balance
   * @param {number} creditLimit - Customer credit limit
   * @param {number} orderTotal - Proposed order total
   * @returns {boolean} True if order would exceed limit
   */
  function wouldExceedCreditLimit(currentBalance, creditLimit, orderTotal) {
    if (!creditLimit || creditLimit <= 0) {
      return false;
    }
    const balance = parseFloat(currentBalance) || 0;
    const limit = parseFloat(creditLimit);
    const order = parseFloat(orderTotal) || 0;
    return (balance + order) > limit;
  }

  /**
   * Calculate available credit
   * @param {number} creditLimit - Customer credit limit
   * @param {number} currentBalance - Current AR balance
   * @returns {number} Available credit amount
   */
  function calculateAvailableCredit(creditLimit, currentBalance) {
    const limit = parseFloat(creditLimit) || 0;
    const balance = parseFloat(currentBalance) || 0;
    return Math.max(0, limit - balance);
  }

  /**
   * Determine if order qualifies as "large" for follow-up
   * @param {number} orderTotal - Order total amount
   * @param {number} [threshold=LARGE_ORDER_THRESHOLD] - Threshold amount
   * @returns {boolean} True if order is large
   */
  function isLargeOrder(orderTotal, threshold) {
    const thresholdAmount = threshold || LARGE_ORDER_THRESHOLD;
    return parseFloat(orderTotal) >= thresholdAmount;
  }

  /**
   * Get discount tier based on quantity
   * @param {number} quantity - Item quantity
   * @returns {number} Discount rate as decimal (0-1)
   */
  function getDiscountTier(quantity) {
    const qty = parseInt(quantity, 10) || 0;
    for (const tier of DISCOUNT_TIERS) {
      if (qty >= tier.minQty) {
        return tier.discount;
      }
    }
    return 0;
  }

  /**
   * Calculate days overdue from due date
   * @param {Date} dueDate - Invoice due date
   * @param {Date} [asOfDate=new Date()] - Date to calculate from
   * @returns {number} Days overdue (negative if not yet due)
   */
  function calculateDaysOverdue(dueDate, asOfDate) {
    const today = asOfDate || new Date();
    const due = new Date(dueDate);
    const diffTime = today.getTime() - due.getTime();
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
  }

  /**
   * Categorize aging bucket based on days overdue
   * @param {number} daysOverdue - Number of days past due
   * @returns {string} Aging bucket label
   */
  function getAgingBucket(daysOverdue) {
    if (daysOverdue <= 0) return 'Current';
    if (daysOverdue <= 30) return '1-30 Days';
    if (daysOverdue <= 60) return '31-60 Days';
    if (daysOverdue <= 90) return '61-90 Days';
    return 'Over 90 Days';
  }

  /**
   * Format currency for display
   * @param {number} amount - Amount to format
   * @param {string} [currencySymbol='$'] - Currency symbol
   * @returns {string} Formatted currency string
   */
  function formatCurrency(amount, currencySymbol) {
    const symbol = currencySymbol || '$';
    const num = parseFloat(amount) || 0;
    return symbol + num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  /**
   * Validate email address format
   * @param {string} email - Email address to validate
   * @returns {boolean} True if valid email format
   */
  function isValidEmail(email) {
    if (!email || typeof email !== 'string') {
      return false;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim());
  }

  /**
   * Validate phone number (basic format check)
   * @param {string} phone - Phone number to validate
   * @returns {boolean} True if valid phone format
   */
  function isValidPhone(phone) {
    if (!phone || typeof phone !== 'string') {
      return false;
    }
    const cleaned = phone.replace(/[\s\-\(\)\.]/g, '');
    return /^\+?\d{10,15}$/.test(cleaned);
  }

  /**
   * Sanitize string input for safety
   * @param {string} input - Input string
   * @param {number} [maxLength=500] - Maximum allowed length
   * @returns {string} Sanitized string
   */
  function sanitizeInput(input, maxLength) {
    if (!input || typeof input !== 'string') {
      return '';
    }
    const max = maxLength || 500;
    return input.trim().substring(0, max);
  }

  /**
   * Check if governance units are sufficient to continue
   * @param {number} remainingUsage - Remaining governance units
   * @param {number} threshold - Minimum required units
   * @returns {boolean} True if safe to continue
   */
  function hasGovernanceCapacity(remainingUsage, threshold) {
    return remainingUsage > threshold;
  }

  /**
   * Build a standardized error response for RESTlets
   * @param {string} code - Error code
   * @param {string} message - Error message
   * @param {number} [httpStatus=400] - HTTP status code
   * @returns {Object} Standardized error object
   */
  function buildErrorResponse(code, message, httpStatus) {
    return {
      success: false,
      error: {
        code: code,
        message: message
      },
      httpStatus: httpStatus || 400
    };
  }

  /**
   * Build a standardized success response for RESTlets
   * @param {*} data - Response data
   * @param {string} [message] - Optional success message
   * @returns {Object} Standardized success object
   */
  function buildSuccessResponse(data, message) {
    const response = {
      success: true,
      data: data
    };
    if (message) {
      response.message = message;
    }
    return response;
  }

  /**
   * Parse and validate JSON safely
   * @param {string} jsonString - JSON string to parse
   * @returns {Object|null} Parsed object or null if invalid
   */
  function safeParseJSON(jsonString) {
    try {
      return JSON.parse(jsonString);
    } catch (e) {
      return null;
    }
  }

  return {
    CREDIT_STATUS,
    LARGE_ORDER_THRESHOLD,
    DISCOUNT_TIERS,
    calculateCreditUtilization,
    getCreditStatus,
    wouldExceedCreditLimit,
    calculateAvailableCredit,
    isLargeOrder,
    getDiscountTier,
    calculateDaysOverdue,
    getAgingBucket,
    formatCurrency,
    isValidEmail,
    isValidPhone,
    sanitizeInput,
    hasGovernanceCapacity,
    buildErrorResponse,
    buildSuccessResponse,
    safeParseJSON
  };

});
