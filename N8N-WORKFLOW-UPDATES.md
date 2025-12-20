# n8n Workflow Updates Required

## Task B: Close the Outbox Loop (pending → sent/failed)

After updating the codebase to move webhook triggering to email-capture, update the n8n workflow to call back to mark webhook status.

### Required Changes to n8n Workflow

#### 1. After Successful Email Send

Add an **HTTP Request** node after the Resend email send node (on the success path for each avatar branch):

**Node Configuration:**
- **Method:** POST
- **URL:** `https://myfinediet.com/api/outbox/mark-sent`
- **Authentication:** None (public endpoint)
- **Body Type:** JSON
- **Body:**
```json
{
  "submissionId": "{{ $json.submission_id }}",
  "target": "n8n_email_capture",
  "status": "sent"
}
```

#### 2. On Error Path

Add an **HTTP Request** node on the error path (after error handling/catch nodes):

**Node Configuration:**
- **Method:** POST
- **URL:** `https://myfinediet.com/api/outbox/mark-sent`
- **Authentication:** None (public endpoint)
- **Body Type:** JSON
- **Body:**
```json
{
  "submissionId": "{{ $json.submission_id }}",
  "target": "n8n_email_capture",
  "status": "failed",
  "error_message": "{{ $json.error.message || 'Email send failed' }}"
}
```

### Expected Behavior

**After successful email:**
- `webhook_outbox` row shows:
  - `status = 'sent'`
  - `sent_at` populated (timestamp)
  - `last_attempt_at` populated (timestamp)
  - `error_message = null`

**After failed email:**
- `webhook_outbox` row shows:
  - `status = 'failed'`
  - `last_attempt_at` populated (timestamp)
  - `error_message` populated with error details
  - `sent_at = null`

### Notes

- The endpoint returns `{ success: true, rowsUpdated: 1 }` on success
- Returns success even if 0 rows updated (may have already been updated)
- The endpoint uses service-role auth internally, no auth needed from n8n

