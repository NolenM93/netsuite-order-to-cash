/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 * @NModuleScope SameAccount
 *
 * Customer AR Aging Summary Map/Reduce Script
 * Calculates aging buckets for all customers with open invoices
 * and writes summaries to a custom record
 *
 * @author Nolen Millington
 */
define(['N/search', 'N/record', '../lib/OTC_Lib_Utils'],
  (search, record, utils) => {

    /**
     * Custom record type ID for AR aging summary
     * @constant {string}
     */
    const AGING_RECORD_TYPE = 'customrecord_otc_ar_aging';

    /**
     * Defines the input data for the map phase
     * Returns the search object directly for optimal governance
     * @returns {search.Search} Search object
     */
    const getInputData = () => {
      log.audit({ title: 'AR Aging Summary - getInputData', details: 'Starting data collection' });

      return search.create({
        type: search.Type.INVOICE,
        filters: [
          ['mainline', 'is', 'T'],
          'AND',
          ['status', 'anyof', ['CustInvc:A']],
          'AND',
          ['amountremaining', 'greaterthan', 0]
        ],
        columns: [
          search.createColumn({ name: 'internalid', join: 'customer' }),
          search.createColumn({ name: 'companyname', join: 'customer' }),
          search.createColumn({ name: 'duedate' }),
          search.createColumn({ name: 'amountremaining' }),
          search.createColumn({ name: 'tranid' }),
          search.createColumn({ name: 'internalid' })
        ]
      });
    };

    /**
     * Maps invoice data to customer key with aging calculations
     * @param {Object} context - Map context
     */
    const map = (context) => {
      try {
        const searchResult = JSON.parse(context.value);
        const values = searchResult.values;

        const customerIdObj = values['internalid.customer'];
        const customerId = customerIdObj?.value ?? null;

        if (!customerId) {
          return;
        }

        const customerNameObj = values['companyname.customer'];
        const customerName = customerNameObj || 'Unknown Customer';

        const dueDate = values.duedate;
        const amountRemaining = parseFloat(values.amountremaining) || 0;
        const invoiceId = values.internalid?.value ?? null;
        const tranId = values.tranid;

        const daysOverdue = utils.calculateDaysOverdue(new Date(dueDate));
        const agingBucket = utils.getAgingBucket(daysOverdue);

        context.write({
          key: customerId,
          value: JSON.stringify({
            invoiceId,
            tranId,
            dueDate,
            amountRemaining,
            daysOverdue,
            agingBucket,
            customerName
          })
        });
      } catch (e) {
        log.error({ title: 'Map Error', details: `Key: ${context.key}, Error: ${e.message}` });
      }
    };

    /**
     * Reduces invoice data by customer to create aging summary
     * @param {Object} context - Reduce context
     */
    const reduce = (context) => {
      try {
        const customerId = context.key;

        const agingSummary = {
          customerId,
          customerName: '',
          current: 0,
          days1to30: 0,
          days31to60: 0,
          days61to90: 0,
          over90: 0,
          totalOutstanding: 0,
          invoiceCount: 0,
          oldestInvoiceDays: 0
        };

        for (const value of context.values) {
          const invoice = JSON.parse(value);

          if (!agingSummary.customerName) {
            agingSummary.customerName = invoice.customerName;
          }

          agingSummary.invoiceCount++;
          agingSummary.totalOutstanding += invoice.amountRemaining;

          if (invoice.daysOverdue > agingSummary.oldestInvoiceDays) {
            agingSummary.oldestInvoiceDays = invoice.daysOverdue;
          }

          const bucketMap = {
            'Current': 'current',
            '1-30 Days': 'days1to30',
            '31-60 Days': 'days31to60',
            '61-90 Days': 'days61to90',
            'Over 90 Days': 'over90'
          };

          const bucketKey = bucketMap[invoice.agingBucket];
          if (bucketKey) {
            agingSummary[bucketKey] += invoice.amountRemaining;
          }
        }

        saveAgingSummary(agingSummary);

        context.write({
          key: customerId,
          value: JSON.stringify({
            success: true,
            customerName: agingSummary.customerName,
            totalOutstanding: agingSummary.totalOutstanding
          })
        });
      } catch (e) {
        log.error({ title: 'Reduce Error', details: `Customer: ${context.key}, Error: ${e.message}` });

        context.write({
          key: context.key,
          value: JSON.stringify({ success: false, error: e.message })
        });
      }
    };

    /**
     * Saves aging summary to custom record
     * @param {Object} summary - Aging summary data
     */
    const saveAgingSummary = (summary) => {
      const existingRecord = findExistingRecord(summary.customerId);
      const agingRecord = existingRecord
        ? record.load({ type: AGING_RECORD_TYPE, id: existingRecord })
        : record.create({ type: AGING_RECORD_TYPE });

      if (!existingRecord) {
        agingRecord.setValue({ fieldId: 'custrecord_otc_aging_customer', value: summary.customerId });
      }

      const safeName = summary.customerName.substring(0, 50);
      agingRecord.setValue({ fieldId: 'name', value: `AR Aging - ${safeName}` });
      agingRecord.setValue({ fieldId: 'custrecord_otc_aging_current', value: summary.current });
      agingRecord.setValue({ fieldId: 'custrecord_otc_aging_1_30', value: summary.days1to30 });
      agingRecord.setValue({ fieldId: 'custrecord_otc_aging_31_60', value: summary.days31to60 });
      agingRecord.setValue({ fieldId: 'custrecord_otc_aging_61_90', value: summary.days61to90 });
      agingRecord.setValue({ fieldId: 'custrecord_otc_aging_over_90', value: summary.over90 });
      agingRecord.setValue({ fieldId: 'custrecord_otc_aging_total', value: summary.totalOutstanding });
      agingRecord.setValue({ fieldId: 'custrecord_otc_aging_invoice_count', value: summary.invoiceCount });
      agingRecord.setValue({ fieldId: 'custrecord_otc_aging_oldest_days', value: summary.oldestInvoiceDays });
      agingRecord.setValue({ fieldId: 'custrecord_otc_aging_last_updated', value: new Date() });

      agingRecord.save();
    };

    /**
     * Finds existing aging record for a customer
     * @param {string} customerId - Customer internal ID
     * @returns {string|null} Record internal ID or null
     */
    const findExistingRecord = (customerId) => {
      const existingSearch = search.create({
        type: AGING_RECORD_TYPE,
        filters: [['custrecord_otc_aging_customer', 'anyof', customerId]],
        columns: ['internalid']
      });

      let existingId = null;

      existingSearch.run().each((result) => {
        existingId = result.id;
        return false;
      });

      return existingId;
    };

    /**
     * Summarizes script execution and reports errors
     * @param {Object} summary - Summary context
     */
    const summarize = (summary) => {
      log.audit({
        title: 'AR Aging Summary - Summarize',
        details: JSON.stringify({
          dateCreated: summary.dateCreated,
          seconds: summary.seconds,
          usage: summary.usage,
          concurrency: summary.concurrency,
          yields: summary.yields
        })
      });

      let successCount = 0;
      let errorCount = 0;
      const errors = [];

      summary.output.iterator().each((key, value) => {
        const result = JSON.parse(value);
        if (result.success) {
          successCount++;
        } else {
          errorCount++;
          errors.push({ customerId: key, error: result.error });
        }
        return true;
      });

      log.audit({
        title: 'Processing Results',
        details: JSON.stringify({ successCount, errorCount })
      });

      if (summary.inputSummary.error) {
        log.error({ title: 'Input Error', details: summary.inputSummary.error });
      }

      summary.mapSummary.errors.iterator().each((key, error) => {
        log.error({ title: 'Map Error', details: `Key: ${key}, Error: ${error}` });
        return true;
      });

      summary.reduceSummary.errors.iterator().each((key, error) => {
        log.error({ title: 'Reduce Error', details: `Key: ${key}, Error: ${error}` });
        return true;
      });

      if (errors.length > 0) {
        log.error({
          title: 'Customer Processing Errors',
          details: JSON.stringify(errors.slice(0, 10))
        });
      }
    };

    return { getInputData, map, reduce, summarize };

  });
