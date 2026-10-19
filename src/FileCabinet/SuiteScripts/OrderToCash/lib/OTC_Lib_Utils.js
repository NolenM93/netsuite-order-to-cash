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
define([], () => {

  /**
   * Default configuration values (can be overridden via script parameters)
   * @constant {Object}
   */
  const DEFAULTS = {
    LARGE_ORDER_THRESHOLD: 10000,
    CREDIT_WARNING_PERCENT: 0.9,
    CREDIT_OVER_PERCENT: 1.0,
    GOVERNANCE_THRESHOLD: 200,
    UNITS_PER_EMAIL: 10
  };

  /**
   * Credit status definitions
   * @constant {Object}
   */
  const CREDIT_STATUS = {
    GOOD: { label: 'Good Standing', color: 'green' },
    WARNING: { label: 'Near Limit', color: 'orange' },
    OVER: { label: 'Over Limit', color: 'red' },
    NO_LIMIT: { label: 'No Credit Limit', color: 'gray' }
  };

  /**
   * Default discount tiers based on quantity
   * @constant {Array<Object>}
   */
  const DEFAULT_DISCOUNT_TIERS = [
    { minQty: 100, discount: 0.15 },
    { minQty: 50, discount: 0.10 },
    { minQty: 25, discount: 0.05 },
    { minQty: 0, discount: 0 }
  ];

  /**
   * Escape HTML entities to prevent XSS
   * @param {string} str - String to escape
   * @returns {string} Escaped string safe for HTML injection
   */
  const escapeHtml = (str) => {
    if (!str || typeof str !== 'string') {
      return '';
    }
    const htmlEntities = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#x27;',
      '/': '&#x2F;'
    };
    return str.replace(/[&<>"'/]/g, (char) => htmlEntities[char]);
  };

  /**
   * Get script parameter with fallback, treating '', null, undefined as unset.
   * NetSuite returns '' for unset parameters, not null.
   * @param {Function} getParamFn - Function that retrieves param (e.g. script.getParameter)
   * @param {string} paramId - Parameter ID
   * @param {*} defaultValue - Default value if param is unset
   * @param {boolean} [isNumeric=false] - If true, coerce to Number
   * @returns {*} Parameter value or default
   */
  const getScriptParam = (getParamFn, paramId, defaultValue, isNumeric = false) => {
    const raw = getParamFn({ name: paramId });
    const isUnset = raw === null || raw === undefined || raw === '';
    if (isUnset) {
      return defaultValue;
    }
    return isNumeric ? Number(raw) : raw;
  };

  /**
   * Calculate credit utilization percentage
   * @param {number} currentBalance - Current AR balance
   * @param {number} creditLimit - Customer credit limit
   * @returns {number|null} Utilization as decimal (0-1+), null if no limit
   */
  const calculateCreditUtilization = (currentBalance, creditLimit) => {
    if (!creditLimit || creditLimit <= 0) {
      return null;
    }
    const balance = parseFloat(currentBalance) || 0;
    const limit = parseFloat(creditLimit);
    return balance / limit;
  };

  /**
   * Determine credit status based on utilization
   * @param {number|null} utilization - Credit utilization (0-1+)
   * @param {number} [warningThreshold] - Warning threshold (default 0.9)
   * @param {number} [overThreshold] - Over limit threshold (default 1.0)
   * @returns {Object} Status object with label and color
   */
  const getCreditStatus = (utilization, warningThreshold, overThreshold) => {
    if (utilization === null) {
      return CREDIT_STATUS.NO_LIMIT;
    }
    const warning = warningThreshold ?? DEFAULTS.CREDIT_WARNING_PERCENT;
    const over = overThreshold ?? DEFAULTS.CREDIT_OVER_PERCENT;

    if (utilization >= over) {
      return CREDIT_STATUS.OVER;
    }
    if (utilization >= warning) {
      return CREDIT_STATUS.WARNING;
    }
    return CREDIT_STATUS.GOOD;
  };

  /**
   * Check if order would exceed credit limit
   * @param {number} currentBalance - Current AR balance
   * @param {number} creditLimit - Customer credit limit
   * @param {number} orderTotal - Proposed order total
   * @returns {boolean} True if order would exceed limit
   */
  const wouldExceedCreditLimit = (currentBalance, creditLimit, orderTotal) => {
    if (!creditLimit || creditLimit <= 0) {
      return false;
    }
    const balance = parseFloat(currentBalance) || 0;
    const limit = parseFloat(creditLimit);
    const order = parseFloat(orderTotal) || 0;
    return (balance + order) > limit;
  };

  /**
   * Calculate available credit
   * @param {number} creditLimit - Customer credit limit
   * @param {number} currentBalance - Current AR balance
   * @returns {number} Available credit amount
   */
  const calculateAvailableCredit = (creditLimit, currentBalance) => {
    const limit = parseFloat(creditLimit) || 0;
    const balance = parseFloat(currentBalance) || 0;
    return Math.max(0, limit - balance);
  };

  /**
   * Determine if order qualifies as "large" for follow-up
   * @param {number} orderTotal - Order total amount
   * @param {number} [threshold] - Threshold amount
   * @returns {boolean} True if order is large
   */
  const isLargeOrder = (orderTotal, threshold) => {
    const thresholdAmount = threshold ?? DEFAULTS.LARGE_ORDER_THRESHOLD;
    return parseFloat(orderTotal) >= thresholdAmount;
  };

  /**
   * Get discount tier based on quantity
   * @param {number} quantity - Item quantity
   * @param {Array<Object>} [tiers] - Custom discount tiers
   * @returns {number} Discount rate as decimal (0-1)
   */
  const getDiscountTier = (quantity, tiers) => {
    const qty = parseInt(quantity, 10) || 0;
    const discountTiers = tiers || DEFAULT_DISCOUNT_TIERS;

    const tier = discountTiers.find((t) => qty >= t.minQty);
    return tier?.discount ?? 0;
  };

  /**
   * Calculate days overdue from due date
   * @param {Date} dueDate - Invoice due date
   * @param {Date} [asOfDate] - Date to calculate from
   * @returns {number} Days overdue (negative if not yet due)
   */
  const calculateDaysOverdue = (dueDate, asOfDate) => {
    const today = asOfDate || new Date();
    const due = new Date(dueDate);
    const diffTime = today.getTime() - due.getTime();
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
  };

  /**
   * Categorize aging bucket based on days overdue
   * @param {number} daysOverdue - Number of days past due
   * @returns {string} Aging bucket label
   */
  const getAgingBucket = (daysOverdue) => {
    if (daysOverdue <= 0) return 'Current';
    if (daysOverdue <= 30) return '1-30 Days';
    if (daysOverdue <= 60) return '31-60 Days';
    if (daysOverdue <= 90) return '61-90 Days';
    return 'Over 90 Days';
  };

  /**
   * Format currency for display
   * @param {number} amount - Amount to format
   * @param {string} [currencySymbol='$'] - Currency symbol
   * @returns {string} Formatted currency string
   */
  const formatCurrency = (amount, currencySymbol = '$') => {
    const num = parseFloat(amount) || 0;
    return `${currencySymbol}${num.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;
  };

  /**
   * Validate email address format
   * @param {string} email - Email address to validate
   * @returns {boolean} True if valid email format
   */
  const isValidEmail = (email) => {
    if (!email || typeof email !== 'string') {
      return false;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim());
  };

  /**
   * Validate phone number (basic format check)
   * @param {string} phone - Phone number to validate
   * @returns {boolean} True if valid phone format
   */
  const isValidPhone = (phone) => {
    if (!phone || typeof phone !== 'string') {
      return false;
    }
    const cleaned = phone.replace(/[\s\-().]/g, '');
    return /^\+?\d{10,15}$/.test(cleaned);
  };

  /**
   * Sanitize string input for safety
   * @param {string} input - Input string
   * @param {number} [maxLength=500] - Maximum allowed length
   * @returns {string} Sanitized string
   */
  const sanitizeInput = (input, maxLength = 500) => {
    if (!input || typeof input !== 'string') {
      return '';
    }
    return input.trim().substring(0, maxLength);
  };

  /**
   * Check if governance units are sufficient to continue
   * @param {number} remainingUsage - Remaining governance units
   * @param {number} [threshold] - Minimum required units
   * @returns {boolean} True if safe to continue
   */
  const hasGovernanceCapacity = (remainingUsage, threshold) => {
    const minRequired = threshold ?? DEFAULTS.GOVERNANCE_THRESHOLD;
    return remainingUsage > minRequired;
  };

  /**
   * Build a standardized error response for RESTlets
   * @param {string} code - Error code
   * @param {string} message - Error message
   * @param {number} [httpStatus=400] - HTTP status code
   * @returns {Object} Standardized error object
   */
  const buildErrorResponse = (code, message, httpStatus = 400) => ({
    success: false,
    error: { code, message },
    httpStatus
  });

  /**
   * Build a standardized success response for RESTlets
   * @param {*} data - Response data
   * @param {string} [message] - Optional success message
   * @returns {Object} Standardized success object
   */
  const buildSuccessResponse = (data, message) => {
    const response = { success: true, data };
    if (message) {
      response.message = message;
    }
    return response;
  };

  /**
   * Parse and validate JSON safely
   * @param {string} jsonString - JSON string to parse
   * @returns {Object|null} Parsed object or null if invalid
   */
  const safeParseJSON = (jsonString) => {
    try {
      return JSON.parse(jsonString);
    } catch (_e) {
      return null;
    }
  };

  return {
    DEFAULTS,
    CREDIT_STATUS,
    DEFAULT_DISCOUNT_TIERS,
    getScriptParam,
    escapeHtml,
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
