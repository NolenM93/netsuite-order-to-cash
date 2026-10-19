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
define(['N/search', 'N/email', 'N/runtime', '../lib/OTC_Lib_Utils'],
  (search, email, runtime, utils) => {

    /**
     * Gets script parameter with fallback to default
     * @param {string} paramId - Parameter ID
     * @param {*} defaultValue - Default value if param not set
     * @returns {*} Parameter value or default
     */
    const getParam = (paramId, defaultValue) => {
      const value = runtime.getCurrentScript().getParameter({ name: paramId });
      return value ?? defaultValue;
    };

    /**
     * Gets script configuration from parameters
     * @returns {Object} Configuration object
     */
    const getConfig = () => ({
      governanceThreshold: getParam('custscript_otc_gov_threshold', utils.DEFAULTS.GOVERNANCE_THRESHOLD),
      unitsPerEmail: getParam('custscript_otc_units_per_email', utils.DEFAULTS.UNITS_PER_EMAIL),
      senderEmployee: getParam('custscript_otc_email_sender', runtime.getCurrentUser().id),
      batchSize: getParam('custscript_otc_batch_size', 500)
    });

    /**
     * Main execution entry point
     * @param {Object} _context - Script context (unused)
     */
    const execute = (_context) => {
      const startTime = Date.now();
      const config = getConfig();

      log.audit({ title: 'Overdue Reminder - Started', details: JSON.stringify(config) });

      const results = {
        processed: 0,
        emailsSent: 0,
        errors: [],
        skippedNoEmail: 0
      };

      try {
        const overdueInvoices = searchOverdueInvoices(config.batchSize);

        log.audit({ title: 'Overdue Invoices Found', details: `Count: ${overdueInvoices.length}` });

        for (const invoice of overdueInvoices) {
          if (!checkGovernance(config)) {
            log.audit({
              title: 'Governance Limit Approaching',
              details: `Stopping to prevent timeout. Processed: ${results.processed}`
            });
            break;
          }

          try {
            const sent = processInvoice(invoice, config, results);
            results.processed++;
            if (sent) {
              results.emailsSent++;
            }
          } catch (e) {
            results.errors.push({ invoiceId: invoice.id, error: e.message });
            log.error({
              title: 'Invoice Processing Error',
              details: `Invoice: ${invoice.id}, Error: ${e.message}`
            });
          }
        }
      } catch (e) {
        log.error({ title: 'Script Execution Error', details: e.message });
      }

      const duration = Date.now() - startTime;

      log.audit({
        title: 'Overdue Reminder - Completed',
        details: JSON.stringify({
          duration: `${duration}ms`,
          processed: results.processed,
          emailsSent: results.emailsSent,
          skippedNoEmail: results.skippedNoEmail,
          errors: results.errors.length
        })
      });
    };

    /**
     * Searches for overdue invoices using search.run().each() for governance
     * @param {number} batchSize - Maximum results to return
     * @returns {Array<Object>} Array of overdue invoice data
     */
    const searchOverdueInvoices = (batchSize) => {
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

      invoiceSearch.run().each((result) => {
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

        return results.length < batchSize;
      });

      return results;
    };

    /**
     * Processes a single overdue invoice
     * @param {Object} invoice - Invoice data
     * @param {Object} config - Script configuration
     * @param {Object} results - Results tracking object
     * @returns {boolean} True if email was sent
     */
    const processInvoice = (invoice, config, results) => {
      if (!invoice.customerEmail || !utils.isValidEmail(invoice.customerEmail)) {
        results.skippedNoEmail++;
        log.debug({
          title: 'Skipped - No Valid Email',
          details: `Invoice: ${invoice.tranId}, Customer: ${invoice.customerName}`
        });
        return false;
      }

      const daysOverdue = utils.calculateDaysOverdue(new Date(invoice.dueDate));
      const agingBucket = utils.getAgingBucket(daysOverdue);
      const emailBody = buildEmailBody(invoice, daysOverdue, agingBucket);

      sendReminderEmail(invoice, emailBody, config);

      log.audit({
        title: 'Reminder Sent',
        details: JSON.stringify({
          invoice: invoice.tranId,
          customer: invoice.customerName,
          daysOverdue,
          amount: invoice.amountRemaining
        })
      });

      return true;
    };

    /**
     * Builds the email body for the reminder
     * @param {Object} invoice - Invoice data
     * @param {number} daysOverdue - Days past due
     * @param {string} agingBucket - Aging bucket label
     * @returns {string} HTML email body
     */
    const buildEmailBody = (invoice, daysOverdue, agingBucket) => {
      const safeName = utils.escapeHtml(invoice.customerName);
      const safeTranId = utils.escapeHtml(invoice.tranId);
      const safeDueDate = utils.escapeHtml(invoice.dueDate);

      return `
        <html>
        <body style="font-family: Arial, sans-serif;">
          <h2>Payment Reminder</h2>
          <p>Dear ${safeName},</p>
          <p>This is a friendly reminder that the following invoice is past due:</p>
          <table style="border-collapse: collapse; margin: 20px 0;">
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd;"><strong>Invoice Number:</strong></td>
              <td style="padding: 8px; border: 1px solid #ddd;">${safeTranId}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd;"><strong>Due Date:</strong></td>
              <td style="padding: 8px; border: 1px solid #ddd;">${safeDueDate}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd;"><strong>Days Overdue:</strong></td>
              <td style="padding: 8px; border: 1px solid #ddd;">${daysOverdue} (${agingBucket})</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd;"><strong>Amount Due:</strong></td>
              <td style="padding: 8px; border: 1px solid #ddd;">${utils.formatCurrency(invoice.amountRemaining)}</td>
            </tr>
          </table>
          <p>Please remit payment at your earliest convenience. If you have already sent payment, please disregard this notice.</p>
          <p>If you have any questions regarding this invoice, please contact our accounts receivable department.</p>
          <p>Thank you for your business.</p>
          <hr style="margin-top: 30px;"/>
          <p style="font-size: 12px; color: #666;">This is an automated message from Acme Wholesale Distributors (fictional company for demo purposes).</p>
        </body>
        </html>
      `.trim();
    };

    /**
     * Sends the reminder email
     * @param {Object} invoice - Invoice data
     * @param {string} body - Email body HTML
     * @param {Object} config - Script configuration
     */
    const sendReminderEmail = (invoice, body, config) => {
      email.send({
        author: config.senderEmployee,
        recipients: invoice.customerEmail,
        subject: `Payment Reminder: Invoice ${invoice.tranId} - ${utils.formatCurrency(invoice.amountRemaining)} Past Due`,
        body,
        relatedRecords: {
          transactionId: invoice.id,
          entityId: invoice.customerId
        }
      });
    };

    /**
     * Checks if governance units are sufficient to continue
     * @param {Object} config - Script configuration
     * @returns {boolean} True if safe to continue processing
     */
    const checkGovernance = (config) => {
      const remainingUsage = runtime.getCurrentScript().getRemainingUsage();
      return utils.hasGovernanceCapacity(remainingUsage, config.governanceThreshold + config.unitsPerEmail);
    };

    return { execute };

  });
