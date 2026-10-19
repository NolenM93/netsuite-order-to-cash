/**
 * @NApiVersion 2.1
 * @NScriptType Restlet
 * @NModuleScope SameAccount
 *
 * Order API RESTlet
 * - GET: Retrieve order status by order number or ID
 * - POST: Create a lead from external website form
 *
 * @author Nolen Millington
 */
define(['N/record', 'N/search', 'N/error', '../lib/OTC_Lib_Utils'],
  (record, search, error, utils) => {

    /**
     * Handles GET requests - order status lookup
     * @param {Object} requestParams - Request parameters
     * @returns {Object} Order status response
     */
    const get = (requestParams) => {
      try {
        const { orderId, orderNumber } = requestParams;

        if (!orderId && !orderNumber) {
          return utils.buildErrorResponse(
            'OTC_MISSING_PARAMETER',
            'Either orderId or orderNumber is required',
            400
          );
        }

        let resolvedOrderId = orderId;

        if (!resolvedOrderId && orderNumber) {
          resolvedOrderId = lookupOrderByNumber(orderNumber);

          if (!resolvedOrderId) {
            return utils.buildErrorResponse(
              'OTC_NOT_FOUND',
              `Order not found: ${orderNumber}`,
              404
            );
          }
        }

        const orderData = getOrderStatus(resolvedOrderId);
        return utils.buildSuccessResponse(orderData, 'Order retrieved successfully');

      } catch (e) {
        log.error({ title: 'OTC_RL_OrderAPI.get', details: e.message });

        return utils.buildErrorResponse(
          'OTC_INTERNAL_ERROR',
          `An error occurred retrieving the order: ${e.message}`,
          500
        );
      }
    };

    /**
     * Handles POST requests - lead creation
     * @param {Object} requestBody - Request body
     * @returns {Object} Created lead response
     */
    const post = (requestBody) => {
      try {
        const validationResult = validateLeadInput(requestBody);

        if (!validationResult.valid) {
          return utils.buildErrorResponse(
            'OTC_VALIDATION_ERROR',
            validationResult.message,
            400
          );
        }

        const leadId = createLead(requestBody);

        return utils.buildSuccessResponse(
          { leadId },
          'Lead created successfully'
        );

      } catch (e) {
        log.error({ title: 'OTC_RL_OrderAPI.post', details: e.message });

        if (e.name === 'OTC_DUPLICATE_LEAD') {
          return utils.buildErrorResponse(
            'OTC_DUPLICATE_LEAD',
            'A lead with this email already exists',
            409
          );
        }

        return utils.buildErrorResponse(
          'OTC_INTERNAL_ERROR',
          `An error occurred creating the lead: ${e.message}`,
          500
        );
      }
    };

    /**
     * Looks up order ID by document number
     * @param {string} orderNumber - Order document number (tranid)
     * @returns {string|null} Internal order ID or null
     */
    const lookupOrderByNumber = (orderNumber) => {
      const orderSearch = search.create({
        type: search.Type.SALES_ORDER,
        filters: [
          ['mainline', 'is', 'T'],
          'AND',
          ['numbertext', 'is', orderNumber]
        ],
        columns: ['internalid']
      });

      let orderId = null;

      orderSearch.run().each((result) => {
        orderId = result.id;
        return false;
      });

      return orderId;
    };

    /**
     * Gets order status details
     * @param {string} orderId - Internal order ID
     * @returns {Object} Order status data
     */
    const getOrderStatus = (orderId) => {
      const orderRecord = record.load({
        type: record.Type.SALES_ORDER,
        id: orderId
      });

      const getValue = (fieldId) => orderRecord.getValue({ fieldId });
      const getText = (fieldId) => orderRecord.getText({ fieldId });

      const status = getValue('status');
      const statusText = getText('status');
      const tranId = getValue('tranid');
      const tranDate = getValue('trandate');
      const total = getValue('total');
      const shipDate = getValue('shipdate');
      const trackingNumbers = getValue('linkedtrackingnumbers');
      const customerName = getText('entity');

      const lineCount = orderRecord.getLineCount({ sublistId: 'item' });
      const items = [];

      for (let i = 0; i < lineCount; i++) {
        items.push({
          item: orderRecord.getSublistText({ sublistId: 'item', fieldId: 'item', line: i }),
          quantity: orderRecord.getSublistValue({ sublistId: 'item', fieldId: 'quantity', line: i }),
          rate: orderRecord.getSublistValue({ sublistId: 'item', fieldId: 'rate', line: i }),
          amount: orderRecord.getSublistValue({ sublistId: 'item', fieldId: 'amount', line: i })
        });
      }

      return {
        orderId,
        orderNumber: tranId,
        status,
        statusDisplay: statusText,
        orderDate: tranDate ? tranDate.toISOString() : null,
        customer: customerName,
        total: parseFloat(total) || 0,
        shipDate: shipDate ? shipDate.toISOString() : null,
        trackingNumbers: trackingNumbers || null,
        lineCount,
        items
      };
    };

    /**
     * Validates lead input data
     * @param {Object} data - Lead input data
     * @returns {Object} Validation result
     */
    const validateLeadInput = (data) => {
      const errors = [];

      if (!data) {
        return { valid: false, message: 'Request body is required' };
      }

      if (!data.companyName || typeof data.companyName !== 'string') {
        errors.push('companyName is required');
      } else if (data.companyName.trim().length < 2) {
        errors.push('companyName must be at least 2 characters');
      }

      if (!data.email) {
        errors.push('email is required');
      } else if (!utils.isValidEmail(data.email)) {
        errors.push('email must be a valid email address');
      }

      if (!data.firstName || typeof data.firstName !== 'string') {
        errors.push('firstName is required');
      }

      if (!data.lastName || typeof data.lastName !== 'string') {
        errors.push('lastName is required');
      }

      if (data.phone && !utils.isValidPhone(data.phone)) {
        errors.push('phone must be a valid phone number');
      }

      if (errors.length > 0) {
        return { valid: false, message: errors.join('; ') };
      }

      return { valid: true };
    };

    /**
     * Creates a lead record from form submission
     * @param {Object} data - Lead data
     * @returns {string} Created lead internal ID
     */
    const createLead = (data) => {
      checkForDuplicate(data.email);

      const lead = record.create({
        type: record.Type.LEAD,
        isDynamic: true
      });

      lead.setValue({ fieldId: 'companyname', value: utils.sanitizeInput(data.companyName, 100) });
      lead.setValue({ fieldId: 'firstname', value: utils.sanitizeInput(data.firstName, 50) });
      lead.setValue({ fieldId: 'lastname', value: utils.sanitizeInput(data.lastName, 50) });
      lead.setValue({ fieldId: 'email', value: utils.sanitizeInput(data.email, 100) });

      if (data.phone) {
        lead.setValue({ fieldId: 'phone', value: utils.sanitizeInput(data.phone, 25) });
      }

      if (data.comments) {
        lead.setValue({ fieldId: 'comments', value: utils.sanitizeInput(data.comments, 1000) });
      }

      if (data.leadSource) {
        lead.setValue({ fieldId: 'leadsource', value: data.leadSource });
      }

      lead.setValue({ fieldId: 'custentity_otc_web_lead', value: true });

      const leadId = lead.save();

      log.audit({
        title: 'Lead Created',
        details: `Lead ID: ${leadId}, Company: ${data.companyName}`
      });

      return leadId;
    };

    /**
     * Checks for duplicate lead by email
     * @param {string} email - Email to check
     * @throws {error.SuiteScriptError} If duplicate exists
     */
    const checkForDuplicate = (email) => {
      const duplicateSearch = search.create({
        type: search.Type.CUSTOMER,
        filters: [
          ['email', 'is', email],
          'AND',
          ['stage', 'anyof', 'LEAD']
        ],
        columns: ['internalid']
      });

      let exists = false;

      duplicateSearch.run().each(() => {
        exists = true;
        return false;
      });

      if (exists) {
        throw error.create({
          name: 'OTC_DUPLICATE_LEAD',
          message: 'A lead with this email already exists',
          notifyOff: true
        });
      }
    };

    return { get, post };

  });
