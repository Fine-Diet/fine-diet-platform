# Atlas Reliability Additions

## Overview

This document describes the reliability improvements added to the Gut Check v1 assessment system.

## Changes Summary

### 1. Database Schema Updates

**New Tables:**
- `assessment_events` - Stores analytics events (best-effort insertion)
- `webhook_outbox` - Outbox pattern for reliable webhook delivery

**Schema Improvements:**
- `assessment_submissions.id` now uses client-generated UUID (no default) for idempotency
- Explicit constraint names to avoid collisions (`check_assessment_sessions_status`, `check_webhook_outbox_status`)
- Deny-by-default RLS policies (explicit allows only)

### 2. New API Endpoints

#### `POST /api/assessments/session`
- Updates session status (started/progress/abandoned/completed)
- Non-blocking, best-effort
- Uses upsert for idempotency

#### `POST /api/assessments/events`
- Batch inserts analytics events
- Best-effort (failures don't block UX)
- Returns success even on failure (with error message)

### 3. Updated Endpoints

#### `POST /api/assessments/submit` (Idempotent)
- **Client-generated `submissionId`** - Required UUID for idempotency
- **Idempotency check** - Returns success if submission already exists
- **Session completion** - Marks session as 'completed'
- **Webhook outbox** - Enqueues webhook before firing n8n async
- **Non-blocking** - All operations are async and don't block UX

### 4. Client-Side Updates

**Session Management:**
- `generateUUID()` - Generates UUID v4 for submissionId
- Session tracking via `/api/assessments/session` endpoint

**Analytics:**
- Event batching (queues events, flushes every 2s or when batch is full)
- Best-effort sending to `/api/assessments/events`
- Non-blocking (failures don't affect UX)

**Assessment Provider:**
- Generates `submissionId` on first submission attempt
- Tracks session progress via new endpoint
- Updates session status on abandonment

## Migration Instructions

1. **Run Updated Migration:**
   ```sql
   -- Execute scripts/createAssessmentTables.sql in Supabase Dashboard
   ```

2. **Environment Variables:**
   - No new variables required (uses existing `N8N_WEBHOOK_URL`)

3. **Backward Compatibility:**
   - Existing submissions continue to work
   - New submissions require `submissionId` in payload
   - Old client code will fail validation (expected)

## Key Features

### Idempotency
- Submissions can be safely retried
- Duplicate submissions return success without creating duplicates
- Uses client-generated UUID to prevent race conditions

### Reliability
- Webhook outbox ensures delivery even if n8n is temporarily down
- Event batching reduces API calls
- Best-effort operations never block UX

### Security
- Deny-by-default RLS policies
- Explicit grants for anonymous operations
- Service role has full access for background processing

## Testing

1. **Idempotency Test:**
   - Submit same assessment twice with same `submissionId`
   - Both should return success
   - Only one record in database

2. **Session Tracking:**
   - Start assessment → session status = 'started'
   - Progress through questions → session updates
   - Complete → session status = 'completed'
   - Abandon → session status = 'abandoned'

3. **Event Batching:**
   - Trigger multiple events quickly
   - Verify events are batched and sent together
   - Check `assessment_events` table

4. **Webhook Outbox:**
   - Complete assessment
   - Verify record in `webhook_outbox` with status = 'pending'
   - Verify n8n webhook still fires (dual-write pattern)

## Notes

- All operations are non-blocking
- Failures are logged but don't affect user experience
- Webhook outbox should be processed by background worker (future work)
- Event batching reduces load but may have slight delay (2s max)

