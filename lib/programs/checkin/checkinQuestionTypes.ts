/**
 * P1a — typed, presentation-capable check-in question schema.
 *
 * `program_checkin_templates.questions_json` currently stores a *contract* only
 * (key + value_type + required); presentation (labels, options, widgets) is not
 * persisted. The generic check-in renderer therefore resolves a per-program
 * question SET — preferring a presentation-rich `questions_json` when present,
 * otherwise a code-owned set registered by program slug (see
 * checkinQuestionSetRegistry). This module is the shared shape used by both the
 * renderer (ProgramCheckinPanel) and the payload builder (buildCheckinPayload).
 */

export type CheckinFieldValueType = 'number' | 'string' | 'string_array';

export type CheckinFieldInput = 'score' | 'select' | 'delta' | 'text' | 'number';

export interface CheckinQuestionOption {
  value: string;
  label: string;
}

export interface CheckinQuestion {
  key: string;
  label: string;
  /** Drives payload coercion in buildCheckinPayload. */
  valueType: CheckinFieldValueType;
  /** Presentational hint. Questions with options render as a labelled <select>. */
  input: CheckinFieldInput;
  /** Choices for select/score/delta inputs. Empty for free text/number inputs. */
  options: CheckinQuestionOption[];
  help?: string;
  /**
   * For `string_array` single-select-to-array fields (e.g. Baseline
   * `gi_red_flags`): selecting this value — or leaving the field empty — yields
   * an empty array; any other value yields `[value]`.
   */
  noneValue?: string;
}

export interface CheckinQuestionSet {
  /** Eyebrow label shown above the check-in title. */
  eyebrow?: string;
  /** Questions shown on every check-in day. */
  base: CheckinQuestion[];
  /** Check-in day on which `finalExtra` questions are appended. */
  finalDay?: number;
  /** Extra questions appended only on the program's `finalDay` check-in. */
  finalExtra?: CheckinQuestion[];
}
