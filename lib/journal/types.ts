import type { MealSlotKey } from '@/lib/plans/types';

/**
 * Journal V1 shared types and helpers.
 * Used by Day View, Log Entry, Item Editor, and Saved Meals.
 */

export type TimeBlock = 'morning' | 'midday' | 'evening';

/** Default time (HH:mm) per block for new entries */
export const TIME_BLOCK_DEFAULTS: Record<TimeBlock, string> = {
  morning: '08:00',
  midday: '12:00',
  evening: '18:00',
};

/**
 * Derive time block from a timestamp.
 * morning: 04:00–11:59, midday: 12:00–16:59, evening: 17:00–03:59
 */
export function deriveBlock(timestamp: Date): TimeBlock {
  const hours = timestamp.getHours();
  if (hours >= 4 && hours < 12) return 'morning';
  if (hours >= 12 && hours < 17) return 'midday';
  return 'evening';
}

/** Entry type for journal. Core + add-ons. */
export type JournalEntryType =
  | 'intake'
  | 'water'
  | 'supplement'
  | 'mood'
  | 'bowel'
  | 'cycle'
  | 'movement'
  | 'blood_pressure'
  | 'sleep'
  | 'note'
  | 'other';

/** Reserved for future: glucose, temperature, weight */

export interface MealScheduleContext {
  slot_key: MealSlotKey;
  slot_label: string;
  slot_target_time: string;
  assignment_source: 'auto' | 'manual';
  meal_schedule_updated_at: string | null;
}

/** Intake (food/drink) payload */
export interface IntakePayload {
  name?: string;
  quantity?: number;
  unit?: string;
  calories?: number;
  macros?: { protein?: number; carbs?: number; fat?: number };
  foodObjectId?: string;
  servingSizeG?: number;
  measures?: Array<{ unit: string; grams: number; label?: string }>;
  meal_schedule_context?: MealScheduleContext;
}

/** Water payload */
export interface WaterPayload {
  amount: number;
  unit: 'oz' | 'ml';
}

/** Supplement payload */
export interface SupplementPayload {
  name: string;
  dose?: number;
  unit?: string;
}

/** Mood payload */
export interface MoodPayload {
  score: number; // 1-10
  tags?: string[];
  note?: string;
}

/** Bowel payload (Bristol scale) */
export interface BowelPayload {
  bristol: number; // 1-7
  urgency?: number; // 0-3
  discomfort?: number; // 0-3
  note?: string;
}

/** Cycle payload */
export interface CyclePayload {
  phase?: 'period' | 'follicular' | 'ovulation' | 'luteal';
  cycleDay?: number;
  symptoms?: string[];
}

/** Movement payload */
export interface MovementPayload {
  type: string;
  minutes: number;
  intensity?: 1 | 2 | 3; // 1=light, 2=moderate, 3=vigorous
}

/** Blood pressure payload */
export interface BloodPressurePayload {
  systolic: number;
  diastolic: number;
  unit: 'mmHg';
  pulse?: number;
  note?: string;
}

/** Sleep payload */
export interface SleepPayload {
  durationMinutes: number;
  quality?: 1 | 2 | 3 | 4 | 5;
  note?: string;
}

/** Note payload (free text) */
export interface NotePayload {
  text: string;
}

/** Union of all payload types */
export type JournalEntryPayload =
  | IntakePayload
  | WaterPayload
  | SupplementPayload
  | MoodPayload
  | BowelPayload
  | CyclePayload
  | MovementPayload
  | BloodPressurePayload
  | SleepPayload
  | NotePayload
  | Record<string, unknown>;

export interface JournalEntry {
  id: string;
  type: JournalEntryType;
  timestamp: Date;
  /** Derivable from timestamp via deriveBlock(); can be stored for fast filtering */
  block: TimeBlock;
  payload: JournalEntryPayload;
  created_at: Date;
  updated_at: Date;
  /** Canonical grams for this entry (null when conversion data unavailable) */
  quantityG?: number | null;
  /** NDS: Meal protein score (0-10), computed on mutation */
  proteinScore10?: number | null;
  /** NDS: Is this a main meal (>=250 kcal) */
  isMainMeal?: boolean | null;
}

export interface MealTemplateItem {
  id: string;
  name?: string;
  quantity?: number;
  unit?: string;
  /** Calories for this item */
  calories?: number;
  /** Macros in grams */
  macros?: { protein?: number; carbs?: number; fat?: number };
  /** Reference to FoodObject for re-logging */
  foodObjectId?: string;
  /** Serving size in grams */
  servingSizeG?: number;
  /** USDA household portion measures */
  measures?: Array<{ unit: string; grams: number; label?: string }>;
}

export interface MealTemplate {
  id: string;
  name: string;
  items: MealTemplateItem[];
  nutritionDensity?: number;
  created_at: Date;
  updated_at: Date;
}

