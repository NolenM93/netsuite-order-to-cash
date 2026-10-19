# Feature: Sales Order Client Script

**Script:** `OTC_CS_SalesOrder.js`  
**Type:** Client Script  
**Record:** Sales Order

## Requirement

Provide real-time user experience enhancements on sales order forms:

1. Set sensible defaults when creating new orders
2. Auto-calculate discounts based on quantity tiers
3. Validate line items before they're committed
4. Provide friendly validation messages before save

## Design

### Entry Points

| Event | Function | Purpose |
|-------|----------|---------|
| `pageInit` | Set default values | Initialize new orders with defaults |
| `fieldChanged` | Handle field changes | Calculate discounts, respond to selections |
| `validateLine` | Validate line items | Check item/quantity before commit |
| `saveRecord` | Final validation | Comprehensive check before save |

### pageInit Logic

```
1. Skip if not CREATE mode
2. Set transaction date to today if empty
3. Set default memo: "Order created via Order-to-Cash Toolkit"
```

### fieldChanged Logic

**On quantity change (item sublist):**
```
1. Get current line quantity
2. Look up discount tier from utils:
   - 100+ units: 15% discount
   - 50+ units: 10% discount
   - 25+ units: 5% discount
   - <25 units: 0% discount
3. Log applied discount (server-side would apply to pricing)
```

**On customer change:**
```
1. Log customer selection for debugging
2. Could load customer-specific preferences
```

### validateLine Logic

```
1. Skip if not 'item' sublist
2. Validate:
   - Item is selected
   - Quantity > 0
   - Rate >= 0
3. Show dialog with specific error if invalid
4. Return false to prevent line commit
```

### saveRecord Logic

```
1. Validate customer is selected
2. Validate at least one line item exists
3. Validate transaction date is set
4. Check date is not > 30 days in past
5. Check date is not > 1 year in future
6. Validate total > 0
7. Show dialog with specific error if invalid
8. Return false to prevent save
```

## Discount Tiers

| Quantity | Discount |
|----------|----------|
| 100+ | 15% |
| 50-99 | 10% |
| 25-49 | 5% |
| 0-24 | 0% |

## User Messages

All validation messages are shown via `N/dialog.alert()` with:
- **Title:** "Validation Required"
- **Message:** Specific, actionable guidance

Example messages:
- "Please select an item."
- "Please enter a valid quantity greater than zero."
- "Please select a customer before saving."
- "Order date is more than 30 days in the past. Please verify this is correct or update the date."

## Testing Notes

### Unit Tests

- `pageInit` sets defaults for CREATE mode
- `pageInit` skips for EDIT mode
- `pageInit` doesn't override existing values
- `fieldChanged` calculates correct discount tier
- `validateLine` rejects missing item
- `validateLine` rejects zero quantity
- `validateLine` accepts valid line
- `saveRecord` rejects missing customer
- `saveRecord` rejects no line items
- `saveRecord` accepts valid record

### Manual Testing

1. Create new sales order - verify defaults are set
2. Add item with quantity 100 - verify discount logged
3. Try to add line without item - verify blocked
4. Try to save without customer - verify blocked

## Dependencies

- `N/currentRecord` - For accessing current form
- `N/dialog` - For user-friendly alerts
- `OTC_Lib_Utils` - Discount tier lookup

## Notes

- Client scripts run in the browser, no governance concerns
- Use promises for any async operations
- Keep operations fast for good UX
