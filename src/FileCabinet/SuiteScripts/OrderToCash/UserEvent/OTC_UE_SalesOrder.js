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
define(['N/record', 'N/search', 'N/ui/serverWidget', 'N/runtime', 'N/error', '../lib/OTC_Lib_Utils'],
  (record, search, serverWidget, runtime, error, utils) => {

    /**
     * Gets script configuration from parameters
     * @returns {Object} Configuration object
     */
    const getConfig = () => {
      const script = runtime.getCurrentScript();
      const getParamFn = (opts) => script.getParameter(opts);
      return {
        largeOrderThreshold: utils.getScriptParam(getParamFn, 'custscript_otc_large_order_amt', utils.DEFAULTS.LARGE_ORDER_THRESHOLD, true),
        creditWarningPct: utils.getScriptParam(getParamFn, 'custscript_otc_credit_warn_pct', utils.DEFAULTS.CREDIT_WARNING_PERCENT, true),
        taskAssignee: utils.getScriptParam(getParamFn, 'custscript_otc_task_assignee', null)
      };
    };

    /**
     * Adds credit status information to the sales order form
     * @param {Object} context - Entry point context
     */
    const beforeLoad = (context) => {
      const { type, UserEventType, newRecord, form } = context;

      if (type !== UserEventType.VIEW && type !== UserEventType.EDIT) {
        return;
      }

      const customerId = newRecord.getValue({ fieldId: 'entity' });
      if (!customerId) {
        return;
      }

      try {
        const config = getConfig();
        const customerData = getCustomerCreditData(customerId);
        const utilization = utils.calculateCreditUtilization(
          customerData.balance,
          customerData.creditLimit
        );
        const creditStatus = utils.getCreditStatus(utilization, config.creditWarningPct);

        addCreditStatusField(form, creditStatus, customerData, utilization);
      } catch (e) {
        log.error({ title: 'OTC_UE_SalesOrder.beforeLoad', details: e.message });
      }
    };

    /**
     * Validates required fields and credit limit before save
     * @param {Object} context - Entry point context
     */
    const beforeSubmit = (context) => {
      const { type, UserEventType, newRecord } = context;

      if (type !== UserEventType.CREATE && type !== UserEventType.EDIT) {
        return;
      }

      validateRequiredFields(newRecord);

      if (shouldCheckCredit(context)) {
        validateCreditLimit(newRecord);
      }
    };

    /**
     * Determines if credit check should run on EDIT
     * Only checks when customer or total changed, and customer has a credit limit
     * @param {Object} context - Entry point context
     * @returns {boolean} True if credit check should run
     */
    const shouldCheckCredit = (context) => {
      const { type, UserEventType, newRecord, oldRecord } = context;

      if (type === UserEventType.CREATE) {
        return true;
      }

      const newCustomer = newRecord.getValue({ fieldId: 'entity' });
      const newTotal = parseFloat(newRecord.getValue({ fieldId: 'total' })) || 0;
      const oldCustomer = oldRecord?.getValue({ fieldId: 'entity' });
      const oldTotal = parseFloat(oldRecord?.getValue({ fieldId: 'total' })) || 0;

      const customerChanged = newCustomer !== oldCustomer;
      const totalChanged = Math.abs(newTotal - oldTotal) > 0.01;

      if (!customerChanged && !totalChanged) {
        return false;
      }

      const customerData = getCustomerCreditData(newCustomer);
      return customerData.creditLimit > 0;
    };

    /**
     * Creates follow-up task for large orders
     * @param {Object} context - Entry point context
     */
    const afterSubmit = (context) => {
      const { type, UserEventType, newRecord } = context;

      if (type !== UserEventType.CREATE) {
        return;
      }

      const config = getConfig();
      const orderTotal = newRecord.getValue({ fieldId: 'total' });

      if (utils.isLargeOrder(orderTotal, config.largeOrderThreshold)) {
        try {
          createFollowUpTask(newRecord, config);
        } catch (e) {
          log.error({ title: 'OTC_UE_SalesOrder.afterSubmit', details: e.message });
        }
      }
    };

    /**
     * Retrieves customer credit data via search
     * @param {number} customerId - Internal ID of customer
     * @returns {Object} Customer credit data
     */
    const getCustomerCreditData = (customerId) => {
      const fields = search.lookupFields({
        type: search.Type.CUSTOMER,
        id: customerId,
        columns: ['creditlimit', 'balance', 'companyname', 'entityid']
      });

      return {
        creditLimit: parseFloat(fields.creditlimit) || 0,
        balance: parseFloat(fields.balance) || 0,
        companyName: fields.companyname || fields.entityid || 'Customer'
      };
    };

    /**
     * Adds credit status field to the form
     * @param {Form} form - UI form object
     * @param {Object} creditStatus - Status object from utils
     * @param {Object} customerData - Customer credit data
     * @param {number|null} utilization - Credit utilization
     */
    const addCreditStatusField = (form, creditStatus, customerData, utilization) => {
      const statusField = form.addField({
        id: 'custpage_credit_status',
        type: serverWidget.FieldType.INLINEHTML,
        label: 'Credit Status'
      });

      const bgColors = {
        green: '#e8f5e9',
        orange: '#fff3e0',
        red: '#ffebee',
        gray: '#f5f5f5'
      };

      const bgColor = bgColors[creditStatus.color] || bgColors.gray;
      const safeLabel = utils.escapeHtml(creditStatus.label);

      let statusHtml = `<div style="padding: 10px; border-radius: 4px; background-color: ${bgColor}; border-left: 4px solid ${creditStatus.color};">`;
      statusHtml += `<strong>Credit Status: </strong>${safeLabel}`;

      if (utilization !== null) {
        const utilizationPct = (utilization * 100).toFixed(1);
        const available = utils.calculateAvailableCredit(customerData.creditLimit, customerData.balance);
        statusHtml += `<br/>Utilization: ${utilizationPct}%`;
        statusHtml += `<br/>Available Credit: ${utils.formatCurrency(available)}`;
      }

      statusHtml += '</div>';
      statusField.defaultValue = statusHtml;
    };

    /**
     * Validates required fields on sales order
     * @param {Record} salesOrder - Sales order record
     * @throws {error.SuiteScriptError} If validation fails
     */
    const validateRequiredFields = (salesOrder) => {
      const requiredFields = [
        { id: 'entity', label: 'Customer' },
        { id: 'trandate', label: 'Date' }
      ];

      const missingFields = requiredFields
        .filter((field) => !salesOrder.getValue({ fieldId: field.id }))
        .map((field) => field.label);

      const lineCount = salesOrder.getLineCount({ sublistId: 'item' });
      if (lineCount === 0) {
        missingFields.push('At least one line item');
      }

      if (missingFields.length > 0) {
        throw error.create({
          name: 'OTC_MISSING_FIELDS',
          message: `Missing required fields: ${missingFields.join(', ')}`,
          notifyOff: true
        });
      }
    };

    /**
     * Validates order against customer credit limit
     * @param {Record} salesOrder - Sales order record
     * @throws {error.SuiteScriptError} If credit limit would be exceeded
     */
    const validateCreditLimit = (salesOrder) => {
      const customerId = salesOrder.getValue({ fieldId: 'entity' });
      const orderTotal = salesOrder.getValue({ fieldId: 'total' });

      if (!customerId) {
        return;
      }

      const customerData = getCustomerCreditData(customerId);

      if (utils.wouldExceedCreditLimit(customerData.balance, customerData.creditLimit, orderTotal)) {
        const available = utils.calculateAvailableCredit(customerData.creditLimit, customerData.balance);
        throw error.create({
          name: 'OTC_CREDIT_LIMIT_EXCEEDED',
          message: `Order exceeds customer credit limit. Order Total: ${utils.formatCurrency(orderTotal)}. Available Credit: ${utils.formatCurrency(available)}. Please contact Credit Management for approval.`,
          notifyOff: true
        });
      }
    };

    /**
     * Creates a follow-up task for large orders
     * @param {Record} salesOrder - Sales order record
     * @param {Object} config - Script configuration
     */
    const createFollowUpTask = (salesOrder, config) => {
      const orderId = salesOrder.id;
      const orderNum = salesOrder.getValue({ fieldId: 'tranid' });
      const customerId = salesOrder.getValue({ fieldId: 'entity' });
      const orderTotal = salesOrder.getValue({ fieldId: 'total' });
      const salesRep = salesOrder.getValue({ fieldId: 'salesrep' });

      const task = record.create({
        type: record.Type.TASK,
        isDynamic: true
      });

      task.setValue({ fieldId: 'title', value: `Follow-up: Large Order ${orderNum}` });
      task.setValue({
        fieldId: 'message',
        value: `Large order (${utils.formatCurrency(orderTotal)}) requires follow-up. Please confirm inventory availability and delivery timeline with customer.`
      });
      task.setValue({ fieldId: 'company', value: customerId });
      task.setValue({ fieldId: 'transaction', value: orderId });

      const assignee = config.taskAssignee || salesRep;
      if (assignee) {
        task.setValue({ fieldId: 'assigned', value: assignee });
      }

      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 1);
      task.setValue({ fieldId: 'duedate', value: dueDate });
      task.setValue({ fieldId: 'priority', value: 'HIGH' });

      const taskId = task.save();
      log.audit({ title: 'Large Order Task Created', details: `Task ID: ${taskId} for Order: ${orderNum}` });
    };

    return { beforeLoad, beforeSubmit, afterSubmit };

  });
