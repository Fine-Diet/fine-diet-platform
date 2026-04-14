'use client';

import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getSafeRedirectTarget } from '@/lib/redirectHelpers';
import {
  journalService,
  formatTime,
  setTimeOnDate,
  type JournalEntry,
  type JournalEntryType,
} from '@/lib/journal';
import { formatFoodNameString, foodService, type FoodObject, type FoodNutrients } from '@/lib/food';
import { getValidUnits, convertBetweenUnits, type Measure } from '@/lib/units/convert';
import {
  WaterForm,
  SupplementForm,
  MoodForm,
  BowelForm,
  CycleForm,
  MovementForm,
  BloodPressureForm,
  getTabLabel,
} from '@/components/journal/LogEntryForms';
import { ENTRY_TYPE_TO_TAB } from '@/components/journal/LogEntryForms';

/** Micronutrient display config: label, key on food.nutrients, unit suffix */
const MICRO_FIELDS: { label: string; key: keyof FoodNutrients; unit: string }[] = [
  { label: 'Potassium', key: 'potassiumMg', unit: 'mg' },
  { label: 'Magnesium', key: 'magnesiumMg', unit: 'mg' },
  { label: 'Iron', key: 'ironMg', unit: 'mg' },
  { label: 'Calcium', key: 'calciumMg', unit: 'mg' },
  { label: 'Zinc', key: 'zincMg', unit: 'mg' },
  { label: 'Folate', key: 'folateUg', unit: 'µg' },
  { label: 'Vitamin A', key: 'vitaminAUgRae', unit: 'µg RAE' },
  { label: 'Vitamin C', key: 'vitaminCmg', unit: 'mg' },
  { label: 'Vitamin D', key: 'vitaminDug', unit: 'µg' },
  { label: 'Vitamin B12', key: 'vitaminB12Ug', unit: 'µg' },
];

