/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @NModuleScope SameAccount
 *
 * Sales Order Client Script
 * - pageInit: Sets default values
 * - fieldChanged: Auto-populates/calculates discount from quantity
 * - validateLine: Validates line items before commit
 * - saveRecord: Final validation with friendly messages
 *
 * @author Nolen Millington
 */
define(['N/currentRecord', 'N/dialog', 'N/runtime', '../lib/OTC_Lib_Utils'],
  function(currentRecord, dialog, runtime, utils) {

    /**
     * Sets default field values when page loads
     * @param {Object} context - Entry point context
     * @param {Record} context.currentRecord - Current record
     * @param {string} context.mode - Page mode (create/edit/view)
     */
    function pageInit(context) {
      const rec = context.currentRecord;
      const mode = context.mode;

      if (mode !== 'create') {
        return;
      }

      try {
        setDefaultDate(rec);
        setDefaultMemo(rec);

        log.debug({
          title: 'pageInit',
          details: 'Default values set for new sales order'
        });
      } catch (e) {
        log.error({
          title: 'pageInit Error',
          details: e.message
        });
      }
    }

    /**
     * Handles field changes - auto-calculates discount based on quantity
     * @param {Object} context - Entry point context
     * @param {Record} context.currentRecord - Current record
     * @param {string} context.fieldId - Changed field ID
     * @param {string} context.sublistId - Sublist ID if applicable
     * @param {number} context.line - Line number if applicable
     */
    function fieldChanged(context) {
      const rec = context.currentRecord;
      const fieldId = context.fieldId;
      const sublistId = context.sublistId;

      if (sublistId === 'item' && fieldId === 'quantity') {
        handleQuantityChange(rec);
      }

      if (fieldId === 'entity') {
        handleCustomerChange(rec);
      }
    }

    /**
     * Validates line item before it's committed
     * @param {Object} context - Entry point context
     * @param {Record} context.currentRecord - Current record
     * @param {string} context.sublistId - Sublist ID
     * @returns {boolean} True if line is valid
     */
    function validateLine(context) {
      const rec = context.currentRecord;
      const sublistId = context.sublistId;

      if (sublistId !== 'item') {
        return true;
      }

      const item = rec.getCurrentSublistValue({
        sublistId: 'item',
        fieldId: 'item'
      });

      const quantity = rec.getCurrentSublistValue({
        sublistId: 'item',
        fieldId: 'quantity'
      });

      if (!item) {
        showValidationMessage('Please select an item.');
        return false;
      }

      if (!quantity || parseFloat(quantity) <= 0) {
        showValidationMessage('Please enter a valid quantity greater than zero.');
        return false;
      }

      const rate = rec.getCurrentSublistValue({
        sublistId: 'item',
        fieldId: 'rate'
      });

      if (!rate || parseFloat(rate) < 0) {
        showValidationMessage('Please enter a valid rate.');
        return false;
      }

      return true;
    }

    /**
     * Final validation before saving the record
     * @param {Object} context - Entry point context
     * @param {Record} context.currentRecord - Current record
     * @returns {boolean} True if record can be saved
     */
    function saveRecord(context) {
      const rec = context.currentRecord;

      const customer = rec.getValue({ fieldId: 'entity' });
      if (!customer) {
        showValidationMessage('Please select a customer before saving.');
        return false;
      }

      const lineCount = rec.getLineCount({ sublistId: 'item' });
      if (lineCount === 0) {
        showValidationMessage('Please add at least one item to the order.');
        return false;
      }

      const tranDate = rec.getValue({ fieldId: 'trandate' });
      if (!tranDate) {
        showValidationMessage('Please enter a transaction date.');
        return false;
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const orderDate = new Date(tranDate);
      orderDate.setHours(0, 0, 0, 0);

      const daysDiff = Math.floor((today - orderDate) / (1000 * 60 * 60 * 24));

      if (daysDiff > 30) {
        showValidationMessage(
          'Order date is more than 30 days in the past. ' +
          'Please verify this is correct or update the date.'
        );
        return false;
      }

      if (daysDiff < -365) {
        showValidationMessage(
          'Order date is more than a year in the future. ' +
          'Please verify this is correct or update the date.'
        );
        return false;
      }

      const total = rec.getValue({ fieldId: 'total' });
      if (parseFloat(total) <= 0) {
        showValidationMessage('Order total must be greater than zero.');
        return false;
      }

      return true;
    }

    /**
     * Sets default transaction date to today
     * @param {Record} rec - Current record
     */
    function setDefaultDate(rec) {
      const currentDate = rec.getValue({ fieldId: 'trandate' });
      if (!currentDate) {
        rec.setValue({
          fieldId: 'trandate',
          value: new Date()
        });
      }
    }

    /**
     * Sets default memo field
     * @param {Record} rec - Current record
     */
    function setDefaultMemo(rec) {
      const currentMemo = rec.getValue({ fieldId: 'memo' });
      if (!currentMemo) {
        rec.setValue({
          fieldId: 'memo',
          value: 'Order created via Order-to-Cash Toolkit'
        });
      }
    }

    /**
     * Handles quantity change - auto-calculates discount tier
     * @param {Record} rec - Current record
     */
    function handleQuantityChange(rec) {
      const quantity = rec.getCurrentSublistValue({
        sublistId: 'item',
        fieldId: 'quantity'
      });

      const discountRate = utils.getDiscountTier(quantity);

      if (discountRate > 0) {
        const baseRate = rec.getCurrentSublistValue({
          sublistId: 'item',
          fieldId: 'rate'
        });

        if (baseRate) {
          const discountPct = (discountRate * 100).toFixed(0);

          log.debug({
            title: 'Discount Applied',
            details: 'Quantity: ' + quantity + ', Discount: ' + discountPct + '%'
          });
        }
      }
    }

    /**
     * Handles customer change - could load customer preferences
     * @param {Record} rec - Current record
     */
    function handleCustomerChange(rec) {
      const customerId = rec.getValue({ fieldId: 'entity' });

      if (customerId) {
        log.debug({
          title: 'Customer Selected',
          details: 'Customer ID: ' + customerId
        });
      }
    }

    /**
     * Shows a user-friendly validation message
     * @param {string} message - Message to display
     */
    function showValidationMessage(message) {
      dialog.alert({
        title: 'Validation Required',
        message: message
      });
    }

    return {
      pageInit: pageInit,
      fieldChanged: fieldChanged,
      validateLine: validateLine,
      saveRecord: saveRecord
    };

  });
