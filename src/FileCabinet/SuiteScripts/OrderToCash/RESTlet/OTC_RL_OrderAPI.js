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
  function(record, search, error, utils) {

    /**
     * Handles GET requests - order status lookup
     * @param {Object} requestParams - Request parameters
     * @param {string} [requestParams.orderId] - Internal order ID
     * @param {string} [requestParams.orderNumber] - Order document number
     * @returns {Object} Order status response
     */
    function get(requestParams) {
      try {
        if (!requestParams.orderId && !requestParams.orderNumber) {
          return utils.buildErrorResponse(
            'MISSING_PARAMETER',
            'Either orderId or orderNumber is required',
            400
          );
        }

        let orderId = requestParams.orderId;

        if (!orderId && requestParams.orderNumber) {
          orderId = lookupOrderByNumber(requestParams.orderNumber);

          if (!orderId) {
            return utils.buildErrorResponse(
              'NOT_FOUND',
              'Order not found: ' + requestParams.orderNumber,
              404
            );
          }
        }

        const orderData = getOrderStatus(orderId);

        return utils.buildSuccessResponse(orderData, 'Order retrieved successfully');

      } catch (e) {
        log.error({
          title: 'GET Error',
          details: e.message
        });

        return utils.buildErrorResponse(
          'INTERNAL_ERROR',
          'An error occurred retrieving the order: ' + e.message,
          500
        );
      }
    }

    /**
     * Handles POST requests - lead creation
     * @param {Object} requestBody - Request body
     * @returns {Object} Created lead response
     */
    function post(requestBody) {
      try {
        const validationResult = validateLeadInput(requestBody);

        if (!validationResult.valid) {
          return utils.buildErrorResponse(
            'VALIDATION_ERROR',
            validationResult.message,
            400
          );
        }

        const leadId = createLead(requestBody);

        return utils.buildSuccessResponse(
          { leadId: leadId },
          'Lead created successfully'
        );

      } catch (e) {
        log.error({
          title: 'POST Error',
          details: e.message
        });

        if (e.name === 'DUPLICATE_LEAD') {
          return utils.buildErrorResponse(
            'DUPLICATE_LEAD',
            'A lead with this email already exists',
            409
          );
        }

        return utils.buildErrorResponse(
          'INTERNAL_ERROR',
          'An error occurred creating the lead: ' + e.message,
          500
        );
      }
    }

    /**
     * Looks up order ID by document number
     * @param {string} orderNumber - Order document number (tranid)
     * @returns {string|null} Internal order ID or null
     */
    function lookupOrderByNumber(orderNumber) {
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

      orderSearch.run().each(function(result) {
        orderId = result.id;
        return false;
      });

      return orderId;
    }

    /**
     * Gets order status details
     * @param {string} orderId - Internal order ID
     * @returns {Object} Order status data
     */
    function getOrderStatus(orderId) {
      const orderRecord = record.load({
        type: record.Type.SALES_ORDER,
        id: orderId
      });

      const status = orderRecord.getValue({ fieldId: 'status' });
      const statusText = orderRecord.getText({ fieldId: 'status' });
      const tranId = orderRecord.getValue({ fieldId: 'tranid' });
      const tranDate = orderRecord.getValue({ fieldId: 'trandate' });
      const total = orderRecord.getValue({ fieldId: 'total' });
      const shipDate = orderRecord.getValue({ fieldId: 'shipdate' });
      const trackingNumbers = orderRecord.getValue({ fieldId: 'linkedtrackingnumbers' });

      const customerName = orderRecord.getText({ fieldId: 'entity' });

      const lineCount = orderRecord.getLineCount({ sublistId: 'item' });
      const items = [];

      for (let i = 0; i < lineCount; i++) {
        items.push({
          item: orderRecord.getSublistText({
            sublistId: 'item',
            fieldId: 'item',
            line: i
          }),
          quantity: orderRecord.getSublistValue({
            sublistId: 'item',
            fieldId: 'quantity',
            line: i
          }),
          rate: orderRecord.getSublistValue({
            sublistId: 'item',
            fieldId: 'rate',
            line: i
          }),
          amount: orderRecord.getSublistValue({
            sublistId: 'item',
            fieldId: 'amount',
            line: i
          })
        });
      }

      return {
        orderId: orderId,
        orderNumber: tranId,
        status: status,
        statusDisplay: statusText,
        orderDate: tranDate ? tranDate.toISOString() : null,
        customer: customerName,
        total: parseFloat(total) || 0,
        shipDate: shipDate ? shipDate.toISOString() : null,
        trackingNumbers: trackingNumbers || null,
        lineCount: lineCount,
        items: items
      };
    }

    /**
     * Validates lead input data
     * @param {Object} data - Lead input data
     * @returns {Object} Validation result
     */
    function validateLeadInput(data) {
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
    }

    /**
     * Creates a lead record from form submission
     * @param {Object} data - Lead data
     * @returns {string} Created lead internal ID
     */
    function createLead(data) {
      checkForDuplicate(data.email);

      const lead = record.create({
        type: record.Type.LEAD,
        isDynamic: true
      });

      lead.setValue({
        fieldId: 'companyname',
        value: utils.sanitizeInput(data.companyName, 100)
      });

      lead.setValue({
        fieldId: 'firstname',
        value: utils.sanitizeInput(data.firstName, 50)
      });

      lead.setValue({
        fieldId: 'lastname',
        value: utils.sanitizeInput(data.lastName, 50)
      });

      lead.setValue({
        fieldId: 'email',
        value: utils.sanitizeInput(data.email, 100)
      });

      if (data.phone) {
        lead.setValue({
          fieldId: 'phone',
          value: utils.sanitizeInput(data.phone, 25)
        });
      }

      if (data.comments) {
        lead.setValue({
          fieldId: 'comments',
          value: utils.sanitizeInput(data.comments, 1000)
        });
      }

      if (data.leadSource) {
        lead.setValue({
          fieldId: 'leadsource',
          value: data.leadSource
        });
      }

      lead.setValue({
        fieldId: 'custentity_otc_web_lead',
        value: true
      });

      const leadId = lead.save();

      log.audit({
        title: 'Lead Created',
        details: 'Lead ID: ' + leadId + ', Company: ' + data.companyName
      });

      return leadId;
    }

    /**
     * Checks for duplicate lead by email
     * @param {string} email - Email to check
     * @throws {Error} If duplicate exists
     */
    function checkForDuplicate(email) {
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

      duplicateSearch.run().each(function() {
        exists = true;
        return false;
      });

      if (exists) {
        const err = error.create({
          name: 'DUPLICATE_LEAD',
          message: 'A lead with this email already exists'
        });
        throw err;
      }
    }

    return {
      get: get,
      post: post
    };

  });