export default function JournalEntryPage() {
  const router = useRouter();
  const rawId = router.query?.id;
  const id = typeof rawId === 'string' ? rawId : undefined;
  const rawRedirect = router.query?.redirect;
  const redirectTarget = getSafeRedirectTarget(
    typeof rawRedirect === 'string' ? rawRedirect : null,
    '/journal'
  );

  const [entry, setEntry] = useState<JournalEntry | null>(null);
  const [food, setFood] = useState<FoodObject | null>(null);
  const [quantity, setQuantity] = useState<string>('');
  const [unit, setUnit] = useState<string>('');
  const [timeStr, setTimeStr] = useState<string>('');
  const [savedFeedback, setSavedFeedback] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [nonIntakeSaving, setNonIntakeSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const e = await journalService.getEntry(id);
      if (!e) {
        setNotFound(true);
        return;
      }
      setEntry(e);
      setTimeStr(formatTime(e.timestamp));
      if (e.type === 'intake') {
        const p = e.payload as { unit?: string; quantity?: number };
        const entryUnit = p.unit ?? 'serving';
        setUnit(entryUnit);
        if (entryUnit === 'g' && e.quantityG != null) {
          setQuantity(String(Math.round(e.quantityG * 100) / 100));
        } else {
          setQuantity(String(p.quantity ?? 1));
        }
      }
    })();
  }, [id]);

  const intakeFoodId = entry?.type === 'intake' ? (entry.payload as { foodObjectId?: string }).foodObjectId : undefined;
  useEffect(() => {
    if (!intakeFoodId) {
      setFood(null);
      return;
    }
    (async () => {
      const f = await foodService.getById(intakeFoodId);
      setFood(f ?? null);
    })();
  }, [intakeFoodId]);

  // Resolve valid units from the food object's servingSizeG + measures (intake only)
  const intakePayload = entry?.type === 'intake' ? (entry.payload as { servingSizeG?: number; measures?: Measure[] }) : null;
  const servingSizeG = food?.servingSizeG ?? intakePayload?.servingSizeG ?? null;
  const measures: Measure[] | null = food?.measures ?? intakePayload?.measures ?? null;
  const validUnits = getValidUnits(servingSizeG, measures);
  const hasConversion = validUnits.length > 1;

  // Re-derive display quantity for measure units once food (with measures) loads
  useEffect(() => {
    if (!entry || entry.type !== 'intake' || !measures) return;
    const p = entry.payload as { unit?: string };
    const entryUnit = p.unit ?? 'serving';
    if (entryUnit !== 'g' && entryUnit !== 'serving' && entry.quantityG != null) {
      const m = measures.find((m) => m.unit.toLowerCase() === entryUnit.toLowerCase());
      if (m && m.grams > 0) {
        setQuantity(String(Math.round((entry.quantityG / m.grams) * 100) / 100));
      }
    }
  }, [measures, entry]);

  const applyUpdates = async (updates: Partial<{ quantity: string; unit: string; timeStr: string }>) => {
    if (!entry) return;
    const q = updates.quantity ?? quantity;
    const u = updates.unit ?? unit;
    const t = updates.timeStr ?? timeStr;
    const qNum = parseFloat(q);
    const newTimestamp = setTimeOnDate(new Date(entry.timestamp), t);

    if (u === 'g' && !isNaN(qNum) && qNum > 0) {
      // Gram mode: send quantityG so server recomputes payload.quantity
      await journalService.updateEntry(entry.id, {
        payload: { ...entry.payload, unit: 'g' },
        quantityG: qNum,
        timestamp: newTimestamp,
      });
    } else {
      // Serving mode, measure unit mode, or other: send payload.quantity + unit
      // Server resolves measures from the food object for measure unit modes.
      await journalService.updateEntry(entry.id, {
        payload: {
          ...entry.payload,
          quantity: isNaN(qNum) ? undefined : qNum,
          unit: u || undefined,
        },
        timestamp: newTimestamp,
      });
    }

    const updated = await journalService.getEntry(entry.id);
    if (updated) setEntry(updated);
    const up = updated?.payload as { unit?: string; quantity?: number } | undefined;
    const updatedUnit = up?.unit ?? 'serving';
    setUnit(updatedUnit);
    // For measure units, display the value in that unit (derived from quantityG)
    if (updatedUnit === 'g' && updated?.quantityG != null) {
      setQuantity(String(Math.round(updated.quantityG * 100) / 100));
    } else if (updatedUnit !== 'serving' && updatedUnit !== 'g' && updated?.quantityG != null && measures) {
      // Measure unit: convert quantityG back to measure value for display
      const m = measures.find((m) => m.unit.toLowerCase() === updatedUnit.toLowerCase());
      if (m && m.grams > 0) {
        setQuantity(String(Math.round((updated.quantityG / m.grams) * 100) / 100));
      } else {
        setQuantity(String(up?.quantity ?? 1));
      }
    } else {
      setQuantity(String(up?.quantity ?? 1));
    }
    setTimeStr(formatTime(updated?.timestamp ?? new Date()));
    setSavedFeedback(true);
    setTimeout(() => setSavedFeedback(false), 1500);
  };

  const handleQuantityBlur = () => {
    if (!entry) return;
    applyUpdates({ quantity, unit, timeStr });
  };

  const handleUnitChange = (newUnit: string) => {
    if (!entry) return;

    const currentValue = parseFloat(quantity) || 1;
    const converted = convertBetweenUnits(currentValue, unit, newUnit, servingSizeG, measures);
    const newQty = converted !== null && converted > 0
      ? String(Math.round(converted * 100) / 100)
      : quantity;

    setQuantity(newQty);
    setUnit(newUnit);
    // Call applyUpdates directly with the computed values
    applyUpdates({ quantity: newQty, unit: newUnit, timeStr });
  };

  const handleTimeChange = (t: string) => {
    setTimeStr(t);
    if (entry) applyUpdates({ quantity, unit, timeStr: t });
  };

  const handleDelete = async () => {
    if (!entry) return;
    await journalService.deleteEntry(entry.id);
    window.location.href = redirectTarget;
  };

  const handleNonIntakeSave = async (payload: Record<string, unknown>) => {
    if (!entry) return;
    setNonIntakeSaving(true);
    try {
      const newTimestamp = setTimeOnDate(new Date(entry.timestamp), timeStr);
      const updated = await journalService.updateEntry(entry.id, {
        payload: { ...entry.payload, ...payload } as Record<string, unknown>,
        timestamp: newTimestamp,
      });
      if (updated) {
        setEntry(updated);
        setTimeStr(formatTime(updated.timestamp));
        setSavedFeedback(true);
        setTimeout(() => setSavedFeedback(false), 1500);
      }
    } finally {
      setNonIntakeSaving(false);
    }
  };

  const handleNonIntakeTimeChange = (t: string) => {
    setTimeStr(t);
    if (entry && entry.type !== 'intake') {
      const newTimestamp = setTimeOnDate(new Date(entry.timestamp), t);
      journalService.updateEntry(entry.id, { timestamp: newTimestamp }).then((updated) => {
        if (updated) setEntry(updated);
      });
    }
  };

  if (notFound || (!entry && id)) {
    return (
      <div className="min-h-screen bg-brand-900 text-white flex flex-col items-center justify-center px-6">
        <p className="text-white/80 mb-4">Entry not found.</p>
        <Link href={redirectTarget} className="text-denim-300 hover:underline">
          Go back
        </Link>
      </div>
    );
  }

  if (!entry) return null;

  const entryType = entry.type as JournalEntryType;
  const typeLabel = getTabLabel(ENTRY_TYPE_TO_TAB[entryType] ?? entryType);

  if (entry.type !== 'intake') {
    const payload = entry.payload as Record<string, unknown>;
    return (
      <div className="min-h-screen bg-brand-900 text-white max-w-[650px] mx-auto relative flex flex-col">
        <header className="sticky top-0 z-20 flex items-center gap-4 px-4 py-4 bg-brand-900/95 backdrop-blur">
          <Link
            href={redirectTarget}
            className="p-2 -ml-2 text-brand-50 hover:text-white transition-colors"
            aria-label="Back"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <h1 className="text-lg font-semibold text-brand-50 truncate">
            Edit {typeLabel}
          </h1>
          {savedFeedback && (
            <span className="ml-auto text-sm text-denim-300">Saved</span>
          )}
        </header>

        <main className="flex-1 min-w-0 px-4 py-6 space-y-6 overflow-x-hidden">
          <div className="min-w-0">
            <label className="block text-brand-50 text-xl font-semibold mb-1">Time</label>
            <input
              type="time"
              value={timeStr}
              onChange={(e) => handleNonIntakeTimeChange(e.target.value)}
              className="w-full min-w-0 max-w-full rounded-full bg-white/10 px-4 py-2.5 text-brand-50 text-sm focus:outline-none focus:ring-2 focus:ring-white/30 time-input-light-icon box-border"
            />
          </div>

          <div key={entry.updated_at?.toISOString() ?? entry.id}>
            {entry.type === 'water' && (
              <WaterForm
                onSubmit={handleNonIntakeSave}
                isSubmitting={nonIntakeSaving}
                initialValues={payload}
                submitLabel="Save"
              />
            )}
            {entry.type === 'supplement' && (
              <SupplementForm
                onSubmit={handleNonIntakeSave}
                isSubmitting={nonIntakeSaving}
                initialValues={payload}
                submitLabel="Save"
              />
            )}
            {entry.type === 'mood' && (
              <MoodForm
                onSubmit={handleNonIntakeSave}
                isSubmitting={nonIntakeSaving}
                initialValues={payload}
                submitLabel="Save"
              />
            )}
            {entry.type === 'bowel' && (
              <BowelForm
                onSubmit={handleNonIntakeSave}
                isSubmitting={nonIntakeSaving}
                initialValues={payload}
                submitLabel="Save"
              />
            )}
            {entry.type === 'cycle' && (
              <CycleForm
                onSubmit={handleNonIntakeSave}
                isSubmitting={nonIntakeSaving}
                initialValues={payload}
                submitLabel="Save"
              />
            )}
            {entry.type === 'movement' && (
              <MovementForm
                onSubmit={handleNonIntakeSave}
                isSubmitting={nonIntakeSaving}
                initialValues={payload}
                submitLabel="Save"
              />
            )}
            {entry.type === 'blood_pressure' && (
              <BloodPressureForm
                onSubmit={handleNonIntakeSave}
                isSubmitting={nonIntakeSaving}
                initialValues={payload}
                submitLabel="Save"
              />
            )}
          </div>

          <div className="pt-4">
            <button
              type="button"
              onClick={handleDelete}
              className="px-4 py-2 rounded-lg border-2 border-semantic-error/60 text-semantic-error text-sm font-semibold hover:bg-semantic-error/10 transition-colors"
            >
              Delete
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-900 text-white max-w-[650px] mx-auto relative flex flex-col">
      <header className="sticky top-0 z-20 flex items-center gap-4 px-4 py-4 bg-brand-900/95 backdrop-blur">
        <Link
          href={redirectTarget}
          className="p-2 -ml-2 text-brand-50 hover:text-white transition-colors"
          aria-label="Back"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="text-lg font-semibold text-brand-50 truncate">
          {formatFoodNameString((entry.payload as { name?: string }).name ?? 'Edit item')}
        </h1>
        {savedFeedback && (
          <span className="ml-auto text-sm text-denim-300">Saved</span>
        )}
      </header>

      <main className="flex-1 min-w-0 px-4 py-6 space-y-6 overflow-x-hidden">
        <div>
          <label className="block text-brand-50 text-xl font-semibold mb-1">Quantity</label>
          <input
            type="number"
            min={0}
            step={0.25}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            onBlur={handleQuantityBlur}
            className="w-full rounded-full bg-white/10 px-4 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-white/30"
          />
        </div>

        <div>
          <label className="block text-brand-50 text-xl font-semibold mb-1">Unit</label>
          {hasConversion ? (
            <div className="relative">
              <select
                value={unit}
                onChange={(e) => handleUnitChange(e.target.value)}
                className="w-full rounded-full bg-white/10 pl-4 pr-10 py-2.5 text-brand-50 text-sm focus:outline-none focus:ring-2 focus:ring-white/30 appearance-none"
                style={{ backgroundImage: 'none' }}
              >
                {validUnits.map((u) => (
                  <option key={u} value={u} className="bg-brand-800 text-brand-50">
                    {u}
                  </option>
                ))}
              </select>
              {/* Custom arrow — 4 units from right edge */}
              <span className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-brand-50" aria-hidden>
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </span>
            </div>
          ) : (
            <div className="w-full rounded-full bg-white/10 px-4 py-2.5 text-brand-50/70 text-sm">
              {unit || 'serving'}
            </div>
          )}
        </div>

        <div className="min-w-0">
          <label className="block text-brand-50 text-xl font-semibold mb-1">Time</label>
          <input
            type="time"
            value={timeStr}
            onChange={(e) => handleTimeChange(e.target.value)}
            onBlur={() => applyUpdates({ quantity, unit, timeStr })}
            className="w-full min-w-0 max-w-full rounded-full bg-white/10 px-4 py-2.5 text-brand-50 text-sm focus:outline-none focus:ring-2 focus:ring-white/30 time-input-light-icon box-border"
          />
          <p className="text-white/50 text-xs mt-5 px-5">
            Moving time may change which block (Morning / Midday / Evening) this appears in.
          </p>
        </div>

        {/* Read-only nutrition (per current quantity/unit) — helps users understand how to log */}
        {(() => {
          const ip = entry.payload as { calories?: number; macros?: { protein?: number; carbs?: number; fat?: number }; quantity?: number };
          return (typeof ip.calories === 'number' || ip.macros || food) && (
          <div className="rounded-xl space-y-3 border-[3px] border-brand-200/20 px-5 py-5">
            <p className="text-brand-200 text-xl font-semibold">Nutrition (for current quantity & unit)</p>

            {/* Calories — scaled by current quantity */}
            {typeof ip.calories === 'number' && (
              <p className="text-brand-200 text-base">
                <span className="font-semibold text-brand-200">{Math.round(ip.calories * (ip.quantity ?? 1))}</span>
                <span className="ml-1">kcal</span>
              </p>
            )}

            {/* Macros pill — scaled by current quantity */}
            {(ip.macros?.protein !== undefined || ip.macros?.carbs !== undefined || ip.macros?.fat !== undefined) && (() => {
              const qty = ip.quantity ?? 1;
              return (
                <div className="flex items-center rounded-full overflow-hidden text-base h-9 border border-brand-200/20">
                  <span className="flex flex-1 items-center justify-center text-brand-200 px-2 min-w-0">
                    <span className="font-semibold">Protein</span>
                    <span className="font-light ml-1">{Math.round((ip.macros?.protein ?? 0) * qty)}g</span>
                  </span>
                  <span className="w-px h-9 bg-brand-200/30 shrink-0" aria-hidden />
                  <span className="flex flex-1 items-center justify-center text-brand-200 px-2 min-w-0">
                    <span className="font-semibold">Carbs</span>
                    <span className="font-light ml-1">{Math.round((ip.macros?.carbs ?? 0) * qty)}g</span>
                  </span>
                  <span className="w-px h-9 bg-brand-200/30 shrink-0" aria-hidden />
                  <span className="flex flex-1 items-center justify-center text-brand-200 px-2 min-w-0">
                    <span className="font-semibold">Fat</span>
                    <span className="font-light ml-1">{Math.round((ip.macros?.fat ?? 0) * qty)}g</span>
                  </span>
                </div>
              );
            })()}

            {/* Fiber, sugar, sodium (from food when available, scaled by quantity) */}
            {food && (
              <div className="grid grid-cols-3 gap-x-3 gap-y-1 text-sm">
                {food.fiberG != null && (
                  <p className="text-brand-200">
                    <span className="font-semibold text-brand-200">{Math.round((food.fiberG ?? 0) * (ip.quantity ?? 1))}</span>
                    <span className="ml-0.5">g fiber</span>
                  </p>
                )}
                {food.sugarG != null && (
                  <p className="text-brand-200">
                    <span className="font-semibold text-brand-200">{Math.round((food.sugarG ?? 0) * (ip.quantity ?? 1))}</span>
                    <span className="ml-0.5">g sugar</span>
                  </p>
                )}
                {food.sodiumMg != null && (
                  <p className="text-brand-200">
                    <span className="font-semibold text-brand-200">{Math.round((food.sodiumMg ?? 0) * (ip.quantity ?? 1))}</span>
                    <span className="ml-0.5">mg sodium</span>
                  </p>
                )}
              </div>
            )}

            {/* Micronutrients (from linked food, scaled by quantity) */}
            {food?.nutrients && (() => {
              const scale = ip.quantity ?? 1;
              const hasAny = MICRO_FIELDS.some(({ key }) => food.nutrients && food.nutrients[key] != null);
              if (!hasAny) return null;
              return (
                <div className="pt-2 border-t border-brand-200/20">
                  <p className="text-brand-200/50 text-xs font-medium mb-2">Micronutrients</p>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
                    {MICRO_FIELDS.map(({ label, key, unit }) => {
                      const raw = food.nutrients?.[key];
                      if (raw == null) return null;
                      const value = Math.round(Number(raw) * scale);
                      return (
                        <div key={key} className="flex justify-between gap-2">
                          <dt className="text-brand-200/50 truncate">{label}</dt>
                          <dd className="text-brand-50 font-medium shrink-0">
                            {value} {unit}
                          </dd>
                        </div>
                      );
                    })}
                  </dl>
                </div>
              );
            })()}
          </div>
          );
        })()}

        <div className="pt-4">
          <button
            type="button"
            onClick={handleDelete}
            className="px-4 py-2 rounded-lg border-2 border-semantic-error/60 text-semantic-error text-sm font-semibold hover:bg-semantic-error/10 transition-colors"
          >
            Delete
          </button>
        </div>
      </main>
    </div>
  );
}
