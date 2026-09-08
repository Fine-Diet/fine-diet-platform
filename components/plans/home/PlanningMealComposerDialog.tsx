'use client';

import { useMemo, useState } from 'react';

import { PlanMealComposerPanel } from '@/components/journal/plans/PlanMealComposerPanel';
import { FullScreenMealComposerShell } from '@/components/meals/composer/FullScreenMealComposerShell';
import type { PlansMealGuidanceRow } from '@/lib/plans/home/types';
import { planService } from '@/lib/plans/planService';
import type { PlanSlot, PlanSlotBlock } from '@/lib/plans/types';

function formatPlanningDate(dateKey: string): string {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, day!)).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function slotBlockForTime(time: string): PlanSlotBlock {
  const hour = Number(time.split(':')[0]);
  if (Number.isFinite(hour) && hour < 11) return 'morning';
  if (Number.isFinite(hour) && hour < 17) return 'midday';
  return 'evening';
}

export function PlanningMealComposerDialog({
  row,
  selectedDate,
  onClose,
  onSaved,
}: {
  row: PlansMealGuidanceRow | null;
  selectedDate: string;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [submitting, setSubmitting] = useState(false);
  const slot = useMemo<PlanSlot | null>(() => {
    if (!row) return null;
    return {
      id: '',
      plan_day_id: '',
      person_id: '',
      slot_block: slotBlockForTime(row.targetTimeValue),
      slot_ordinal: 0,
      slot_label: row.label,
      target_time: row.targetTimeValue,
      created_at: '',
      updated_at: '',
    };
  }, [row]);

  if (!row || !slot) return null;

  return (
    <FullScreenMealComposerShell
      open
      title="Add meal"
      context={`${formatPlanningDate(selectedDate)} · ${row.label} · ${row.targetTimeLabel} ${periodLabel(row.targetTimeValue)}`}
      onClose={onClose}
      submitting={submitting}
    >
      <PlanMealComposerPanel
        mode="create"
        slot={slot}
        primaryLabel="Save"
        resolveTarget={async () => {
          const target = await planService.resolvePlansHomeTarget({
            dateLocal: selectedDate,
            slotKey: row.slotKey,
          });
          return {
            planId: target.planId,
            planDayId: target.planDayId,
            planSlotId: target.planSlotId,
          };
        }}
        onSubmittingChange={setSubmitting}
        onSaved={onSaved}
        onCancel={onClose}
      />
    </FullScreenMealComposerShell>
  );
}

function periodLabel(time: string): 'AM' | 'PM' {
  const hour = Number(time.split(':')[0]);
  return Number.isFinite(hour) && hour >= 12 ? 'PM' : 'AM';
}
