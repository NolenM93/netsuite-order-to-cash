# Feature: Order API RESTlet

**Script:** `OTC_RL_OrderAPI.js`  
**Type:** RESTlet  
**Access:** External (authenticated)

## Requirement

Provide external API endpoints for:

1. **GET**: Check order status from external systems (e.g., customer portal)
2. **POST**: Submit leads from website contact forms

## Design

### GET - Order Status

**Endpoint:** GET with parameters

**Parameters:**
| Parameter | Required | Description |
|-----------|----------|-------------|
| orderId | Either | Internal order ID |
| orderNumber | Either | Document number (SO-001) |

**Response:**
```json
{
  "success": true,
  "data": {
    "orderId": "123",
    "orderNumber": "SO-001",
    "status": "pendingFulfillment",
    "statusDisplay": "Pending Fulfillment",
    "orderDate": "2024-01-15T00:00:00.000Z",
    "customer": "Acme Corporation",
    "total": 1500.00,
    "shipDate": "2024-01-20T00:00:00.000Z",
    "trackingNumbers": "1Z999AA10123456784",
    "lineCount": 2,
    "items": [
      {
        "item": "Widget A",
        "quantity": 10,
        "rate": 100.00,
        "amount": 1000.00
      }
    ]
  },
  "message": "Order retrieved successfully"
}
```

**Error Response:**
```json
{
  "success": false,
  "error": {
    "code": "NOT_FOUND",
    "message": "Order not found: SO-999"
  },
  "httpStatus": 404
}
```

### POST - Lead Creation

**Endpoint:** POST with JSON body

**Request Body:**
```json
{
  "companyName": "New Prospect Inc",
  "firstName": "John",
  "lastName": "Doe",
  "email": "john.doe@prospect.com",
  "phone": "555-123-4567",
  "comments": "Interested in bulk pricing",
  "leadSource": 123
}
```

**Required Fields:**
- companyName (min 2 characters)
- firstName
- lastName
- email (valid format)

**Optional Fields:**
- phone (if provided, must be valid format)
- comments
- leadSource (internal ID)

**Success Response:**
```json
{
  "success": true,
  "data": {
    "leadId": "789"
  },
  "message": "Lead created successfully"
}
```

**Validation Error:**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "email must be a valid email address; phone must be a valid phone number"
  },
  "httpStatus": 400
}
```

**Duplicate Error:**
```json
{
  "success": false,
  "error": {
    "code": "DUPLICATE_LEAD",
    "message": "A lead with this email already exists"
  },
  "httpStatus": 409
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| MISSING_PARAMETER | 400 | Required parameter not provided |
| VALIDATION_ERROR | 400 | Input validation failed |
| NOT_FOUND | 404 | Order not found |
| DUPLICATE_LEAD | 409 | Lead with email exists |
| INTERNAL_ERROR | 500 | Unexpected server error |

### Input Validation

**Email Validation:**
- Must match pattern: `^[^\s@]+@[^\s@]+\.[^\s@]+$`

**Phone Validation:**
- After removing spaces, dashes, parentheses, dots
- Must be 10-15 digits
- May start with +

**Input Sanitization:**
- All string inputs trimmed
- companyName: max 100 chars
- firstName/lastName: max 50 chars
- email: max 100 chars
- phone: max 25 chars
- comments: max 1000 chars

### Duplicate Detection

Before creating lead:
```
1. Search customers where:
   - email = provided email
   - stage = LEAD
2. If found, throw DUPLICATE_LEAD error
```

## Testing Notes

### Unit Tests

**GET Tests:**
- Returns error for missing parameters
- Returns order status by orderId
- Looks up order by orderNumber
- Returns 404 when order not found
- Handles internal errors gracefully

**POST Tests:**
- Returns error for missing body
- Validates required fields
- Validates email format
- Validates company name length
- Validates phone format (if provided)
- Creates lead successfully
- Returns 409 for duplicate email
- Sanitizes input data
- Handles optional fields

### Manual Testing

**GET:**
```bash
# By order ID
curl -X GET "https://[account].restlets.api.netsuite.com/...?orderId=123" \
  -H "Authorization: OAuth ..."

# By order number
curl -X GET "https://[account].restlets.api.netsuite.com/...?orderNumber=SO-001" \
  -H "Authorization: OAuth ..."
```

**POST:**
```bash
curl -X POST "https://[account].restlets.api.netsuite.com/..." \
  -H "Authorization: OAuth ..." \
  -H "Content-Type: application/json" \
  -d '{
    "companyName": "Test Company",
    "firstName": "John",
    "lastName": "Doe",
    "email": "john@test.com"
  }'
```

## Dependencies

- `N/record` - Loading orders, creating leads
- `N/search` - Order lookup, duplicate check
- `N/error` - Custom error creation
- `OTC_Lib_Utils` - Validation, sanitization, response building

## Governance Considerations

- 5,000 units per request
- GET: ~10-20 units (search + record load)
- POST: ~15-25 units (search + record create)
- Validation happens before expensive operations

## Security Considerations

- RESTlet requires authentication (OAuth or Token)
- Input validation prevents injection
- Input sanitization limits field lengths
- No sensitive data in error messages
- Duplicate check prevents spam

## Custom Field

**custentity_otc_web_lead:**
- Type: Checkbox
- Set to TRUE for leads created via this API
- Useful for reporting/segmentation
