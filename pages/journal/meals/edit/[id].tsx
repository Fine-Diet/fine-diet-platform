'use client';

import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getSafeRedirectTarget } from '@/lib/redirectHelpers';
import { journalService } from '@/lib/journal';
import type { MealTemplate } from '@/lib/journal';

export default function JournalMealEditPage() {
  const router = useRouter();
  const rawId = router.query?.id;
  const id = typeof rawId === 'string' ? rawId : undefined;
  const q = (router.query ?? {}) as Record<string, string | undefined>;
  const redirectTarget = getSafeRedirectTarget(q.redirect ?? null, '/journal/meals');

  const [template, setTemplate] = useState<MealTemplate | null>(null);
  const [name, setName] = useState('');

  useEffect(() => {
    if (!id) return;
    const t = journalService.getMealTemplate(id);
    setTemplate(t ?? null);
    if (t) setName(t.name);
  }, [id]);

  if (id === undefined) return null;
  if (template === null && !id) return null;

  if (template === null) {
    return (
      <div className="min-h-screen bg-brand-900 text-white flex flex-col items-center justify-center px-4">
        <p className="text-white/70">Meal not found.</p>
        <Link href={redirectTarget} className="mt-4 text-white/90 hover:text-white underline">
          Back to saved meals
        </Link>
      </div>
    );
  }

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
        <h1 className="text-lg font-medium text-white">Edit meal</h1>
      </header>

      <main className="flex-1 px-4 py-6 space-y-6">
        <div>
          <label className="block text-white/70 text-sm mb-1">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-xl bg-white/10 border border-white/15 px-4 py-3 text-white placeholder-white/40 text-sm focus:outline-none focus:ring-2 focus:ring-white/20"
            placeholder="Meal name"
          />
        </div>
        <div>
          <h2 className="text-white/70 text-sm font-medium mb-2">Items ({template.items.length})</h2>
          <ul className="space-y-2">
            {template.items.map((item) => (
              <li key={item.id} className="rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-white text-sm">
                {item.name ?? 'Untitled'} — {item.quantity ?? 1} {item.unit ?? 'serving'}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-white/40 text-xs">Saving changes to this meal is not yet implemented.</p>
      </main>
    </div>
  );
}
