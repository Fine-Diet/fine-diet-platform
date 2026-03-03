'use client';

import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getSafeRedirectTarget } from '@/lib/redirectHelpers';
import {
  journalService,
  toDateKey,
  deriveBlock,
  parseLocalDate,
  type TimeBlock,
  type JournalEntry,
} from '@/lib/journal';
import { formatFoodNameString } from '@/lib/food';

function parseDateParam(value: string | string[] | null | undefined): Date {
  const v = Array.isArray(value) ? value[0] : value;
  return parseLocalDate(v);
}

export default function JournalMealsCreatePage() {
  const router = useRouter();
  const q = (router.query ?? {}) as Record<string, string | undefined>;
  const block = (q.block ?? 'morning') as TimeBlock;
  const dateParam = q.date;
  const redirectTarget = getSafeRedirectTarget(q.redirect ?? null, '/journal');

  const date = parseDateParam(dateParam);
  const dateKey = toDateKey(date);

  const [name, setName] = useState('');
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [includedIds, setIncludedIds] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const list = await journalService.listEntriesByDay(date);
      // Filter by local date first (server returns wide window), then by block
      const filtered = list.filter((e) => {
        const entryDateKey = toDateKey(e.timestamp);
        return entryDateKey === dateKey && deriveBlock(e.timestamp) === block && e.type === 'intake';
      });
      setEntries(filtered);
      setIncludedIds(new Set(filtered.map((e) => e.id)));
    })();
  }, [dateKey, block]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleIncluded = (id: string) => {
    setIncludedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    const selected = entries.filter((e) => includedIds.has(e.id));
    if (selected.length === 0) return;
    setSaving(true);
    await journalService.createMealTemplateFromEntries(selected, name.trim());
    setSaved(true);
    setSaving(false);
    setTimeout(() => {
      const base = redirectTarget.replace(/#.*$/, '');
      const sep = base.includes('?') ? '&' : '?';
      router.push(`${base}${sep}meal_created=1`);
    }, 1200);
  };

  return (
    <div className="min-h-screen bg-brand-900 text-white max-w-[1200px] mx-auto relative flex flex-col">
      <header className="sticky top-0 z-20 flex items-center gap-4 px-4 py-4 border-b border-white/10 bg-brand-900/95 backdrop-blur">
        <Link
          href={redirectTarget}
          className="p-2 -ml-2 text-white/80 hover:text-white transition-colors"
          aria-label="Back"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="text-lg font-medium text-white">Create saved meal</h1>
      </header>

      <main className="flex-1 px-4 py-6 space-y-6">
        {saved ? (
          <div className="py-8 text-center text-dark_accent-300 font-medium">
            Meal saved. Redirecting…
          </div>
        ) : (
          <>
            <div>
              <label className="block text-white/70 text-sm font-medium mb-1">Meal name</label>
              <input
                type="text"
                placeholder="e.g. Breakfast usual"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg bg-white/10 border border-white/20 px-4 py-2.5 text-white placeholder-white/50 text-sm focus:outline-none focus:ring-2 focus:ring-white/30"
              />
            </div>

            <div>
              <h2 className="text-white/80 text-sm font-medium mb-2">Included items</h2>
              <p className="text-white/50 text-xs mb-2">Uncheck to remove from this meal template.</p>
              <ul className="space-y-2">
                {entries.map((entry) => {
                  const p = entry.payload as { name?: string; quantity?: number; unit?: string };
                  return (
                  <li key={entry.id} className="flex items-center gap-3 p-3 rounded-lg bg-white/5 border border-white/10">
                    <input
                      type="checkbox"
                      id={`inc-${entry.id}`}
                      checked={includedIds.has(entry.id)}
                      onChange={() => toggleIncluded(entry.id)}
                      className="rounded border-white/30 text-dark_accent-500 focus:ring-white/30"
                    />
                    <label htmlFor={`inc-${entry.id}`} className="flex-1 text-white cursor-pointer">
                      {formatFoodNameString(p.name ?? 'Untitled')}
                      {p.quantity != null && (
                        <span className="text-white/60 text-sm ml-1">
                          {p.quantity} {p.unit ?? ''}
                        </span>
                      )}
                    </label>
                  </li>
                  );
                })}
              </ul>
            </div>

            <div className="pt-4 border-t border-white/10 flex gap-3">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !name.trim() || includedIds.size === 0}
                className="px-4 py-2.5 rounded-lg bg-dark_accent-500 text-neutral-900 text-sm font-medium hover:bg-dark_accent-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {saving ? 'Saving…' : 'Save meal'}
              </button>
              <Link
                href={redirectTarget}
                className="px-4 py-2.5 rounded-lg border border-white/20 text-white/80 text-sm font-medium hover:bg-white/10 transition-colors"
              >
                Cancel
              </Link>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
