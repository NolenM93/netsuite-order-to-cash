/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @NModuleScope SameAccount
 *
 * Client Script for Collections Dashboard Suitelet
 * Handles button actions on the dashboard
 *
 * @author Nolen Millington
 */
define(['N/currentRecord', 'N/dialog'],
  (currentRecord, dialog) => {

    /**
     * Page initialization
     * @param {Object} _context - Script context (unused)
     */
    const pageInit = (_context) => {
      // No initialization needed
    };

    /**
     * Triggers the send reminders action
     */
    const sendReminders = () => {
      dialog.confirm({
        title: 'Send Reminder Emails',
        message: 'This will send reminder emails to all customers with overdue invoices. Continue?'
      }).then((result) => {
        if (result) {
          const rec = currentRecord.get();
          rec.setValue({ fieldId: 'custpage_action', value: 'send_reminders' });
          document.forms[0].submit();
        }
      });
    };

    return { pageInit, sendReminders };

  });
