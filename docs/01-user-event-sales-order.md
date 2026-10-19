# Feature: Sales Order User Event Script

**Script:** `OTC_UE_SalesOrder.js`  
**Type:** User Event  
**Record:** Sales Order

## Requirement

When working with sales orders, users need:

1. Visibility into customer credit status at a glance
2. Prevention of orders that would exceed credit limits
3. Automatic follow-up task creation for large orders to ensure proper attention

## Design

### Entry Points

| Event | Function | Purpose |
|-------|----------|---------|
| `beforeLoad` | Display credit status banner | Shows credit utilization when viewing/editing |
| `beforeSubmit` | Validate required fields and credit | Blocks save if validation fails |
| `afterSubmit` | Create follow-up task | Creates task for orders ≥ $10,000 |

### beforeLoad Logic

```
1. Skip if context is CREATE (no customer yet)
2. Get customer ID from sales order
3. Lookup customer credit limit and current balance
4. Calculate credit utilization percentage
5. Determine status: Good Standing / Near Limit / Over Limit
6. Add inline HTML field showing status with color coding
```

### beforeSubmit Logic

```
1. Skip if context is DELETE
2. Validate required fields:
   - Customer is selected
   - Transaction date is set
   - At least one line item exists
3. Determine if credit check is needed (see Smart EDIT Handling below)
4. If credit check required and customer has credit limit:
   - Calculate if (current balance + order total) > credit limit
   - If exceeded, throw error with clear message
```

### Smart EDIT Credit Check

On EDIT, the script avoids unnecessary credit blocks by only checking credit when:

1. The **customer** field has changed, OR
2. The **order total** has changed (by more than $0.01)

AND the customer has a credit limit > 0.

This prevents false blocks when users edit non-financial fields (memo, shipping instructions, etc.) on orders that were already approved.

### afterSubmit Logic

```
1. Skip if context is not CREATE
2. Check if order total >= LARGE_ORDER_THRESHOLD ($10,000)
3. If large order:
   - Create Task record
   - Set title: "Follow-up: Large Order [SO#]"
   - Set message with order details
   - Link to customer and transaction
   - Assign to sales rep if set
   - Set due date to tomorrow
   - Set priority to HIGH
```

## Credit Status Colors

| Status | Utilization | Background | Border |
|--------|-------------|------------|--------|
| Good Standing | < 70% | Light green | Green |
| Near Limit | 70-99% | Light orange | Orange |
| Over Limit | ≥ 100% | Light red | Red |
| No Credit Limit | N/A | Light gray | Gray |

## Error Messages

| Code | Message |
|------|---------|
| `OTC_MISSING_FIELDS` | "Missing required fields: Customer, Date, At least one line item" |
| `OTC_CREDIT_LIMIT_EXCEEDED` | "Order exceeds customer credit limit. Order Total: $X. Available Credit: $Y. Please contact Credit Management for approval." |

All errors use `N/error.create()` with named codes for consistent handling and logging.

## Testing Notes

### Unit Tests

- `beforeLoad` skips for CREATE context
- `beforeLoad` adds credit status field for VIEW/EDIT
- `beforeLoad` handles missing customer gracefully
- `beforeSubmit` validates required fields
- `beforeSubmit` throws error for credit limit violation
- `afterSubmit` creates task for large orders
- `afterSubmit` skips for small orders

### Manual Testing

1. Create new sales order - verify no credit banner (no customer yet)
2. Select customer with credit limit - verify banner appears
3. Try to save order exceeding limit - verify error blocks save
4. Save large order (≥ $10K) - verify task is created

## Script Parameters

| Parameter ID | Type | Default | Purpose |
|--------------|------|---------|---------|
| `custscript_otc_large_order_amt` | FLOAT | 10000 | Threshold for creating follow-up tasks |
| `custscript_otc_credit_warn_pct` | FLOAT | 70 | Percentage at which "Near Limit" warning appears |
| `custscript_otc_task_assignee` | SELECT (Employee) | — | Default task assignee if sales rep not set |

## Dependencies

- `N/record` - For creating Task records
- `N/runtime` - For reading script parameters
- `N/search` - For looking up customer credit data
- `N/ui/serverWidget` - For adding inline HTML field
- `N/error` - For creating named errors
- `OTC_Lib_Utils` - Credit calculation utilities

## Governance Impact

- beforeLoad: ~5 units (one lookup)
- beforeSubmit: ~5 units (one lookup)
- afterSubmit: ~10 units (task creation)
