import { APP_ROUTES } from '@/lib/routes/appRoutes';

export type LogTrackingKey =
  | 'intake'
  | 'water'
  | 'sleep'
  | 'supplement'
  | 'mood'
  | 'bowel'
  | 'cycle'
  | 'movement'
  | 'blood_pressure'
  | 'glucose'
  | 'temperature'
  | 'weight';

export interface LogTrackingDestination {
  key: LogTrackingKey;
  label: string;
  tab: string | null;
  captureSupported: boolean;
}

/** Stable display order, canonical names, and supported capture routes. */
export const LOG_TRACKING_DESTINATIONS: readonly LogTrackingDestination[] = [
  { key: 'intake', label: 'Nutrition', tab: 'food', captureSupported: true },
  { key: 'water', label: 'Hydration', tab: 'water', captureSupported: true },
  { key: 'sleep', label: 'Sleep', tab: 'sleep', captureSupported: true },
  { key: 'supplement', label: 'Supplements', tab: 'supplements', captureSupported: true },
  { key: 'mood', label: 'Mood', tab: 'mood', captureSupported: true },
  { key: 'bowel', label: 'Bowel', tab: 'bowel', captureSupported: true },
  { key: 'cycle', label: 'Cycle', tab: 'cycle', captureSupported: true },
  { key: 'movement', label: 'Movement', tab: 'movement', captureSupported: true },
  { key: 'blood_pressure', label: 'Blood Pressure', tab: 'blood_pressure', captureSupported: true },
  { key: 'glucose', label: 'Glucose', tab: null, captureSupported: false },
  { key: 'temperature', label: 'Temperature', tab: null, captureSupported: false },
  { key: 'weight', label: 'Weight', tab: null, captureSupported: false },
] as const;

export const DEFAULT_LOG_TRACKING_KEYS: readonly LogTrackingKey[] = [
  'intake', 'water', 'sleep', 'supplement', 'mood', 'bowel', 'cycle', 'movement',
];

const DESTINATION_BY_KEY = new Map(LOG_TRACKING_DESTINATIONS.map((item) => [item.key, item]));
const TRACKING_KEY_ALIASES: Record<string, LogTrackingKey> = {
  food: 'intake',
  hydration: 'water',
  supplements: 'supplement',
  bp: 'blood_pressure',
  bloodPressure: 'blood_pressure',
};

export function normalizeLogTrackingKey(value: unknown): LogTrackingKey | null {
  if (typeof value !== 'string') return null;
  const key = TRACKING_KEY_ALIASES[value] ?? value;
  return DESTINATION_BY_KEY.has(key as LogTrackingKey) ? (key as LogTrackingKey) : null;
}

/** Normalize aliases and return known keys in the shared stable display order. */
export function normalizeEnabledLogTrackingKeys(keys: readonly unknown[]): LogTrackingKey[] {
  const enabled = new Set(keys.map(normalizeLogTrackingKey).filter((key): key is LogTrackingKey => key !== null));
  return LOG_TRACKING_DESTINATIONS.filter((item) => enabled.has(item.key)).map((item) => item.key);
}

/** Match the authenticated settings API's existing default behavior for unset or empty settings. */
export function getEffectiveEnabledLogTrackingKeys(keys: readonly unknown[]): LogTrackingKey[] {
  const normalized = normalizeEnabledLogTrackingKeys(keys);
  return normalized.length > 0 ? normalized : [...DEFAULT_LOG_TRACKING_KEYS];
}

export function getLogTrackingDestination(key: unknown): LogTrackingDestination | null {
  const normalized = normalizeLogTrackingKey(key);
  return normalized ? DESTINATION_BY_KEY.get(normalized) ?? null : null;
}

export function getLogTrackingHref(destination: LogTrackingDestination): string | null {
  return destination.captureSupported && destination.tab
    ? `${APP_ROUTES.logNew}?tab=${encodeURIComponent(destination.tab)}`
    : null;
}
