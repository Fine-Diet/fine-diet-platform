/**
 * Journal V1 data service.
 * Phase 1: in-memory implementation; can be swapped for API/DB later.
 * All methods are sync for simplicity; callers can wrap in Promise if needed.
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

type UserId = string;

const entriesByUser = new Map<UserId, JournalEntry[]>();
const templatesByUser = new Map<UserId, MealTemplate[]>();
let entryIdCounter = 0;
let templateIdCounter = 0;

function nextEntryId(): string {
  entryIdCounter += 1;
  return `e-${Date.now()}-${entryIdCounter}`;
}
function nextTemplateId(): string {
  templateIdCounter += 1;
  return `t-${Date.now()}-${templateIdCounter}`;
}

/** Resolve current user id for client; in Phase 1 we use a placeholder so UI works without auth in context. */
function getCurrentUserId(): UserId {
  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem('journal_dev_user_id');
      if (stored) return stored;
      const fallback = 'dev-user';
      localStorage.setItem('journal_dev_user_id', fallback);
      return fallback;
    } catch {
      return 'dev-user';
    }
  }
  return 'dev-user';
}

function ensureEntryLists(userId: UserId): JournalEntry[] {
  if (!entriesByUser.has(userId)) entriesByUser.set(userId, []);
  return entriesByUser.get(userId)!;
}
function ensureTemplateLists(userId: UserId): MealTemplate[] {
  if (!templatesByUser.has(userId)) templatesByUser.set(userId, []);
  return templatesByUser.get(userId)!;
}

export const journalService = {
  createEntry(
    opts: {
      type: JournalEntryType;
      date: Date;
      time?: string;
      block?: TimeBlock;
      payload?: JournalEntryPayload;
    },
    userId: UserId = getCurrentUserId()
  ): JournalEntry {
    const block = opts.block ?? deriveBlock(opts.date);
    const timeStr = opts.time ?? TIME_BLOCK_DEFAULTS[block];
    const timestamp = setTimeOnDate(new Date(opts.date), timeStr);
    const now = new Date();
    const entry: JournalEntry = {
      id: nextEntryId(),
      type: opts.type,
      timestamp,
      block: deriveBlock(timestamp),
      payload: opts.payload ?? {},
      created_at: now,
      updated_at: now,
    };
    ensureEntryLists(userId).push(entry);
    return entry;
  },

  updateEntry(
    id: string,
    updates: Partial<Pick<JournalEntry, 'payload' | 'timestamp'>>,
    userId: UserId = getCurrentUserId()
  ): JournalEntry | null {
    const list = ensureEntryLists(userId);
    const idx = list.findIndex((e) => e.id === id);
    if (idx < 0) return null;
    const prev = list[idx];
    const updated: JournalEntry = {
      ...prev,
      ...updates,
      timestamp: updates.timestamp ?? prev.timestamp,
      block: deriveBlock(updates.timestamp ?? prev.timestamp),
      payload: { ...prev.payload, ...(updates.payload ?? {}) },
      updated_at: new Date(),
    };
    list[idx] = updated;
    return updated;
  },

  deleteEntry(id: string, userId: UserId = getCurrentUserId()): boolean {
    const list = ensureEntryLists(userId);
    const idx = list.findIndex((e) => e.id === id);
    if (idx < 0) return false;
    list.splice(idx, 1);
    return true;
  },

  getEntry(id: string, userId: UserId = getCurrentUserId()): JournalEntry | null {
    const list = ensureEntryLists(userId);
    return list.find((e) => e.id === id) ?? null;
  },

  listEntriesByDay(date: Date, userId: UserId = getCurrentUserId()): JournalEntry[] {
    const list = ensureEntryLists(userId);
    const key = toDateKey(date);
    return list
      .filter((e) => toDateKey(e.timestamp) === key)
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  },

  listEntriesByDayAndBlock(
    date: Date,
    block: TimeBlock,
    userId: UserId = getCurrentUserId()
  ): JournalEntry[] {
    return journalService
      .listEntriesByDay(date, userId)
      .filter((e) => e.block === block);
  },

  createMealTemplateFromEntries(
    entries: JournalEntry[],
    name: string,
    userId: UserId = getCurrentUserId()
  ): MealTemplate {
    const now = new Date();
    const items: MealTemplateItem[] = entries.map((e, i) => ({
      id: `item-${e.id}-${i}`,
      name: e.payload.name ?? 'Untitled',
      quantity: e.payload.quantity,
      unit: e.payload.unit,
    }));
    const template: MealTemplate = {
      id: nextTemplateId(),
      name,
      items,
      created_at: now,
      updated_at: now,
    };
    ensureTemplateLists(userId).push(template);
    return template;
  },

  listMealTemplates(userId: UserId = getCurrentUserId()): MealTemplate[] {
    return [...ensureTemplateLists(userId)];
  },

  getMealTemplate(id: string, userId: UserId = getCurrentUserId()): MealTemplate | null {
    const list = ensureTemplateLists(userId);
    return list.find((t) => t.id === id) ?? null;
  },
};
