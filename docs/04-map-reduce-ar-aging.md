# Feature: AR Aging Summary Map/Reduce

**Script:** `OTC_MR_ARAgingSummary.js`  
**Type:** Map/Reduce Script  
**Trigger:** On-demand or scheduled

## Requirement

Calculate and store AR aging summaries for all customers:

1. Process all open invoices efficiently
2. Calculate aging buckets per customer
3. Store results in custom record for reporting
4. Handle large data volumes with parallel processing
5. Report errors comprehensively

## Design

### Map/Reduce Phases

| Phase | Purpose | Key/Value |
|-------|---------|-----------|
| `getInputData` | Return search of open invoices | Search object |
| `map` | Calculate aging for each invoice | Key: customerId, Value: invoice data |
| `reduce` | Aggregate by customer | Key: customerId, Value: aging summary |
| `summarize` | Report results and errors | N/A |

### getInputData

Returns a search for:
- Open invoices (status: CustInvc:A)
- Main line only
- Amount remaining > 0

Columns:
- Customer ID (for grouping)
- Company name
- Due date
- Amount remaining
- Invoice ID and number

### map Phase

For each search result:
```
1. Parse search result JSON
2. Extract customer ID and invoice data
3. Calculate days overdue
4. Determine aging bucket:
   - Current (≤ 0 days)
   - 1-30 Days
   - 31-60 Days
   - 61-90 Days
   - Over 90 Days
5. Write: key=customerId, value=invoiceData JSON
```

### reduce Phase

For each customer:
```
1. Initialize aging summary object
2. For each invoice:
   a. Increment invoice count
   b. Add to total outstanding
   c. Add to appropriate aging bucket
   d. Track oldest invoice days
3. Save/update AR Aging custom record
4. Write success/failure status
```

### summarize Phase

```
1. Log execution statistics:
   - Duration
   - Usage (governance units)
   - Concurrency
2. Count successes and failures from reduce output
3. Log any input errors
4. Log any map phase errors
5. Log any reduce phase errors
6. Log customer-level errors (first 10)
```

### Custom Record: AR Aging Summary

| Field | Type | Purpose |
|-------|------|---------|
| Customer | List/Record | Link to customer |
| Current | Currency | Amount in current bucket |
| 1-30 Days | Currency | Amount 1-30 days overdue |
| 31-60 Days | Currency | Amount 31-60 days overdue |
| 61-90 Days | Currency | Amount 61-90 days overdue |
| Over 90 Days | Currency | Amount >90 days overdue |
| Total Outstanding | Currency | Sum of all buckets |
| Invoice Count | Integer | Number of open invoices |
| Oldest Invoice Days | Integer | Days since oldest due |
| Last Updated | Date/Time | Timestamp of last calculation |

## Testing Notes

### Unit Tests

- `getInputData` returns invoice search
- `map` writes invoice data with aging bucket
- `map` skips invoices without customer
- `map` handles errors gracefully
- `reduce` aggregates amounts correctly
- `reduce` updates existing records
- `reduce` creates new records
- `reduce` writes error on failure
- `summarize` logs statistics
- `summarize` reports input errors

### Manual Testing

1. Run script manually via Script Deployment
2. Check AR Aging Summary records created
3. Verify bucket amounts match invoice totals
4. Check Execution Log for summary

## Dependencies

- `N/search` - Invoice search, existing record lookup
- `N/record` - AR Aging record create/update
- `N/runtime` - Script metadata
- `OTC_Lib_Utils` - Days overdue, aging bucket

## Governance Considerations

- 10,000 units per phase
- Automatic yielding between operations
- Errors don't stop other records
- Full error reporting in summarize

## Record Update Logic

```
1. Search for existing AR Aging record for customer
2. If found:
   - Load existing record
   - Update all fields
3. If not found:
   - Create new record
   - Set customer link
   - Set all fields
4. Save record
```

## Parallel Processing

Map/Reduce automatically:
- Parallelizes map phase across search results
- Groups reduce by customer ID
- Handles yielding for governance
- Continues processing despite individual errors
