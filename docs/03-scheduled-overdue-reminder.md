# Feature: Overdue Invoice Reminder Script

**Script:** `OTC_SS_OverdueReminder.js`  
**Type:** Scheduled Script  
**Schedule:** Daily at 6:00 AM

## Requirement

Automatically send reminder emails to customers with overdue invoices:

1. Run daily to catch newly overdue invoices
2. Send professional reminder emails
3. Track which invoices were processed
4. Handle governance limits gracefully
5. Log results for auditing

## Design

### Execution Flow

```
1. Log script start
2. Search for all overdue invoices
3. For each invoice:
   a. Check governance remaining
   b. Skip if customer has no valid email
   c. Calculate days overdue
   d. Build email body with invoice details
   e. Send email via N/email
   f. Log successful send
4. Log summary with counts
```

### Invoice Search Criteria

- Main line only
- Status: Open (CustInvc:A)
- Due date: Before today
- Amount remaining: > 0

### Email Content

- **Subject:** "Payment Reminder: Invoice [INV#] - $X Past Due"
- **Body includes:**
  - Customer name greeting
  - Invoice number
  - Due date
  - Days overdue with aging bucket
  - Amount due (formatted)
  - Payment request
  - Contact information
  - Disclaimer (fictional company)

### Governance Management

```
GOVERNANCE_THRESHOLD = 200 units
UNITS_PER_EMAIL = ~10 units

Before each email:
  if remainingUsage <= THRESHOLD + UNITS_PER_EMAIL:
    log "Governance limit approaching"
    stop processing
    (Script will run again next day)
```

### Results Tracking

```javascript
{
  processed: number,      // Invoices examined
  emailsSent: number,     // Successful sends
  skippedNoEmail: number, // Skipped (no valid email)
  errors: [{              // Failed sends
    invoiceId: string,
    error: string
  }]
}
```

## Testing Notes

### Unit Tests

- Script logs start and completion
- Search is created with correct filters
- Emails sent for valid invoices
- Invoices skipped when no valid email
- Errors logged for failed processing
- Stops when governance threshold reached
- Email includes invoice details

### Manual Testing

1. Create test invoices with past due dates
2. Run script manually via Script Deployment
3. Verify emails received
4. Check Execution Log for summary

## Dependencies

- `N/search` - Invoice search
- `N/email` - Sending emails
- `N/runtime` - Governance checking, current user
- `N/record` - (available for future use)
- `OTC_Lib_Utils` - Email validation, formatting, aging

## Governance Considerations

- 10,000 units available per execution
- Each email send: ~10 units
- Governance check before each email
- Graceful stop when low
- Continues next scheduled run

## Email Template

```html
<html>
<body style="font-family: Arial, sans-serif;">
  <h2>Payment Reminder</h2>
  <p>Dear [Customer Name],</p>
  <p>This is a friendly reminder that the following invoice is past due:</p>
  <table>
    <tr><td>Invoice Number:</td><td>[INV-001]</td></tr>
    <tr><td>Due Date:</td><td>[01/15/2024]</td></tr>
    <tr><td>Days Overdue:</td><td>[30] (31-60 Days)</td></tr>
    <tr><td>Amount Due:</td><td>[$1,500.00]</td></tr>
  </table>
  <p>Please remit payment at your earliest convenience.</p>
  <p>Thank you for your business.</p>
  <hr/>
  <p style="font-size:12px;">Acme Wholesale Distributors (fictional)</p>
</body>
</html>
```

## Deployment Configuration

```xml
<recurrence>
  <daily>
    <startdate>2024-01-01</startdate>
    <starttime>06:00:00</starttime>
    <everyxdays>1</everyxdays>
  </daily>
</recurrence>
```
