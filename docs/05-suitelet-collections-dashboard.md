# Feature: Collections Dashboard Suitelet

**Script:** `OTC_SL_CollectionsDashboard.js`  
**Type:** Suitelet  
**Access:** Internal (Administrator role)

## Requirement

Provide an internal dashboard for the collections team to:

1. View all overdue invoices in one place
2. Filter by customer, aging bucket, and minimum amount
3. See summary statistics
4. Trigger reminder email sends on demand

## Design

### Page Layout

```
┌─────────────────────────────────────────────────────────┐
│  Collections Dashboard                    [Send Reminders] │
├─────────────────────────────────────────────────────────┤
│  Filters                                                 │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐    │
│  │ Customer ▼   │ │ Aging     ▼  │ │ Min Amount   │    │
│  └──────────────┘ └──────────────┘ └──────────────┘    │
│                                      [Apply Filters]     │
├─────────────────────────────────────────────────────────┤
│  Summary                                                 │
│  Total Overdue Invoices: 47    Total Amount: $125,430.00 │
├─────────────────────────────────────────────────────────┤
│  Overdue Invoices                                        │
│  ┌─────┬────────┬──────────┬──────────┬─────────┬─────┐│
│  │View │Inv #   │Customer  │Due Date  │Days     │Amt  ││
│  ├─────┼────────┼──────────┼──────────┼─────────┼─────┤│
│  │View │INV-001 │Acme Corp │01/15/24  │30       │$500 ││
│  │View │INV-002 │Beta Inc  │01/10/24  │35       │$750 ││
│  │...  │...     │...       │...       │...      │...  ││
│  └─────┴────────┴──────────┴──────────┴─────────┴─────┘│
└─────────────────────────────────────────────────────────┘
```

### Request Handling

| Method | Action | Behavior |
|--------|--------|----------|
| GET | Display dashboard | Build form with filters and results |
| POST (apply) | Apply filters | Rebuild form with filtered data |
| POST (send) | Send reminders | Trigger scheduled script, redirect |

### Filter Options

**Customer:**
- Source: Customer record list
- Default: All customers

**Aging Bucket:**
- All
- 1-30 Days
- 31-60 Days
- 61-90 Days
- Over 90 Days

**Minimum Amount:**
- Currency field
- Default: None (all amounts)

### Sublist Columns

| Column | Type | Description |
|--------|------|-------------|
| View | URL | Link to invoice record |
| Invoice # | Text | Document number |
| Customer | Text | Customer name |
| Due Date | Date | Invoice due date |
| Days Overdue | Integer | Calculated days past due |
| Aging Bucket | Text | Aging category |
| Amount Due | Currency | Amount remaining |
| Customer Email | Text | For reference |

### Send Reminders Action

```
1. User clicks "Send Reminder Emails" button
2. Client script confirms action via dialog
3. POST submitted with action = 'send_reminders'
4. Server creates ScheduledScriptTask
5. Triggers OTC_SS_OverdueReminder script
6. Redirects back with success message
```

## Testing Notes

### Unit Tests

- GET creates dashboard form
- Form includes filter fields
- Form includes invoice sublist
- Sublist populated with search results
- Confirmation message displayed when provided
- POST triggers reminder script
- POST redirects after action
- Customer filter applied to search
- Amount filter applied to search

### Manual Testing

1. Navigate to Suitelet URL
2. Verify filters display correctly
3. Select customer filter - verify results filtered
4. Select aging bucket - verify results filtered
5. Click Send Reminders - verify confirmation dialog
6. Confirm - verify success message

## Dependencies

- `N/ui/serverWidget` - Form building
- `N/search` - Invoice search
- `N/url` - Resolving record URLs
- `N/redirect` - Post-action redirect
- `N/task` - Triggering scheduled script
- `N/runtime` - Script/deployment IDs
- `OTC_Lib_Utils` - Days overdue, aging bucket

## Governance Considerations

- 10,000 units available
- Main cost is invoice search
- Results limited to 500 invoices
- Pagination could be added for larger datasets

## Client Script

Simple client script (`OTC_SL_CollectionsDashboard_Client.js`):
- Handles confirmation dialog for Send Reminders
- Sets hidden action field
- Submits form

```javascript
function sendReminders() {
  dialog.confirm({
    title: 'Send Reminder Emails',
    message: 'This will send reminder emails to all customers...'
  }).then(function(result) {
    if (result) {
      currentRecord.setValue('custpage_action', 'send_reminders');
      document.forms[0].submit();
    }
  });
}
```

## Security

- Deployed with `allroles: F`
- `runasrole: ADMINISTRATOR`
- Only admins can access dashboard
- Only admins can trigger mass emails
