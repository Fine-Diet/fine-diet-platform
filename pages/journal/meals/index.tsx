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

  useEffect(() => {
    (async () => {
      const list = await journalService.listMealTemplates();
      setTemplates(list);
    })();
  }, []);

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
        {templates.length === 0 ? (
          <p className="text-white/50 text-sm py-8">No saved meals yet. Create one from the Log Entry page.</p>
        ) : (
          <ul className="space-y-2">
            {templates.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between rounded-xl bg-white/5 border border-white/10 px-4 py-3"
              >
                <span className="text-white font-medium">{t.name}</span>
                <Link
                  href={`/journal/meals/edit/${t.id}?redirect=${encodeURIComponent(redirectTarget)}`}
                  className="text-sm text-white/70 hover:text-white transition-colors"
                >
                  Edit
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
