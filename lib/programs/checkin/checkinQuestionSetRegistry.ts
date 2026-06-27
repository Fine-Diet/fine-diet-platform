/**
 * P1a — per-slug check-in question-set registry + resolver.
 *
 * Resolves the ordered questions to render for a program's check-in, with this
 * precedence:
 *   1. presentation-rich `template.questions_json` (future data-driven programs)
 *   2. code-registered question set for the program slug (base + finalExtra on
 *      the program's finalDay)
 *   3. degraded contract-only `questions_json` (key/value_type only) → minimal
 *      free-input questions so an authored-but-unregistered program still renders
 *
 * Baseline resolves via (2) — its DB `questions_json` is contract-only — so the
 * generic renderer reproduces the original Baseline UI exactly.
 */

import type { ProgramCheckinTemplate } from '../runtimeTypes';
import { BASELINE_CHECKIN_QUESTION_SET } from './baselineCheckinQuestionSet';
import type {
  CheckinFieldValueType,
  CheckinQuestion,
  CheckinQuestionOption,
  CheckinQuestionSet,
} from './checkinQuestionTypes';

const REGISTRY: Record<string, CheckinQuestionSet> = {
  baseline: BASELINE_CHECKIN_QUESTION_SET,
};

export function getCheckinQuestionSet(
  programSlug: string,
): CheckinQuestionSet | null {
  return REGISTRY[programSlug.trim().toLowerCase()] ?? null;
}

export function getCheckinEyebrow(programSlug: string): string {
  return getCheckinQuestionSet(programSlug)?.eyebrow ?? 'Program check-in';
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function coerceValueType(value: unknown): CheckinFieldValueType {
  if (value === 'number' || value === 'string_array') return value;
  return 'string';
}

function coerceOptions(value: unknown): CheckinQuestionOption[] {
  if (!Array.isArray(value)) return [];
  const out: CheckinQuestionOption[] = [];
  for (const entry of value) {
    if (isObject(entry) && typeof entry.value === 'string') {
      out.push({
        value: entry.value,
        label:
          typeof entry.label === 'string' ? entry.label : entry.value,
      });
    } else if (typeof entry === 'string') {
      out.push({ value: entry, label: entry });
    }
  }
  return out;
}

/** A presentation-rich questions_json entry carries label and/or options. */
function isRichQuestion(entry: unknown): entry is Record<string, unknown> {
  return (
    isObject(entry) &&
    typeof entry.key === 'string' &&
    ('label' in entry || 'options' in entry)
  );
}

function mapRichQuestion(entry: Record<string, unknown>): CheckinQuestion {
  const options = coerceOptions(entry.options);
  const valueType = coerceValueType(entry.value_type ?? entry.valueType);
  const input =
    entry.input === 'score' ||
    entry.input === 'delta' ||
    entry.input === 'select' ||
    entry.input === 'text' ||
    entry.input === 'number'
      ? entry.input
      : options.length > 0
        ? 'select'
        : valueType === 'number'
          ? 'number'
          : 'text';
  return {
    key: String(entry.key),
    label: typeof entry.label === 'string' ? entry.label : String(entry.key),
    valueType,
    input,
    options,
    help: typeof entry.help === 'string' ? entry.help : undefined,
    noneValue:
      typeof entry.none_value === 'string'
        ? entry.none_value
        : typeof entry.noneValue === 'string'
          ? entry.noneValue
          : undefined,
  };
}

/** Degraded fallback for contract-only entries ({ key, value_type, required }). */
function mapContractQuestion(entry: Record<string, unknown>): CheckinQuestion {
  const valueType = coerceValueType(entry.value_type ?? entry.valueType);
  return {
    key: String(entry.key),
    label: String(entry.key),
    valueType,
    input: valueType === 'number' ? 'number' : 'text',
    options: [],
  };
}

type TemplateLike = Pick<ProgramCheckinTemplate, 'checkin_day' | 'questions_json'>;

export function resolveCheckinQuestions(input: {
  programSlug: string;
  template: TemplateLike | null;
}): CheckinQuestion[] {
  const { programSlug, template } = input;
  const rawQuestions = Array.isArray(template?.questions_json)
    ? (template?.questions_json as unknown[])
    : [];

  // 1. presentation-rich questions_json wins (data-driven programs)
  const rich = rawQuestions.filter(isRichQuestion);
  if (rich.length > 0) return rich.map(mapRichQuestion);

  // 2. code-registered question set for this program
  const set = getCheckinQuestionSet(programSlug);
  if (set) {
    if (
      template &&
      set.finalDay != null &&
      template.checkin_day === set.finalDay &&
      set.finalExtra &&
      set.finalExtra.length > 0
    ) {
      return [...set.base, ...set.finalExtra];
    }
    return set.base;
  }

  // 3. degraded contract-only fallback
  return rawQuestions
    .filter(
      (entry): entry is Record<string, unknown> =>
        isObject(entry) && typeof entry.key === 'string',
    )
    .map(mapContractQuestion);
}
