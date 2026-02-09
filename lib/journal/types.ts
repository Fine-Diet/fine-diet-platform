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

/** Entry type for journal (intake = food/drink for now) */
export type JournalEntryType = 'intake' | 'water' | 'other';

export interface JournalEntryPayload {
  /** Display name (e.g. "Oatmeal", "Coffee") */
  name?: string;
  quantity?: number;
  unit?: string;
  /** Calories for this entry */
  calories?: number;
  /** Optional; if present can drive macros later */
  macros?: { protein?: number; carbs?: number; fat?: number };
  /** Reference to canonical FoodObject (Phase 3) */
  foodObjectId?: string;
  /** Serving size in grams (for scaling nutrients) */
  servingSizeG?: number;
}

export interface JournalEntry {
  id: string;
  type: JournalEntryType;
  timestamp: Date;
  /** Derivable from timestamp via deriveBlock(); can be stored for fast filtering */
  block: TimeBlock;
  payload: JournalEntryPayload;
  created_at: Date;
  updated_at: Date;
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
 * Calculate daily totals from a list of entries.
 * Sums calories and macros from all intake entries.
 */
export function calculateDailyTotals(entries: JournalEntry[]): DailyTotals {
  let caloriesConsumed = 0;
  const macrosConsumed = { protein: 0, carbs: 0, fat: 0 };

  for (const entry of entries) {
    if (entry.type !== 'intake') continue;
    
    // Sum calories (ignore null/undefined)
    if (typeof entry.payload.calories === 'number') {
      caloriesConsumed += entry.payload.calories;
    }
    
    // Sum macros if present
    if (entry.payload.macros) {
      macrosConsumed.protein += entry.payload.macros.protein ?? 0;
      macrosConsumed.carbs += entry.payload.macros.carbs ?? 0;
      macrosConsumed.fat += entry.payload.macros.fat ?? 0;
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
