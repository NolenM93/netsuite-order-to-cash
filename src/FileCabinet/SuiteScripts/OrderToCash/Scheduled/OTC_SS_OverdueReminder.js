/**
 * @NApiVersion 2.1
 * @NScriptType ScheduledScript
 * @NModuleScope SameAccount
 *
 * Daily Overdue Invoice Reminder Script
 * Searches for past-due invoices and sends reminder emails to customers
 * Governance-aware with proper usage tracking and rescheduling
 *
 * @author Nolen Millington
 */
define(['N/search', 'N/email', 'N/runtime', 'N/record', 'N/render', '../lib/OTC_Lib_Utils'],
  function(search, email, runtime, record, render, utils) {

    /**
     * Governance threshold - stop processing when remaining units fall below this
     * @constant {number}
     */
    const GOVERNANCE_THRESHOLD = 200;

    /**
     * Units consumed per email send operation
     * @constant {number}
     */
    const UNITS_PER_EMAIL = 10;

    /**
     * Main execution entry point
     * @param {Object} context - Script context
     */
    function execute(_context) {
      const startTime = Date.now();

      log.audit({
        title: 'Overdue Reminder - Started',
        details: 'Script execution started'
      });

      const results = {
        processed: 0,
        emailsSent: 0,
        errors: [],
        skippedNoEmail: 0
      };

      try {
        const overdueInvoices = searchOverdueInvoices();

        log.audit({
          title: 'Overdue Invoices Found',
          details: 'Count: ' + overdueInvoices.length
        });

        for (const invoice of overdueInvoices) {
          if (!checkGovernance()) {
            log.audit({
              title: 'Governance Limit Approaching',
              details: 'Stopping to prevent timeout. Processed: ' + results.processed
            });
            break;
          }

          try {
            const sent = processInvoice(invoice, results);
            results.processed++;

            if (sent) {
              results.emailsSent++;
            }
          } catch (e) {
            results.errors.push({
              invoiceId: invoice.id,
              error: e.message
            });

            log.error({
              title: 'Invoice Processing Error',
              details: 'Invoice: ' + invoice.id + ', Error: ' + e.message
            });
          }
        }

      } catch (e) {
        log.error({
          title: 'Script Execution Error',
          details: e.message
        });
      }

      const duration = Date.now() - startTime;

      log.audit({
        title: 'Overdue Reminder - Completed',
        details: JSON.stringify({
          duration: duration + 'ms',
          processed: results.processed,
          emailsSent: results.emailsSent,
          skippedNoEmail: results.skippedNoEmail,
          errors: results.errors.length
        })
      });
    }

    /**
     * Searches for overdue invoices
     * @returns {Array<Object>} Array of overdue invoice data
     */
    function searchOverdueInvoices() {
      const invoiceSearch = search.create({
        type: search.Type.INVOICE,
        filters: [
          ['mainline', 'is', 'T'],
          'AND',
          ['status', 'anyof', ['CustInvc:A']],
          'AND',
          ['duedate', 'before', 'today'],
          'AND',
          ['amountremaining', 'greaterthan', 0]
        ],
        columns: [
          search.createColumn({ name: 'tranid' }),
          search.createColumn({ name: 'entity' }),
          search.createColumn({ name: 'duedate' }),
          search.createColumn({ name: 'amountremaining' }),
          search.createColumn({ name: 'total' }),
          search.createColumn({ name: 'email', join: 'customer' }),
          search.createColumn({ name: 'companyname', join: 'customer' }),
          search.createColumn({ name: 'internalid', join: 'customer' })
        ]
      });

      const results = [];

      invoiceSearch.run().each(function(result) {
        results.push({
          id: result.id,
          tranId: result.getValue({ name: 'tranid' }),
          customerId: result.getValue({ name: 'internalid', join: 'customer' }),
          customerName: result.getValue({ name: 'companyname', join: 'customer' }),
          customerEmail: result.getValue({ name: 'email', join: 'customer' }),
          dueDate: result.getValue({ name: 'duedate' }),
          amountRemaining: parseFloat(result.getValue({ name: 'amountremaining' })) || 0,
          total: parseFloat(result.getValue({ name: 'total' })) || 0
        });

        return true;
      });

      return results;
    }

    /**
     * Processes a single overdue invoice
     * @param {Object} invoice - Invoice data
     * @param {Object} results - Results tracking object
     * @returns {boolean} True if email was sent
     */
    function processInvoice(invoice, results) {
      if (!invoice.customerEmail || !utils.isValidEmail(invoice.customerEmail)) {
        results.skippedNoEmail++;

        log.debug({
          title: 'Skipped - No Valid Email',
          details: 'Invoice: ' + invoice.tranId + ', Customer: ' + invoice.customerName
        });

        return false;
      }

      const daysOverdue = utils.calculateDaysOverdue(new Date(invoice.dueDate));
      const agingBucket = utils.getAgingBucket(daysOverdue);

      const emailBody = buildEmailBody(invoice, daysOverdue, agingBucket);

      sendReminderEmail(invoice, emailBody);

      log.audit({
        title: 'Reminder Sent',
        details: JSON.stringify({
          invoice: invoice.tranId,
          customer: invoice.customerName,
          daysOverdue: daysOverdue,
          amount: invoice.amountRemaining
        })
      });

      return true;
    }

    /**
     * Builds the email body for the reminder
     * @param {Object} invoice - Invoice data
     * @param {number} daysOverdue - Days past due
     * @param {string} agingBucket - Aging bucket label
     * @returns {string} HTML email body
     */
    function buildEmailBody(invoice, daysOverdue, agingBucket) {
      let body = '<html><body style="font-family: Arial, sans-serif;">';

      body += '<h2>Payment Reminder</h2>';
      body += '<p>Dear ' + invoice.customerName + ',</p>';
      body += '<p>This is a friendly reminder that the following invoice is past due:</p>';

      body += '<table style="border-collapse: collapse; margin: 20px 0;">';
      body += '<tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Invoice Number:</strong></td>';
      body += '<td style="padding: 8px; border: 1px solid #ddd;">' + invoice.tranId + '</td></tr>';
      body += '<tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Due Date:</strong></td>';
      body += '<td style="padding: 8px; border: 1px solid #ddd;">' + invoice.dueDate + '</td></tr>';
      body += '<tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Days Overdue:</strong></td>';
      body += '<td style="padding: 8px; border: 1px solid #ddd;">' + daysOverdue + ' (' + agingBucket + ')</td></tr>';
      body += '<tr><td style="padding: 8px; border: 1px solid #ddd;"><strong>Amount Due:</strong></td>';
      body += '<td style="padding: 8px; border: 1px solid #ddd;">' + utils.formatCurrency(invoice.amountRemaining) + '</td></tr>';
      body += '</table>';

      body += '<p>Please remit payment at your earliest convenience. ';
      body += 'If you have already sent payment, please disregard this notice.</p>';

      body += '<p>If you have any questions regarding this invoice, ';
      body += 'please contact our accounts receivable department.</p>';

      body += '<p>Thank you for your business.</p>';

      body += '<hr style="margin-top: 30px;"/>';
      body += '<p style="font-size: 12px; color: #666;">This is an automated message from ';
      body += 'Acme Wholesale Distributors (fictional company for demo purposes).</p>';

      body += '</body></html>';

      return body;
    }

    /**
     * Sends the reminder email
     * @param {Object} invoice - Invoice data
     * @param {string} body - Email body HTML
     */
    function sendReminderEmail(invoice, body) {
      const currentUser = runtime.getCurrentUser();

      email.send({
        author: currentUser.id,
        recipients: invoice.customerEmail,
        subject: 'Payment Reminder: Invoice ' + invoice.tranId + ' - ' +
                 utils.formatCurrency(invoice.amountRemaining) + ' Past Due',
        body: body,
        relatedRecords: {
          transactionId: invoice.id,
          entityId: invoice.customerId
        }
      });
    }

    /**
     * Checks if governance units are sufficient to continue
     * @returns {boolean} True if safe to continue processing
     */
    function checkGovernance() {
      const remainingUsage = runtime.getCurrentScript().getRemainingUsage();
      return utils.hasGovernanceCapacity(remainingUsage, GOVERNANCE_THRESHOLD + UNITS_PER_EMAIL);
    }

    return {
      execute: execute
    };

  });
