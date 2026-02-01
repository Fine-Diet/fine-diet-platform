'use client';

import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getSafeRedirectTarget } from '@/lib/redirectHelpers';
import { journalService } from '@/lib/journal';
import type { MealTemplate } from '@/lib/journal';

export default function JournalMealsPage() {
  const router = useRouter();
  const q = (router.query ?? {}) as Record<string, string | undefined>;
  const redirectTarget = getSafeRedirectTarget(q.redirect ?? null, '/journal');

  const [templates, setTemplates] = useState<MealTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadTemplates = async () => {
    setLoading(true);
    const list = await journalService.listMealTemplates();
    setTemplates(list);
    setLoading(false);
  };

  useEffect(() => {
    loadTemplates();
  }, []);

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    setDeletingId(id);
    const success = await journalService.deleteMealTemplate(id);
    if (success) {
      setTemplates((prev) => prev.filter((t) => t.id !== id));
    }
    setDeletingId(null);
  };

  // Compute total calories for a meal template
  const getTotalCalories = (t: MealTemplate): number | null => {
    let total = 0;
    let hasCalories = false;
    for (const item of t.items) {
      if (typeof item.calories === 'number') {
        total += item.calories;
        hasCalories = true;
      }
    }
    return hasCalories ? total : null;
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
        <h1 className="text-lg font-medium text-white">Saved meals</h1>
      </header>

      <main className="flex-1 px-4 py-6">
        {loading ? (
          <p className="text-white/50 text-sm py-8">Loading...</p>
        ) : templates.length === 0 ? (
          <div className="py-12 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-white/5 flex items-center justify-center">
              <svg className="w-8 h-8 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            </div>
            <p className="text-white/50 text-sm mb-2">No saved meals yet</p>
            <p className="text-white/30 text-xs">Create one from the Log Entry page</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {templates.map((t) => {
              const totalCalories = getTotalCalories(t);
              return (
                <li
                  key={t.id}
                  className="rounded-xl bg-white/5 border border-white/10 overflow-hidden"
                >
                  <div className="px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="text-white font-medium truncate">{t.name}</h3>
                        <p className="text-white/50 text-sm mt-0.5">
                          {t.items.length} item{t.items.length !== 1 ? 's' : ''}
                          {totalCalories !== null && (
                            <span className="ml-2 text-white/40">
                              · {Math.round(totalCalories)} cal
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Link
                          href={`/journal/meals/edit/${t.id}?redirect=${encodeURIComponent(router.asPath)}`}
                          className="px-3 py-1.5 text-sm text-white/70 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                        >
                          Edit
                        </Link>
                        <button
                          onClick={() => handleDelete(t.id, t.name)}
                          disabled={deletingId === t.id}
                          className="px-3 py-1.5 text-sm text-red-400/80 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors disabled:opacity-50"
                        >
                          {deletingId === t.id ? '...' : 'Delete'}
                        </button>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
