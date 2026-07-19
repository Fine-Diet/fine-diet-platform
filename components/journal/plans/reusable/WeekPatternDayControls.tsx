'use client';

import { useEffect, useMemo, useState } from 'react';

import { planService, type PlanDayTemplate } from '@/lib/plans';
import {
  cloneTemplateSlotsForPatternSnapshot,
  cloneTemplateMealForSnapshot,
  duplicatePatternDaySnapshot,
} from '@/lib/plans/reusableAuthoringHelpers';
import type { PlanWeekPattern, PlanWeekPatternDay } from '@/lib/plans/types';

interface WeekPatternDayControlsProps {
  pattern: PlanWeekPattern;
  dayIndex: number;
  busy?: boolean;
  onReplaceDay: (nextDay: PlanWeekPatternDay) => void;
}

function blankPatternDayFromSlots(
  dayOffset: number,
  slots: PlanWeekPatternDay['slots'],
  existing?: PlanWeekPatternDay,
): PlanWeekPatternDay {
  return {
    day_offset: dayOffset,
    source_plan_day_id: existing?.source_plan_day_id ?? crypto.randomUUID(),
    source_date_local: existing?.source_date_local ?? `Day ${dayOffset + 1}`,
    source_day_template_id: null,
    slots: cloneTemplateSlotsForPatternSnapshot(
      slots.map((slot) => ({ ...slot, meals: [] })),
    ),
    unassigned_meals: [],
  };
}

export function WeekPatternDayControls({
  pattern,
  dayIndex,
  busy = false,
  onReplaceDay,
}: WeekPatternDayControlsProps) {
  const patternDays = pattern.days ?? [];
  const day = patternDays[dayIndex];
  const [templates, setTemplates] = useState<PlanDayTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [duplicateFromIndex, setDuplicateFromIndex] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoadingTemplates(true);
    planService
      .listPlanDayTemplates()
      .then((rows) => {
        if (!cancelled) setTemplates(rows);
      })
      .catch(() => {
        if (!cancelled) setTemplates([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingTemplates(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const sortedTemplates = useMemo(
    () => templates.slice().sort((a, b) => a.name.localeCompare(b.name)),
    [templates],
  );

  const duplicateOptions = useMemo(
    () =>
      patternDays
        .map((candidate, index) => ({ candidate, index }))
        .filter(({ index }) => index !== dayIndex),
    [dayIndex, patternDays],
  );

  if (!day) return null;

  function applyDayTemplate(template: PlanDayTemplate) {
    onReplaceDay({
      day_offset: day!.day_offset,
      source_plan_day_id: day!.source_plan_day_id,
      source_date_local: day!.source_date_local,
      source_day_template_id: template.id,
      slots: cloneTemplateSlotsForPatternSnapshot(template.slots ?? []),
      unassigned_meals: (template.unassigned_meals ?? []).map(cloneTemplateMealForSnapshot),
    });
  }

  function handleChooseTemplate() {
    const template = sortedTemplates.find((row) => row.id === selectedTemplateId);
    if (!template) return;
    applyDayTemplate(template);
  }

  function handleBlankDay() {
    const referenceSlots =
      patternDays.find((candidate) => (candidate.slots ?? []).length > 0)?.slots ??
      day!.slots ??
      [];
    onReplaceDay(blankPatternDayFromSlots(day!.day_offset, referenceSlots, day));
  }

  function handleDuplicateDay() {
    const fromIndex = Number(duplicateFromIndex);
    const sourceDay = patternDays[fromIndex];
    if (!sourceDay || !Number.isInteger(fromIndex)) return;
    onReplaceDay(duplicatePatternDaySnapshot(sourceDay, day!.day_offset, day));
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-4">
      <p className="text-[11px] uppercase tracking-wider text-white/40">Compose this day</p>

      <div className="space-y-2">
        <p className="text-xs text-white/70">Choose or replace day template</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <select
            value={selectedTemplateId}
            onChange={(event) => setSelectedTemplateId(event.target.value)}
            disabled={busy || loadingTemplates}
            className="flex-1 rounded-xl bg-white/[0.06] border border-white/10 text-sm text-white px-3 py-2"
          >
            <option value="">
              {loadingTemplates ? 'Loading templates…' : 'Select a day template'}
            </option>
            {sortedTemplates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={busy || !selectedTemplateId}
            onClick={handleChooseTemplate}
            className="rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-white/85 disabled:opacity-40"
          >
            Apply template
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={handleBlankDay}
          className="rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-white/85 disabled:opacity-40"
        >
          Blank day
        </button>
      </div>

      {duplicateOptions.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs text-white/70">Duplicate another pattern day</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <select
              value={duplicateFromIndex}
              onChange={(event) => setDuplicateFromIndex(event.target.value)}
              disabled={busy}
              className="flex-1 rounded-xl bg-white/[0.06] border border-white/10 text-sm text-white px-3 py-2"
            >
              <option value="">Select a day</option>
              {duplicateOptions.map(({ candidate, index }) => (
                <option key={candidate.source_plan_day_id} value={String(index)}>
                  Day {index + 1} · {candidate.source_date_local}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={busy || duplicateFromIndex === ''}
              onClick={handleDuplicateDay}
              className="rounded-full border border-white/15 px-4 py-2 text-xs font-semibold text-white/85 disabled:opacity-40"
            >
              Duplicate day
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
