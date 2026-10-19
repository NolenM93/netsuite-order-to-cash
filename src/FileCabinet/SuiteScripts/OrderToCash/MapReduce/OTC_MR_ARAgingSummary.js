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
define(['N/search', 'N/record', 'N/runtime', '../lib/OTC_Lib_Utils'],
  function(search, record, runtime, utils) {

    /**
     * Custom record type ID for AR aging summary
     * @constant {string}
     */
    const AGING_RECORD_TYPE = 'customrecord_otc_ar_aging';

    /**
     * Defines the input data for the map phase
     * Returns a search of open invoices grouped by customer
     * @returns {Object} Search object
     */
    function getInputData() {
      log.audit({
        title: 'AR Aging Summary - getInputData',
        details: 'Starting data collection'
      });

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
          search.createColumn({ name: 'internalid', join: 'customer', summary: 'GROUP' }),
          search.createColumn({ name: 'companyname', join: 'customer', summary: 'GROUP' }),
          search.createColumn({ name: 'duedate' }),
          search.createColumn({ name: 'amountremaining' }),
          search.createColumn({ name: 'tranid' }),
          search.createColumn({ name: 'internalid' })
        ]
      });
    }

    /**
     * Maps invoice data to customer key with aging calculations
     * @param {Object} context - Map context
     * @param {string} context.key - Search result key
     * @param {string} context.value - Search result value (JSON)
     */
    function map(context) {
      try {
        const searchResult = JSON.parse(context.value);
        const values = searchResult.values;

        const customerIdObj = values['GROUP(internalid.customer)'];
        const customerId = customerIdObj ? customerIdObj.value : null;

        if (!customerId) {
          return;
        }

        const customerNameObj = values['GROUP(companyname.customer)'];
        const customerName = customerNameObj || 'Unknown Customer';

        const dueDate = values.duedate;
        const amountRemaining = parseFloat(values.amountremaining) || 0;
        const invoiceId = values.internalid ? values.internalid.value : null;
        const tranId = values.tranid;

        const daysOverdue = utils.calculateDaysOverdue(new Date(dueDate));
        const agingBucket = utils.getAgingBucket(daysOverdue);

        const invoiceData = {
          invoiceId: invoiceId,
          tranId: tranId,
          dueDate: dueDate,
          amountRemaining: amountRemaining,
          daysOverdue: daysOverdue,
          agingBucket: agingBucket,
          customerName: customerName
        };

        context.write({
          key: customerId,
          value: JSON.stringify(invoiceData)
        });

      } catch (e) {
        log.error({
          title: 'Map Error',
          details: 'Key: ' + context.key + ', Error: ' + e.message
        });
      }
    }

    /**
     * Reduces invoice data by customer to create aging summary
     * @param {Object} context - Reduce context
     * @param {string} context.key - Customer ID
     * @param {Array<string>} context.values - Invoice data JSON strings
     */
    function reduce(context) {
      try {
        const customerId = context.key;

        const agingSummary = {
          customerId: customerId,
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

          switch (invoice.agingBucket) {
            case 'Current':
              agingSummary.current += invoice.amountRemaining;
              break;
            case '1-30 Days':
              agingSummary.days1to30 += invoice.amountRemaining;
              break;
            case '31-60 Days':
              agingSummary.days31to60 += invoice.amountRemaining;
              break;
            case '61-90 Days':
              agingSummary.days61to90 += invoice.amountRemaining;
              break;
            case 'Over 90 Days':
              agingSummary.over90 += invoice.amountRemaining;
              break;
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
        log.error({
          title: 'Reduce Error',
          details: 'Customer: ' + context.key + ', Error: ' + e.message
        });

        context.write({
          key: context.key,
          value: JSON.stringify({
            success: false,
            error: e.message
          })
        });
      }
    }

    /**
     * Saves aging summary to custom record
     * @param {Object} summary - Aging summary data
     */
    function saveAgingSummary(summary) {
      const existingRecord = findExistingRecord(summary.customerId);
      let agingRecord;

      if (existingRecord) {
        agingRecord = record.load({
          type: AGING_RECORD_TYPE,
          id: existingRecord
        });
      } else {
        agingRecord = record.create({
          type: AGING_RECORD_TYPE
        });

        agingRecord.setValue({
          fieldId: 'custrecord_otc_aging_customer',
          value: summary.customerId
        });
      }

      agingRecord.setValue({
        fieldId: 'name',
        value: 'AR Aging - ' + summary.customerName.substring(0, 50)
      });

      agingRecord.setValue({
        fieldId: 'custrecord_otc_aging_current',
        value: summary.current
      });

      agingRecord.setValue({
        fieldId: 'custrecord_otc_aging_1_30',
        value: summary.days1to30
      });

      agingRecord.setValue({
        fieldId: 'custrecord_otc_aging_31_60',
        value: summary.days31to60
      });

      agingRecord.setValue({
        fieldId: 'custrecord_otc_aging_61_90',
        value: summary.days61to90
      });

      agingRecord.setValue({
        fieldId: 'custrecord_otc_aging_over_90',
        value: summary.over90
      });

      agingRecord.setValue({
        fieldId: 'custrecord_otc_aging_total',
        value: summary.totalOutstanding
      });

      agingRecord.setValue({
        fieldId: 'custrecord_otc_aging_invoice_count',
        value: summary.invoiceCount
      });

      agingRecord.setValue({
        fieldId: 'custrecord_otc_aging_oldest_days',
        value: summary.oldestInvoiceDays
      });

      agingRecord.setValue({
        fieldId: 'custrecord_otc_aging_last_updated',
        value: new Date()
      });

      agingRecord.save();
    }

    /**
     * Finds existing aging record for a customer
     * @param {string} customerId - Customer internal ID
     * @returns {string|null} Record internal ID or null
     */
    function findExistingRecord(customerId) {
      const existingSearch = search.create({
        type: AGING_RECORD_TYPE,
        filters: [
          ['custrecord_otc_aging_customer', 'anyof', customerId]
        ],
        columns: ['internalid']
      });

      let existingId = null;

      existingSearch.run().each(function(result) {
        existingId = result.id;
        return false;
      });

      return existingId;
    }

    /**
     * Summarizes script execution and reports errors
     * @param {Object} summary - Summary context
     */
    function summarize(summary) {
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

      summary.output.iterator().each(function(key, value) {
        const result = JSON.parse(value);
        if (result.success) {
          successCount++;
        } else {
          errorCount++;
          errors.push({
            customerId: key,
            error: result.error
          });
        }
        return true;
      });

      log.audit({
        title: 'Processing Results',
        details: JSON.stringify({
          successCount: successCount,
          errorCount: errorCount
        })
      });

      if (summary.inputSummary.error) {
        log.error({
          title: 'Input Error',
          details: summary.inputSummary.error
        });
      }

      summary.mapSummary.errors.iterator().each(function(key, error) {
        log.error({
          title: 'Map Error',
          details: 'Key: ' + key + ', Error: ' + error
        });
        return true;
      });

      summary.reduceSummary.errors.iterator().each(function(key, error) {
        log.error({
          title: 'Reduce Error',
          details: 'Key: ' + key + ', Error: ' + error
        });
        return true;
      });

      if (errors.length > 0) {
        log.error({
          title: 'Customer Processing Errors',
          details: JSON.stringify(errors.slice(0, 10))
        });
      }
    }

    return {
      getInputData: getInputData,
      map: map,
      reduce: reduce,
      summarize: summarize
    };

  });
