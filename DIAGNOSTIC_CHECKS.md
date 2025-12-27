# Diagnostic Checks for Question Set Resolution Issue

## Problem
Error message shows "Question set not found in CMS" even when the question set exists but has no published revision pointer.

## Checks to Perform

### 1. Verify Database Schema
Run this SQL query in Supabase to verify the schema:
```sql
SELECT 
  column_name, 
  data_type, 
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'question_sets'
ORDER BY ordinal_position;
```

Expected:
- `assessment_version` should be `text` (TEXT)
- `assessment_type` should be `text` (TEXT)
- `locale` should be `text` (TEXT) or nullable

### 2. Check What's Actually in the Database
Run this query to see all question sets:
```sql
SELECT 
  id,
  assessment_type,
  assessment_version,
  locale,
  created_at
FROM public.question_sets
ORDER BY created_at DESC;
```

### 3. Check for the Specific Question Set
Replace `43c795a1-b6dc-4539-a8bf-c405e4468879` with the actual ID:
```sql
SELECT 
  qs.id,
  qs.assessment_type,
  qs.assessment_version,
  qs.locale,
  ptr.published_revision_id,
  ptr.preview_revision_id
FROM public.question_sets qs
LEFT JOIN public.question_set_pointers ptr ON ptr.question_set_id = qs.id
WHERE qs.id = '43c795a1-b6dc-4539-a8bf-c405e4468879';
```

### 4. Check Revisions for This Question Set
```sql
SELECT 
  id,
  revision_number,
  status,
  created_at
FROM public.question_set_revisions
WHERE question_set_id = '43c795a1-b6dc-4539-a8bf-c405e4468879'
ORDER BY revision_number DESC;
```

### 5. Test the Exact Query Being Used
Replace values as needed:
```sql
SELECT id, assessment_type, assessment_version, locale
FROM public.question_sets
WHERE assessment_type = 'gut-check'
  AND assessment_version = '3'
  AND locale IS NULL;
```

## Expected Behavior

1. If question set exists with no pointers → Show: "Question set exists in CMS but has no published (or preview) revision. Please publish a revision..."
2. If question set doesn't exist → Show: "Question set not found in CMS... File fallback only supports version 2..."

## Debugging Logs

Check the server console logs for:
- `[resolveQuestionSet] CMS existence check:` - Should show if question set was found
- `[fetchQuestionSetFromCMS]` warnings - Should show why CMS lookup failed

## Common Issues

1. **Version Mismatch**: Database has "v3" but code queries for "3" (or vice versa)
2. **Locale Mismatch**: Database has NULL but code queries for empty string (or vice versa)
3. **Case Sensitivity**: Database has "Gut-Check" but code queries for "gut-check"

