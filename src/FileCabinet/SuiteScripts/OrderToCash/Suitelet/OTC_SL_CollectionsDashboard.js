/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 * @NModuleScope SameAccount
 *
 * Collections Dashboard Suitelet
 * Internal dashboard for viewing overdue invoices with filters
 * and triggering reminder emails
 *
 * @author Nolen Millington
 */
define(['N/ui/serverWidget', 'N/search', 'N/url', 'N/redirect', 'N/task', 'N/runtime', '../lib/OTC_Lib_Utils'],
  (serverWidget, search, url, redirect, task, runtime, utils) => {

    /**
     * Main entry point for Suitelet
     * @param {Object} context - Entry point context
     */
    const onRequest = (context) => {
      if (context.request.method === 'GET') {
        handleGet(context);
      } else {
        handlePost(context);
      }
    };

    /**
     * Handles GET requests - displays the dashboard
     * @param {Object} context - Entry point context
     */
    const handleGet = (context) => {
      const form = createDashboardForm(context.request.parameters);
      context.response.writePage(form);
    };

    /**
     * Handles POST requests - triggers reminder script
     * @param {Object} context - Entry point context
     */
    const handlePost = (context) => {
      const { custpage_action: action } = context.request.parameters;

      if (action === 'send_reminders') {
        triggerReminderScript();

        redirect.toSuitelet({
          scriptId: runtime.getCurrentScript().id,
          deploymentId: runtime.getCurrentScript().deploymentId,
          parameters: { message: 'Reminder emails have been scheduled to send.' }
        });
      } else {
        handleGet(context);
      }
    };

    /**
     * Creates the dashboard form with filters and results
     * @param {Object} params - Request parameters for filtering
     * @returns {Form} Server widget form
     */
    const createDashboardForm = (params) => {
      const form = serverWidget.createForm({ title: 'Collections Dashboard' });

      if (params.message) {
        form.addPageInitMessage({
          type: serverWidget.MessageType.CONFIRMATION,
          message: params.message
        });
      }

      addFilterFields(form, params);
      addActionButtons(form);
      addOverdueInvoiceSublist(form, params);
      addSummaryFields(form, params);

      return form;
    };

    /**
     * Adds filter fields to the form
     * @param {Form} form - Server widget form
     * @param {Object} params - Current filter values
     */
    const addFilterFields = (form, params) => {
      form.addFieldGroup({ id: 'custpage_filters', label: 'Filters' });

      const customerField = form.addField({
        id: 'custpage_customer',
        type: serverWidget.FieldType.SELECT,
        label: 'Customer',
        source: 'customer',
        container: 'custpage_filters'
      });
      customerField.isMandatory = false;

      if (params.custpage_customer) {
        customerField.defaultValue = params.custpage_customer;
      }

      const agingField = form.addField({
        id: 'custpage_aging',
        type: serverWidget.FieldType.SELECT,
        label: 'Aging Bucket',
        container: 'custpage_filters'
      });

      agingField.addSelectOption({ value: '', text: '-- All --' });
      agingField.addSelectOption({ value: '1-30', text: '1-30 Days' });
      agingField.addSelectOption({ value: '31-60', text: '31-60 Days' });
      agingField.addSelectOption({ value: '61-90', text: '61-90 Days' });
      agingField.addSelectOption({ value: 'over90', text: 'Over 90 Days' });

      if (params.custpage_aging) {
        agingField.defaultValue = params.custpage_aging;
      }

      const minAmountField = form.addField({
        id: 'custpage_min_amount',
        type: serverWidget.FieldType.CURRENCY,
        label: 'Minimum Amount',
        container: 'custpage_filters'
      });

      if (params.custpage_min_amount) {
        minAmountField.defaultValue = params.custpage_min_amount;
      }

      form.addSubmitButton({ label: 'Apply Filters' });
    };

    /**
     * Adds action buttons to the form
     * @param {Form} form - Server widget form
     */
    const addActionButtons = (form) => {
      form.addButton({
        id: 'custpage_send_reminders',
        label: 'Send Reminder Emails',
        functionName: 'sendReminders'
      });

      form.clientScriptModulePath = './OTC_SL_CollectionsDashboard_Client.js';

      const actionField = form.addField({
        id: 'custpage_action',
        type: serverWidget.FieldType.TEXT,
        label: 'Action'
      });
      actionField.updateDisplayType({ displayType: serverWidget.FieldDisplayType.HIDDEN });
    };

    /**
     * Adds the overdue invoices sublist
     * @param {Form} form - Server widget form
     * @param {Object} params - Filter parameters
     */
    const addOverdueInvoiceSublist = (form, params) => {
      const sublist = form.addSublist({
        id: 'custpage_invoices',
        type: serverWidget.SublistType.LIST,
        label: 'Overdue Invoices'
      });

      sublist.addField({
        id: 'custpage_inv_view',
        type: serverWidget.FieldType.URL,
        label: 'View'
      }).linkText = 'View';

      sublist.addField({ id: 'custpage_inv_number', type: serverWidget.FieldType.TEXT, label: 'Invoice #' });
      sublist.addField({ id: 'custpage_inv_customer', type: serverWidget.FieldType.TEXT, label: 'Customer' });
      sublist.addField({ id: 'custpage_inv_due_date', type: serverWidget.FieldType.DATE, label: 'Due Date' });
      sublist.addField({ id: 'custpage_inv_days_overdue', type: serverWidget.FieldType.INTEGER, label: 'Days Overdue' });
      sublist.addField({ id: 'custpage_inv_aging', type: serverWidget.FieldType.TEXT, label: 'Aging Bucket' });
      sublist.addField({ id: 'custpage_inv_amount', type: serverWidget.FieldType.CURRENCY, label: 'Amount Due' });
      sublist.addField({ id: 'custpage_inv_email', type: serverWidget.FieldType.TEXT, label: 'Customer Email' });

      populateSublist(sublist, params);
    };

    /**
     * Populates the sublist with search results
     * @param {Sublist} sublist - Sublist to populate
     * @param {Object} params - Filter parameters
     */
    const populateSublist = (sublist, params) => {
      const invoices = searchOverdueInvoices(params);

      invoices.forEach((inv, i) => {
        sublist.setSublistValue({
          id: 'custpage_inv_view',
          line: i,
          value: url.resolveRecord({ recordType: 'invoice', recordId: inv.id })
        });

        sublist.setSublistValue({ id: 'custpage_inv_number', line: i, value: utils.escapeHtml(inv.tranId) });
        sublist.setSublistValue({ id: 'custpage_inv_customer', line: i, value: utils.escapeHtml(inv.customerName) });
        sublist.setSublistValue({ id: 'custpage_inv_due_date', line: i, value: inv.dueDate });
        sublist.setSublistValue({ id: 'custpage_inv_days_overdue', line: i, value: String(inv.daysOverdue) });
        sublist.setSublistValue({ id: 'custpage_inv_aging', line: i, value: inv.agingBucket });
        sublist.setSublistValue({ id: 'custpage_inv_amount', line: i, value: String(inv.amountRemaining) });
        sublist.setSublistValue({ id: 'custpage_inv_email', line: i, value: inv.customerEmail || '(none)' });
      });
    };

    /**
     * Adds summary statistics fields
     * @param {Form} form - Server widget form
     * @param {Object} params - Filter parameters
     */
    const addSummaryFields = (form, params) => {
      form.addFieldGroup({ id: 'custpage_summary', label: 'Summary' });

      const invoices = searchOverdueInvoices(params);
      const totalAmount = invoices.reduce((sum, inv) => sum + inv.amountRemaining, 0);

      const countField = form.addField({
        id: 'custpage_total_count',
        type: serverWidget.FieldType.TEXT,
        label: 'Total Overdue Invoices',
        container: 'custpage_summary'
      });
      countField.defaultValue = String(invoices.length);
      countField.updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE });

      const amountField = form.addField({
        id: 'custpage_total_amount',
        type: serverWidget.FieldType.CURRENCY,
        label: 'Total Amount Overdue',
        container: 'custpage_summary'
      });
      amountField.defaultValue = String(totalAmount);
      amountField.updateDisplayType({ displayType: serverWidget.FieldDisplayType.INLINE });
    };

    /**
     * Searches for overdue invoices with optional filters
     * @param {Object} params - Filter parameters
     * @returns {Array<Object>} Array of invoice data
     */
    const searchOverdueInvoices = (params) => {
      const filters = [
        ['mainline', 'is', 'T'],
        'AND',
        ['status', 'anyof', ['CustInvc:A']],
        'AND',
        ['duedate', 'before', 'today'],
        'AND',
        ['amountremaining', 'greaterthan', 0]
      ];

      if (params.custpage_customer) {
        filters.push('AND', ['entity', 'anyof', params.custpage_customer]);
      }

      if (params.custpage_min_amount) {
        filters.push('AND', ['amountremaining', 'greaterthanorequalto', params.custpage_min_amount]);
      }

      const invoiceSearch = search.create({
        type: search.Type.INVOICE,
        filters,
        columns: [
          search.createColumn({ name: 'tranid' }),
          search.createColumn({ name: 'entity' }),
          search.createColumn({ name: 'duedate', sort: search.Sort.ASC }),
          search.createColumn({ name: 'amountremaining' }),
          search.createColumn({ name: 'email', join: 'customer' }),
          search.createColumn({ name: 'companyname', join: 'customer' })
        ]
      });

      const results = [];

      invoiceSearch.run().each((result) => {
        const dueDate = result.getValue({ name: 'duedate' });
        const daysOverdue = utils.calculateDaysOverdue(new Date(dueDate));
        const agingBucket = utils.getAgingBucket(daysOverdue);

        if (params.custpage_aging && !matchesAgingFilter(params.custpage_aging, agingBucket)) {
          return true;
        }

        results.push({
          id: result.id,
          tranId: result.getValue({ name: 'tranid' }),
          customerId: result.getValue({ name: 'entity' }),
          customerName: result.getValue({ name: 'companyname', join: 'customer' }) ||
                       result.getText({ name: 'entity' }),
          customerEmail: result.getValue({ name: 'email', join: 'customer' }),
          dueDate,
          daysOverdue,
          agingBucket,
          amountRemaining: parseFloat(result.getValue({ name: 'amountremaining' })) || 0
        });

        return results.length < 500;
      });

      return results;
    };

    /**
     * Checks if aging bucket matches filter
     * @param {string} filter - Filter value
     * @param {string} bucket - Aging bucket
     * @returns {boolean} True if matches
     */
    const matchesAgingFilter = (filter, bucket) => {
      const filterMap = {
        '1-30': '1-30 Days',
        '31-60': '31-60 Days',
        '61-90': '61-90 Days',
        'over90': 'Over 90 Days'
      };
      return filterMap[filter] === bucket;
    };

    /**
     * Triggers the scheduled reminder script
     */
    const triggerReminderScript = () => {
      const scriptTask = task.create({
        taskType: task.TaskType.SCHEDULED_SCRIPT,
        scriptId: 'customscript_otc_ss_overdue_reminder',
        deploymentId: 'customdeploy_otc_ss_overdue_reminder'
      });

      const taskId = scriptTask.submit();
      log.audit({ title: 'Reminder Script Triggered', details: `Task ID: ${taskId}` });
    };

    return { onRequest };

  });
