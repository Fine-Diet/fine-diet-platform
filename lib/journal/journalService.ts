/**
 * Journal V1 data service.
 * Phase 2: Supabase persistence via API routes.
 * 
 * All methods are now async and call the /api/journal/* endpoints.
 * The API handles auth and person_id resolution automatically.
 */

import type { TimeBlock, UserGoals } from './types';
import {
  deriveBlock,
  toDateKey,
  setTimeOnDate,
  TIME_BLOCK_DEFAULTS,
  type JournalEntry,
  type JournalEntryPayload,
  type JournalEntryType,
  type MealTemplate,
  type MealTemplateItem,
} from './types';

// Default goals for client-side fallback
const DEFAULT_GOALS: UserGoals = {
  dailyCalorieGoal: 2500,
  macroGoals: {
    protein_g: 150,
    carbs_g: 250,
    fat_g: 80,
  },
  isDefault: true,
};

// ============================================================================
// API Response Types
// ============================================================================

interface ApiEntryResponse {
  id: string;
  type: string;
  timestamp: string;
  block: TimeBlock;
  payload: JournalEntryPayload;
  created_at: string;
  updated_at: string;
}

interface ApiMealTemplateResponse {
  id: string;
  name: string;
  items: MealTemplateItem[];
  nutritionDensity?: number;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Helpers
// ============================================================================

function parseApiEntry(data: ApiEntryResponse): JournalEntry {
  const timestamp = new Date(data.timestamp);
  // Derive block from occurred_at (timestamp) in client timezone; ignore server block
  return {
    id: data.id,
    type: data.type as JournalEntryType,
    timestamp,
    block: deriveBlock(timestamp),
    payload: data.payload || {},
    created_at: new Date(data.created_at),
    updated_at: new Date(data.updated_at),
  };
}

function parseApiTemplate(data: ApiMealTemplateResponse): MealTemplate {
  return {
    id: data.id,
    name: data.name,
    items: data.items || [],
    nutritionDensity: data.nutritionDensity,
    created_at: new Date(data.created_at),
    updated_at: new Date(data.updated_at),
  };
}

async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `API error: ${res.status}`);
  }

  return res.json();
}

// ============================================================================
// Journal Service (Async API-based)
// ============================================================================