/** YYYY-MM-DD for day-scoped queries */
export function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Parse YYYY-MM-DD as a local date (no UTC shift).
 * Avoids the pitfall of `new Date('YYYY-MM-DD')` which parses as UTC midnight.
 * Returns today if value is empty or invalid.
 */
export function parseLocalDate(value: string | null | undefined): Date {
  if (!value) return new Date();
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return new Date();
  const [, y, m, d] = match.map(Number);
  const date = new Date(y, m - 1, d);
  return isNaN(date.getTime()) ? new Date() : date;
}

/** Parse HH:mm and set on date, return new Date */
export function setTimeOnDate(date: Date, timeStr: string): Date {
  const [h, m] = timeStr.split(':').map(Number);
  const out = new Date(date);
  out.setHours(h ?? 0, m ?? 0, 0, 0);
  return out;
}

/** Format timestamp as HH:mm */
export function formatTime(date: Date): string {
  return date.toTimeString().slice(0, 5);
}

// ============================================================================
// User Goals Types
// ============================================================================

export interface MacroGoals {
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

export interface UserGoals {
  dailyCalorieGoal: number;
  macroGoals: MacroGoals;
  /** True if using defaults (user hasn't set custom goals) */
  isDefault: boolean;
}

// ============================================================================
// Daily Totals Calculation
// ============================================================================

export interface DailyTotals {
  caloriesConsumed: number;
  macrosConsumed: {
    protein: number;
    carbs: number;
    fat: number;
  };
}

/**
 * True when an intake payload carries a usable grouped-meal object
 * (`payload.meal_group` is a non-null, non-array object).
 *
 * Mirrors `hasMealGroupPayload` in lib/meals/loggedMealGroup.ts. It is
 * re-declared locally (rather than imported) to keep lib/journal free of a
 * runtime dependency on lib/meals and avoid any bundler cycle; the detection
 * rule is intentionally identical so totals and rendering agree on what a
 * grouped meal entry is.
 */
function payloadHasMealGroup(payload: unknown): boolean {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return false;
  }
  const group = (payload as { meal_group?: unknown }).meal_group;
  return typeof group === 'object' && group !== null && !Array.isArray(group);
}

/**
 * Calculate daily totals from a list of entries.
 * Sums calories and macros from all intake entries.
 *
 * Two intake shapes, two semantics:
 *
 * - Flat food entries (no `payload.meal_group`): `payload.calories` and
 *   `payload.macros` store *per-serving* values and `payload.quantity` is the
 *   multiplier (defaults to 1). These are scaled by quantity so totals reflect
 *   the actual amount consumed.
 *
 * - Grouped meal entries (`payload.meal_group` present): the grouped write
 *   path stores ALREADY-CONSUMED absolute totals on `payload.calories` /
 *   `payload.macros`, while `payload.quantity` mirrors `consumed_servings`
 *   purely for display/instance semantics. Multiplying again would double-count
 *   (per_serving * consumed_servings^2), so grouped top-level nutrition is
 *   summed as-is with an effective quantity of 1.
 */
export function calculateDailyTotals(entries: JournalEntry[]): DailyTotals {
  let caloriesConsumed = 0;
  const macrosConsumed = { protein: 0, carbs: 0, fat: 0 };

  for (const entry of entries) {
    if (entry.type !== 'intake') continue;

    const p = entry.payload as { quantity?: number; calories?: number; macros?: { protein?: number; carbs?: number; fat?: number } };

    // Grouped meal top-level nutrition is absolute (already consumed); flat
    // food nutrition is per-serving and must be scaled by quantity.
    const qty = payloadHasMealGroup(entry.payload) ? 1 : (p.quantity ?? 1);

    // Sum calories (ignore null/undefined), scaled by effective quantity
    if (typeof p.calories === 'number') {
      caloriesConsumed += p.calories * qty;
    }

    // Sum macros if present, scaled by effective quantity
    if (p.macros) {
      macrosConsumed.protein += (p.macros.protein ?? 0) * qty;
      macrosConsumed.carbs += (p.macros.carbs ?? 0) * qty;
      macrosConsumed.fat += (p.macros.fat ?? 0) * qty;
    }
  }

  return { caloriesConsumed, macrosConsumed };
}

// ============================================================================
// Nutrition Density (Stub for V1)
// ============================================================================

/**
 * Calculate Nutrition Density Score from entries and user goals.
 * 
 * Legacy stub: Returns null (no data available).
 * Real NDS is now computed via daily_nds table when ndsDailyBeta flag is ON.
 * 
 * @returns null - legacy path has no real calculation
 */
export function getNutritionDensityScore(
  _entries: JournalEntry[],
  _userGoals: UserGoals | null
): number | null {
  // Legacy path: return null so gauge shows "—" instead of fake 85
  // Real NDS comes from daily_nds table via useNDS hook
  return null;
}
