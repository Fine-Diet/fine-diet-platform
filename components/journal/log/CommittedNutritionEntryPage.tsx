'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';

import LegacyJournalEntryPage from '@/pages/journal/entry/[id]';
import { getSafeRedirectTarget } from '@/lib/redirectHelpers';
import { journalService, type JournalEntry } from '@/lib/journal';
import {
  defaultMealSchedule,
  normalizeMealSchedule,
} from '@/lib/plans/scheduleResolver';
import type { MealSchedule } from '@/lib/plans/types';
import { APP_ROUTES } from '@/lib/routes/appRoutes';

import { CommittedNutritionEditor } from './CommittedNutritionEditor';

export default function CommittedNutritionEntryPage() {
  const router = useRouter();
  const id = typeof router.query.id === 'string' ? router.query.id : null;
  const redirect = getSafeRedirectTarget(
    typeof router.query.redirect === 'string' ? router.query.redirect : null,
    APP_ROUTES.log,
  );
  const [entry, setEntry] = useState<JournalEntry | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [mealSchedule, setMealSchedule] = useState<MealSchedule>(
    defaultMealSchedule(),
  );

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    void journalService.getEntry(id).then((result) => {
      if (cancelled) return;
      if (!result) setNotFound(true);
      else setEntry(result);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    void fetch('/api/journal/profile')
      .then((response) => response.json())
      .then((body) => setMealSchedule(normalizeMealSchedule(body.profile?.meal_schedule)))
      .catch(() => setMealSchedule(defaultMealSchedule()));
  }, []);

  // Packet 15 changes only committed nutrition. Every non-food editor remains
  // reachable through the established legacy route and behavior.
  if (entry && entry.type !== 'intake') return <LegacyJournalEntryPage />;

  if (notFound) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#181711] text-white">
        Entry not found.
      </div>
    );
  }
  if (!entry) return null;

  return (
    <CommittedNutritionEditor
      key={`${entry.id}:${entry.updated_at.getTime()}`}
      entry={entry}
      mealSchedule={mealSchedule}
      presentation="page"
      onClose={() => void router.push(redirect)}
      onSaved={setEntry}
      onDeleted={() => void router.push(redirect)}
    />
  );
}
