/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 * @NModuleScope SameAccount
 *
 * Sales Order User Event Script
 * - beforeLoad: Adds credit status banner/field
 * - beforeSubmit: Validates required fields and credit limit
 * - afterSubmit: Creates follow-up task for large orders
 *
 * @author Nolen Millington
 */
define(['N/record', 'N/search', 'N/ui/serverWidget', 'N/runtime', '../lib/OTC_Lib_Utils'],
  function(record, search, serverWidget, runtime, utils) {

    /**
     * Adds credit status information to the sales order form
     * @param {Object} context - Entry point context
     * @param {Record} context.newRecord - Sales order record
     * @param {Form} context.form - UI form
     * @param {string} context.type - Trigger type
     */
    function beforeLoad(context) {
      if (context.type !== context.UserEventType.VIEW &&
          context.type !== context.UserEventType.EDIT) {
        return;
      }

      const salesOrder = context.newRecord;
      const customerId = salesOrder.getValue({ fieldId: 'entity' });

      if (!customerId) {
        return;
      }

      try {
        const customerData = getCustomerCreditData(customerId);
        const utilization = utils.calculateCreditUtilization(
          customerData.balance,
          customerData.creditLimit
        );
        const creditStatus = utils.getCreditStatus(utilization);

        addCreditStatusField(context.form, creditStatus, customerData, utilization);
      } catch (e) {
        log.error({
          title: 'beforeLoad Error',
          details: e.message
        });
      }
    }

    /**
     * Validates required fields and credit limit before save
     * @param {Object} context - Entry point context
     * @param {Record} context.newRecord - Sales order record
     * @param {string} context.type - Trigger type
     */
    function beforeSubmit(context) {
      if (context.type !== context.UserEventType.CREATE &&
          context.type !== context.UserEventType.EDIT) {
        return;
      }

      const salesOrder = context.newRecord;

      validateRequiredFields(salesOrder);
      validateCreditLimit(salesOrder);
    }

    /**
     * Creates follow-up task for large orders
     * @param {Object} context - Entry point context
     * @param {Record} context.newRecord - Sales order record
     * @param {string} context.type - Trigger type
     */
    function afterSubmit(context) {
      if (context.type !== context.UserEventType.CREATE) {
        return;
      }

      const salesOrder = context.newRecord;
      const orderTotal = salesOrder.getValue({ fieldId: 'total' });

      if (utils.isLargeOrder(orderTotal)) {
        try {
          createFollowUpTask(salesOrder);
        } catch (e) {
          log.error({
            title: 'afterSubmit Error - Task Creation',
            details: e.message
          });
        }
      }
    }

    /**
     * Retrieves customer credit data via search
     * @param {number} customerId - Internal ID of customer
     * @returns {Object} Customer credit data
     */
    function getCustomerCreditData(customerId) {
      const customerLookup = search.lookupFields({
        type: search.Type.CUSTOMER,
        id: customerId,
        columns: ['creditlimit', 'balance', 'companyname', 'entityid']
      });

      return {
        creditLimit: parseFloat(customerLookup.creditlimit) || 0,
        balance: parseFloat(customerLookup.balance) || 0,
        companyName: customerLookup.companyname || customerLookup.entityid || 'Customer'
      };
    }

    /**
     * Adds credit status field to the form
     * @param {Form} form - UI form object
     * @param {Object} creditStatus - Status object from utils
     * @param {Object} customerData - Customer credit data
     * @param {number|null} utilization - Credit utilization
     */
    function addCreditStatusField(form, creditStatus, customerData, utilization) {
      const statusField = form.addField({
        id: 'custpage_credit_status',
        type: serverWidget.FieldType.INLINEHTML,
        label: 'Credit Status'
      });

      let statusHtml = '<div style="padding: 10px; border-radius: 4px; ';
      statusHtml += 'background-color: ' + getBackgroundColor(creditStatus.color) + '; ';
      statusHtml += 'border-left: 4px solid ' + creditStatus.color + ';">';
      statusHtml += '<strong>Credit Status: </strong>' + creditStatus.label;

      if (utilization !== null) {
        const utilizationPct = (utilization * 100).toFixed(1);
        const available = utils.calculateAvailableCredit(
          customerData.creditLimit,
          customerData.balance
        );
        statusHtml += '<br/>Utilization: ' + utilizationPct + '%';
        statusHtml += '<br/>Available Credit: ' + utils.formatCurrency(available);
      }

      statusHtml += '</div>';
      statusField.defaultValue = statusHtml;
    }

    /**
     * Gets background color based on status color
     * @param {string} color - Status color name
     * @returns {string} CSS background color
     */
    function getBackgroundColor(color) {
      const bgColors = {
        green: '#e8f5e9',
        orange: '#fff3e0',
        red: '#ffebee',
        gray: '#f5f5f5'
      };
      return bgColors[color] || bgColors.gray;
    }

    /**
     * Validates required fields on sales order
     * @param {Record} salesOrder - Sales order record
     * @throws {Error} If validation fails
     */
    function validateRequiredFields(salesOrder) {
      const requiredFields = [
        { id: 'entity', label: 'Customer' },
        { id: 'trandate', label: 'Date' }
      ];

      const missingFields = [];

      for (const field of requiredFields) {
        const value = salesOrder.getValue({ fieldId: field.id });
        if (!value) {
          missingFields.push(field.label);
        }
      }

      const lineCount = salesOrder.getLineCount({ sublistId: 'item' });
      if (lineCount === 0) {
        missingFields.push('At least one line item');
      }

      if (missingFields.length > 0) {
        throw new Error('Missing required fields: ' + missingFields.join(', '));
      }
    }

    /**
     * Validates order against customer credit limit
     * @param {Record} salesOrder - Sales order record
     * @throws {Error} If credit limit would be exceeded
     */
    function validateCreditLimit(salesOrder) {
      const customerId = salesOrder.getValue({ fieldId: 'entity' });
      const orderTotal = salesOrder.getValue({ fieldId: 'total' });

      if (!customerId) {
        return;
      }

      const customerData = getCustomerCreditData(customerId);

      if (utils.wouldExceedCreditLimit(
        customerData.balance,
        customerData.creditLimit,
        orderTotal
      )) {
        const available = utils.calculateAvailableCredit(
          customerData.creditLimit,
          customerData.balance
        );
        throw new Error(
          'Order exceeds customer credit limit. ' +
          'Order Total: ' + utils.formatCurrency(orderTotal) + '. ' +
          'Available Credit: ' + utils.formatCurrency(available) + '. ' +
          'Please contact Credit Management for approval.'
        );
      }
    }

    /**
     * Creates a follow-up task for large orders
     * @param {Record} salesOrder - Sales order record
     */
    function createFollowUpTask(salesOrder) {
      const orderId = salesOrder.id;
      const orderNum = salesOrder.getValue({ fieldId: 'tranid' });
      const customerId = salesOrder.getValue({ fieldId: 'entity' });
      const orderTotal = salesOrder.getValue({ fieldId: 'total' });
      const salesRep = salesOrder.getValue({ fieldId: 'salesrep' });

      const task = record.create({
        type: record.Type.TASK,
        isDynamic: true
      });

      task.setValue({
        fieldId: 'title',
        value: 'Follow-up: Large Order ' + orderNum
      });

      task.setValue({
        fieldId: 'message',
        value: 'Large order (' + utils.formatCurrency(orderTotal) + ') requires follow-up. ' +
               'Please confirm inventory availability and delivery timeline with customer.'
      });

      task.setValue({
        fieldId: 'company',
        value: customerId
      });

      task.setValue({
        fieldId: 'transaction',
        value: orderId
      });

      if (salesRep) {
        task.setValue({
          fieldId: 'assigned',
          value: salesRep
        });
      }

      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 1);
      task.setValue({
        fieldId: 'duedate',
        value: dueDate
      });

      task.setValue({
        fieldId: 'priority',
        value: 'HIGH'
      });

      const taskId = task.save();

      log.audit({
        title: 'Large Order Task Created',
        details: 'Task ID: ' + taskId + ' for Order: ' + orderNum
      });
    }

    return {
      beforeLoad: beforeLoad,
      beforeSubmit: beforeSubmit,
      afterSubmit: afterSubmit
    };

  });
