/**
 * Contact Import Types — Klaviyo Migration
 *
 * Shared types for the import pipeline used by:
 *   - pages/api/admin/import/dry-run.ts
 *   - pages/api/admin/import/execute.ts
 *   - pages/admin/import/klaviyo.tsx
 */

// ---------------------------------------------------------------------------
// Input row (post-CSV-parse, post-column-mapping)
// ---------------------------------------------------------------------------

export interface ImportRow {
  /** Normalized to lowercase, trimmed */
  email: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  /**
   * Consent/subscription status from source.
   * null = unknown (operator chose to treat as opted-in).
   * false = explicitly unsubscribed — do not subscribe.
   */
  subscribed: boolean | null;
  /** Raw tag string from Klaviyo (e.g. '["newsletter","fine print"]') */
  tags?: string;
  /** ISO date string of original opt-in / creation in Klaviyo */
  klaviyo_created_at?: string;
  /** Original row index in the uploaded file (1-based, for error reporting) */
  sourceRowIndex: number;
}

// ---------------------------------------------------------------------------
// Dry-run: per-row outcome
// ---------------------------------------------------------------------------

export type RowAction =
  | 'create'              // new person + subscription
  | 'update'              // existing person, will fill null name fields
  | 'skip_unsubscribed'   // person exists and is already unsubscribed in our system
  | 'skip_no_consent'     // source row has explicit consent=false
  | 'skip_duplicate'      // same email appeared earlier in this import file
  | 'invalid';            // missing/malformed required fields

export interface DryRunRow {
  sourceRowIndex: number;
  email: string;
  first_name?: string;
  last_name?: string;
  subscribed: boolean | null;
  tags?: string;
  action: RowAction;
  reason: string;
  /** If action is 'update', the existing person record */
  existingPerson?: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    status: string;
  };
}

export interface DryRunSummary {
  total: number;
  toCreate: number;
  toUpdate: number;
  skipUnsubscribed: number;
  skipNoConsent: number;
  skipDuplicate: number;
  invalid: number;
}

export interface DryRunResponse {
  summary: DryRunSummary;
  rows: DryRunRow[];
}

// ---------------------------------------------------------------------------
// Execute: per-row outcome
// ---------------------------------------------------------------------------

export type ExecuteAction = RowAction | 'error';

export interface ExecuteRow {
  sourceRowIndex: number;
  email: string;
  action: ExecuteAction;
  message: string;
}

export interface ExecuteResponse {
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  rows: ExecuteRow[];
}

// ---------------------------------------------------------------------------
// Import options
// ---------------------------------------------------------------------------

export interface ImportOptions {
  /**
   * How to handle rows where subscribed status is unknown.
   * 'subscribe'  — treat as opted-in (safe for Klaviyo lists, which enforce consent)
   * 'skip'       — do not create subscription, create person only
   */
  unknownConsentBehavior: 'subscribe' | 'skip';
  /**
   * Whether to set nutrition_insights = true for all imported, subscribed contacts.
   * Safe default: true (they were on a marketing list; Fine Print is the primary product).
   */
  setNutritionInsights: boolean;
  /**
   * If true, also log `fine_print_sequence_completed` for every successfully
   * subscribed contact. This makes them immediately eligible for editorial sends.
   * ONLY enable when migrating legacy opted-in contacts who should skip nurture.
   * Default: false — must be explicitly enabled by the operator.
   */
  markAsEditorialEligible: boolean;
}

export const DEFAULT_IMPORT_OPTIONS: ImportOptions = {
  unknownConsentBehavior: 'subscribe',
  setNutritionInsights: true,
  markAsEditorialEligible: false,
};

// ---------------------------------------------------------------------------
// Row limit for test / partial imports
// ---------------------------------------------------------------------------

export type RowLimitOption = '1' | '5' | '10' | 'all';

export const ROW_LIMIT_OPTIONS: { value: RowLimitOption; label: string }[] = [
  { value: '1', label: 'First 1 row (single test)' },
  { value: '5', label: 'First 5 rows (small test)' },
  { value: '10', label: 'First 10 rows (sample test)' },
  { value: 'all', label: 'All rows (full import)' },
];
