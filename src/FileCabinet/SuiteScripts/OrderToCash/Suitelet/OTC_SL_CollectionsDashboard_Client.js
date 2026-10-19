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
  function(currentRecord, dialog) {

    /**
     * Page initialization
     * @param {Object} context - Script context
     */
    function pageInit(_context) {
      // No initialization needed
    }

    /**
     * Triggers the send reminders action
     */
    function sendReminders() {
      dialog.confirm({
        title: 'Send Reminder Emails',
        message: 'This will send reminder emails to all customers with overdue invoices. Continue?'
      }).then(function(result) {
        if (result) {
          const rec = currentRecord.get();
          rec.setValue({
            fieldId: 'custpage_action',
            value: 'send_reminders'
          });

          document.forms[0].submit();
        }
      });
    }

    return {
      pageInit: pageInit,
      sendReminders: sendReminders
    };

  });
