# Fine Diet Mini-Assessments Funnel System (Gut Check v1)

## Overview

This document describes the assessment system architecture and setup instructions.

## Architecture

### Components

- **AssessmentProvider**: Context provider managing assessment state
- **QuestionScreen**: Displays questions and handles navigation
- **ResultsScreen**: Displays results with avatar insights
- **Scoring Engine**: Pure client-side functions for calculating scores
- **Session Management**: localStorage-based session tracking
- **Analytics**: Event tracking system

### Data Flow

1. User starts assessment → Session created in `assessment_sessions`
2. User answers questions → Answers stored in state
3. User completes assessment → Scores calculated client-side
4. Results displayed → Submission sent to API (non-blocking)
5. API writes to Supabase → Triggers n8n webhook (async)

## Setup Instructions

### 1. Database Setup

Run the SQL migration in Supabase Dashboard:

```bash
# File: scripts/createAssessmentTables.sql
```

This creates three tables:
- `assessment_submissions` - Completed assessments
- `assessment_sessions` - In-progress tracking
- `avatar_insights` - Avatar content

### 2. Environment Variables

Add to `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
N8N_WEBHOOK_URL=https://your-n8n-instance.com/webhook/assessment-submission
```

### 3. Avatar Insights Data

Populate `avatar_insights` table with content for each avatar:

```sql
INSERT INTO avatar_insights (assessment_type, avatar_id, label, summary, key_patterns, first_focus_areas, method_positioning)
VALUES 
  ('gut-check', 'balanced', 'Balanced Gut', 'Your gut health shows a balanced pattern...', 
   ARRAY['Pattern 1', 'Pattern 2'], ARRAY['Focus 1', 'Focus 2'], 'Method positioning text...'),
  -- Add more avatars
```

### 4. Assessment Configuration

Edit `lib/assessmentConfig.ts` to:
- Update questions and options
- Adjust scoring weights
- Configure thresholds

### 5. n8n Workflow

Create an n8n workflow that:
- Receives webhook from `/api/assessments/submit`
- Fetches full submission from Supabase
- Routes by `assessment_type` + `primary_avatar`
- Sends diagnostic email
- Tags contact in CRM (future)

## Routes

- `/gut-check` - Gut Check assessment page

## API Endpoints

- `POST /api/assessments/submit` - Submit completed assessment

## Analytics Events

Events are logged to console in development. To integrate with analytics:

1. Update `lib/assessmentAnalytics.ts`
2. Add your analytics service (Google Analytics, Mixpanel, etc.)

Events tracked:
- `assessment_started`
- `assessment_completed`
- `assessment_abandoned`
- `results_viewed`
- `results_scrolled`
- `method_vsl_clicked`
- `email_captured`

## Testing

1. Navigate to `/gut-check`
2. Answer all questions
3. View results
4. Check Supabase for submission
5. Verify n8n webhook received (check logs)

## Notes

- All questions are required
- Scoring is client-side only
- Results always render (submission failures don't block UI)
- Session ID persists in localStorage
- n8n webhook failures are non-blocking

