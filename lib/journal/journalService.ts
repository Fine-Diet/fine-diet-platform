/**
 * Journal V1 data service.
 * Phase 2: Supabase persistence via API routes.
 * 
 * All methods are now async and call the /api/journal/* endpoints.
 * The API handles auth and person_id resolution automatically.
 */

import type { TimeBlock } from './types';
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
  return {
    id: data.id,
    type: data.type as JournalEntryType,
    timestamp: new Date(data.timestamp),
    block: data.block,
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
   * Create a new journal entry
   */
  async createEntry(opts: {
    type: JournalEntryType;
    date: Date;
    time?: string;
    block?: TimeBlock;
    payload?: JournalEntryPayload;
  }): Promise<JournalEntry> {
    const block = opts.block ?? deriveBlock(opts.date);
    const timeStr = opts.time ?? TIME_BLOCK_DEFAULTS[block];
    const occurredAt = setTimeOnDate(new Date(opts.date), timeStr);

    const { entry } = await apiFetch<{ entry: ApiEntryResponse }>('/api/journal/entries', {
      method: 'POST',
      body: JSON.stringify({
        occurredAt: occurredAt.toISOString(),
        entryType: opts.type,
        payload: opts.payload || {},
      }),
    });

    return parseApiEntry(entry);
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
   * List entries for a specific day
   */
  async listEntriesByDay(date: Date): Promise<JournalEntry[]> {
    const dateKey = toDateKey(date);
    try {
      const { entries } = await apiFetch<{ entries: ApiEntryResponse[] }>(
        `/api/journal/entries?date=${dateKey}`
      );
      return entries.map(parseApiEntry);
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
};
