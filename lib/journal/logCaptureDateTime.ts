import {
  formatTime,
  setTimeOnDate,
  TIME_BLOCK_DEFAULTS,
  toDateKey,
  type TimeBlock,
} from '@/lib/journal/types';

const TIME_BLOCKS: readonly TimeBlock[] = ['morning', 'midday', 'evening'];

export interface LogCaptureRouteContext {
  dateValue: string;
  timeValue: string;
  block: TimeBlock;
  error: string | null;
}

export interface ValidatedLogCaptureDateTime {
  date: Date;
  occurredAt: Date;
}

function parseStrictLogDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(year, month - 1, day);
  if (year >= 0 && year < 100) parsed.setFullYear(year);
  if (
    !Number.isFinite(parsed.getTime())
    || parsed.getFullYear() !== year
    || parsed.getMonth() !== month - 1
    || parsed.getDate() !== day
  ) return null;
  return parsed;
}

export function isValidLogDate(value: string): boolean {
  return parseStrictLogDate(value) !== null;
}

export function isValidLogTime(value: string): boolean {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function validateLogCaptureDateTime(
  dateValue: string,
  timeValue: string,
): { value: ValidatedLogCaptureDateTime | null; error: string | null } {
  if (!isValidLogDate(dateValue)) {
    return { value: null, error: 'Enter a valid calendar date before saving.' };
  }
  if (!isValidLogTime(timeValue)) {
    return { value: null, error: 'Enter a valid time from 00:00 through 23:59 before saving.' };
  }

  const date = parseStrictLogDate(dateValue);
  if (!date) return { value: null, error: 'Enter a valid calendar date before saving.' };
  const occurredAt = setTimeOnDate(date, timeValue);
  if (toDateKey(occurredAt) !== dateValue || formatTime(occurredAt) !== timeValue) {
    return { value: null, error: 'That local date and time cannot be represented. Choose another time.' };
  }
  return { value: { date, occurredAt }, error: null };
}

function readSingleQueryValue(query: Record<string, unknown>, key: string):
  | { present: false; value: undefined }
  | { present: true; value: string | null } {
  if (!Object.prototype.hasOwnProperty.call(query, key)) return { present: false, value: undefined };
  const value = query[key];
  return { present: true, value: typeof value === 'string' ? value : null };
}

/** Resolve route context without allowing parseLocalDate to normalize invalid query dates. */
export function resolveLogCaptureRouteContext(
  query: Record<string, unknown>,
  now: Date = new Date(),
): LogCaptureRouteContext {
  const dateParam = readSingleQueryValue(query, 'date');
  const timeParam = readSingleQueryValue(query, 'time');
  const blockParam = readSingleQueryValue(query, 'block');

  const block = blockParam.present && blockParam.value && TIME_BLOCKS.includes(blockParam.value as TimeBlock)
    ? blockParam.value as TimeBlock
    : 'morning';
  const dateValue = dateParam.present
    ? dateParam.value ?? ''
    : toDateKey(now);
  const timeValue = timeParam.present
    ? timeParam.value ?? ''
    : block
      ? TIME_BLOCK_DEFAULTS[block]
      : '';

  if (!isValidLogDate(dateValue)) return { dateValue, timeValue, block, error: 'The selected date is invalid. Choose a valid calendar date.' };
  if (!isValidLogTime(timeValue)) return { dateValue, timeValue, block, error: 'The selected time is invalid. Choose a time from 00:00 through 23:59.' };
  return { dateValue, timeValue, block, error: null };
}
