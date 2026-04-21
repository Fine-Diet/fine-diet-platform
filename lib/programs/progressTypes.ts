/**
 * Plans Phase 13 — Program progress & resume types
 *
 * Per-user progress state for Packet 12 content items, plus the derived
 * summary shapes the UI consumes for the library CTA and the detail
 * resume target.
 */

export type ProgramProgressStatus =
  | 'not_started'
  | 'in_progress'
  | 'completed';
export const PROGRAM_PROGRESS_STATUSES: ProgramProgressStatus[] = [
  'not_started',
  'in_progress',
  'completed',
];

/**
 * A raw progress row. Mirrors columns in `program_content_progress`.
 */
export interface ProgramContentProgress {
  id: string;
  person_id: string;
  program_slug: string;
  content_item_id: string;
  status: ProgramProgressStatus;
  started_at: string | null;
  completed_at: string | null;
  last_viewed_at: string | null;
  progress_percent: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Per-module aggregation used by the detail page. `item_states`
 * preserves the item order from Packet 12 delivery so the UI can align
 * checkmarks with the module outline without re-sorting.
 */
export interface ProgramProgressModuleSummary {
  module_id: string;
  items_total: number;
  items_completed: number;
  items_in_progress: number;
  item_states: Array<{
    content_item_id: string;
    status: ProgramProgressStatus;
    last_viewed_at: string | null;
  }>;
}

/**
 * Aggregate "where am I in this program?" read model.
 */
export interface ProgramProgressSummary {
  program_slug: string;
  items_total: number;
  items_completed: number;
  items_in_progress: number;
  percent_complete: number;
  /** Overall aggregate state: 'not_started' when no interaction at all,
   *  'completed' when every published item is complete, otherwise
   *  'in_progress'. Empty programs (no items) report 'not_started'. */
  aggregate_status: ProgramProgressStatus;
  modules: ProgramProgressModuleSummary[];
  /** Next item to surface in a Continue / Resume affordance. Null when
   *  the program is fully complete or has no items. */
  resume_content_item_id: string | null;
  resume_module_id: string | null;
  /** ISO-ish timestamp of the newest `last_viewed_at` across the program,
   *  for "Last opened …" copy. Null when nothing has been opened. */
  last_viewed_at: string | null;
}