export const journalService = {
  /**
   * Create a new journal entry.
   * If occurredAt is provided it is the single source of truth; otherwise computed from date+time.
   */
  async createEntry(opts: {
    type: JournalEntryType;
    date: Date;
    time?: string;
    block?: TimeBlock;
    payload?: JournalEntryPayload;
    /** Canonical timestamp for the entry; when set, overrides date+time */
    occurredAt?: Date;
  }): Promise<JournalEntry> {
    const occurredAt =
      opts.occurredAt ??
      setTimeOnDate(new Date(opts.date), opts.time ?? TIME_BLOCK_DEFAULTS[opts.block ?? deriveBlock(opts.date)]);

    if (process.env.NODE_ENV === 'development') {
      console.log('[journalService.createEntry] occurred_at sent:', occurredAt.toISOString(), occurredAt.toLocaleTimeString());
    }

    const { entry } = await apiFetch<{ entry: ApiEntryResponse }>('/api/journal/entries', {
      method: 'POST',
      body: JSON.stringify({
        occurredAt: occurredAt.toISOString(),
        entryType: opts.type,
        payload: opts.payload || {},
      }),
    });

    const parsed = parseApiEntry(entry);
    if (process.env.NODE_ENV === 'development') {
      console.log('[journalService.createEntry] occurred_at returned:', parsed.timestamp.toISOString(), parsed.timestamp.toLocaleTimeString(), 'block:', parsed.block);
    }
    return parsed;
  },

  /**
   * Update an existing entry
   */
  async updateEntry(
    id: string,
    updates: Partial<Pick<JournalEntry, 'payload' | 'timestamp'>>
  ): Promise<JournalEntry | null> {
    try {
      const body: Record<string, any> = {};
      if (updates.timestamp) {
        body.occurredAt = updates.timestamp.toISOString();
      }
      if (updates.payload) {
        body.payload = updates.payload;
      }

      const { entry } = await apiFetch<{ entry: ApiEntryResponse }>(`/api/journal/entries/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });

      return parseApiEntry(entry);
    } catch (error) {
      console.error('[journalService.updateEntry] Error:', error);
      return null;
    }
  },

  /**
   * Delete an entry
   */
  async deleteEntry(id: string): Promise<boolean> {
    try {
      await apiFetch<{ success: boolean }>(`/api/journal/entries/${id}`, {
        method: 'DELETE',
      });
      return true;
    } catch (error) {
      console.error('[journalService.deleteEntry] Error:', error);
      return false;
    }
  },

  /**
   * Get a single entry by ID
   */
  async getEntry(id: string): Promise<JournalEntry | null> {
    try {
      const { entry } = await apiFetch<{ entry: ApiEntryResponse }>(`/api/journal/entries/${id}`);
      return parseApiEntry(entry);
    } catch (error) {
      console.error('[journalService.getEntry] Error:', error);
      return null;
    }
  },

  /**
   * List entries for a specific day.
   * Returns entries sorted by timestamp ASC, then id ASC for deterministic ordering.
   */
  async listEntriesByDay(date: Date): Promise<JournalEntry[]> {
    const dateKey = toDateKey(date);
    try {
      const { entries } = await apiFetch<{ entries: ApiEntryResponse[] }>(
        `/api/journal/entries?date=${dateKey}`
      );
      const parsed = entries.map(parseApiEntry);
      // Sort client-side as safety net for deterministic ordering
      parsed.sort((a, b) => {
        const timeDiff = a.timestamp.getTime() - b.timestamp.getTime();
        if (timeDiff !== 0) return timeDiff;
        return a.id.localeCompare(b.id);
      });
      return parsed;
    } catch (error) {
      console.error('[journalService.listEntriesByDay] Error:', error);
      return [];
    }
  },

  /**
   * List entries for a specific day and block
   */
  async listEntriesByDayAndBlock(date: Date, block: TimeBlock): Promise<JournalEntry[]> {
    const dateKey = toDateKey(date);
    try {
      const { entries } = await apiFetch<{ entries: ApiEntryResponse[] }>(
        `/api/journal/entries?date=${dateKey}&block=${block}`
      );
      return entries.map(parseApiEntry);
    } catch (error) {
      console.error('[journalService.listEntriesByDayAndBlock] Error:', error);
      return [];
    }
  },

  /**
   * Create a meal template from entries
   */
  async createMealTemplateFromEntries(
    entries: JournalEntry[],
    name: string
  ): Promise<MealTemplate> {
    const items: MealTemplateItem[] = entries.map((e, i) => ({
      id: `item-${e.id}-${i}`,
      name: e.payload.name ?? 'Untitled',
      quantity: e.payload.quantity,
      unit: e.payload.unit,
    }));

    const { template } = await apiFetch<{ template: ApiMealTemplateResponse }>('/api/journal/meals', {
      method: 'POST',
      body: JSON.stringify({ name, items }),
    });

    return parseApiTemplate(template);
  },

  /**
   * List all meal templates
   */
  async listMealTemplates(): Promise<MealTemplate[]> {
    try {
      const { templates } = await apiFetch<{ templates: ApiMealTemplateResponse[] }>(
        '/api/journal/meals'
      );
      return templates.map(parseApiTemplate);
    } catch (error) {
      console.error('[journalService.listMealTemplates] Error:', error);
      return [];
    }
  },

  /**
   * Get a single meal template by ID
   */
  async getMealTemplate(id: string): Promise<MealTemplate | null> {
    try {
      const { template } = await apiFetch<{ template: ApiMealTemplateResponse }>(
        `/api/journal/meals/${id}`
      );
      return parseApiTemplate(template);
    } catch (error) {
      console.error('[journalService.getMealTemplate] Error:', error);
      return null;
    }
  },

  /**
   * Delete a meal template
   */
  async deleteMealTemplate(id: string): Promise<boolean> {
    try {
      await apiFetch<{ success: boolean }>(`/api/journal/meals/${id}`, {
        method: 'DELETE',
      });
      return true;
    } catch (error) {
      console.error('[journalService.deleteMealTemplate] Error:', error);
      return false;
    }
  },

  /**
   * Get user's daily goals (calorie goal, macro goals)
   * Falls back to defaults if not authenticated or not set
   */
  async getGoals(): Promise<UserGoals> {
    try {
      const { goals } = await apiFetch<{ goals: UserGoals }>('/api/journal/goals');
      return goals;
    } catch (error) {
      console.error('[journalService.getGoals] Error, using defaults:', error);
      return DEFAULT_GOALS;
    }
  },

  /**
   * List recently logged foods (history).
   * Returns deduped list by foodObjectId, most recent first.
   */
  async listHistoryFoods(options: { limit?: number } = {}): Promise<HistoryFoodItem[]> {
    const { limit = 50 } = options;
    try {
      const { foods } = await apiFetch<{ foods: HistoryFoodItem[] }>(
        `/api/journal/history?limit=${limit}`
      );
      return foods;
    } catch (error) {
      console.error('[journalService.listHistoryFoods] Error:', error);
      return [];
    }
  },
};

/**
 * History food item shape returned by the history API.
 */
export interface HistoryFoodItem {
  foodObjectId: string;
  name: string;
  calories: number | null;
  proteinG: number | null;
  carbsG: number | null;
  fatG: number | null;
  servingSizeG: number | null;
  servingUnit: string | null;
  lastOccurredAt: string;
}
