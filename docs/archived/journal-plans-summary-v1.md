# Archived: pre-Phase-2 `/journal/plans` summary dashboard

**Status**: archived — replaced by the Plans workbench (Phase 2).

The pre-Phase-2 `pages/journal/plans.tsx` rendered a read-only summary
dashboard (today's structure, current protocol teaser, week activity beads,
saved meals, today's progress, next-step CTA). In Phase 2, `/journal/plans`
became the execution workbench (week view + day view + AI generation);
summary responsibilities were folded into `/journal/home` where they
belong.

Sections folded into `/journal/home`:

- **Saved Meals rotation** → `components/journal/plans` is *not* the home
  for this; the equivalent "Saved Meals" preview now lives on Home via a
  small preview card. Full editing still goes through `/journal/meals`.
- **Today's Progress (macros)** → Home already shows a compact
  calorie+macros summary in its snapshot/patterns modules; no new macro
  rings were added in Phase 2. Users get detailed progress in
  `/journal/insights`.

Sections *not* carried forward:

- **Today's Structure** — replaced by per-day slots in the Plans day view.
- **Current Protocol** — program teasers move under `/programs` and
  program-driven guidance will feed into Plans via the
  `program_plan_guidance` table in later phases.
- **This Week activity beads** — duplicated on Home already (ActivityBeads
  in `pages/journal/home.tsx`).
- **Next Step** — Home's snapshot module covers this.

The original source is preserved verbatim below for reference. It is not
compiled.

---

```tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { JournalFooterNav } from '@/components/journal/JournalFooterNav';
import {
  journalService,
  toDateKey,
  calculateDailyTotals,
  type JournalEntry,
  type UserGoals,
  type MealTemplate,
  type DailyTotals,
} from '@/lib/journal';

interface DayActivity {
  date: Date;
  dateKey: string;
  entryCount: number;
  active: boolean;
  isToday: boolean;
}

function formatTodayLabel(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

function last7Days(): Date[] {
  const days: Date[] = [];
  const now = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    days.push(d);
  }
  return days;
}

function isSameLocalDate(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function getTotalCalories(t: MealTemplate): number | null {
  let total = 0;
  let has = false;
  for (const item of t.items) {
    if (typeof item.calories === 'number') {
      total += item.calories;
      has = true;
    }
  }
  return has ? total : null;
}

// (See git history of pages/journal/plans.tsx for the full original
// components: SectionHeader, TodaysStructure, CurrentProtocol, ThisWeek,
// SavedMeals, ProgressBar, PlannedVsLogged, NextStep, and the
// JournalPlansPage default export. This file preserves the shape of the
// pre-Phase-2 dashboard for reference only.)
```
