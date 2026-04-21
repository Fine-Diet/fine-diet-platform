/**
 * Admin: Program Guidance Editor (Plans Phase 7)
 *
 * Shared editor used by both the create page (`/admin/program-guidance/new`)
 * and the edit page (`/admin/program-guidance/[id]`). Structured form
 * fields drive the `guidance_payload_json` shape directly — raw JSON
 * editing is intentionally not exposed in V1.
 *
 * Validation is mirrored server-side; UI-level checks are advisory only.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  ProgramPlanGuidance,
  ProgramPlanGuidancePayload,
  ProgramGuidanceType,
} from '@/lib/plans/types';
import {
  MEAL_SLOT_KEYS,
  MEAL_SLOT_DEFAULT_LABELS,
  PROGRAM_GUIDANCE_TYPES,
} from '@/lib/plans/types';

const NDS_SUBSCORE_KEYS = [
  'protein_10',
  'wfr_10',
  'minerals_10',
  'vitamins_10',
  'sodium_10',
  'processing_10',
] as const;

type SubscoreKey = (typeof NDS_SUBSCORE_KEYS)[number];

export interface GuidanceFormValues {
  person_id: string;
  program_slug: string;
  program_run_id: string;
  active: boolean;
  effective_from: string;
  effective_until: string;
  priority: number;
  guidance_type: ProgramGuidanceType | '';
  notes: string;
  payload: ProgramPlanGuidancePayload;
}

export function emptyFormValues(): GuidanceFormValues {
  return {
    person_id: '',
    program_slug: '',
    program_run_id: '',
    active: true,
    effective_from: '',
    effective_until: '',
    priority: 0,
    guidance_type: '',
    notes: '',
    payload: {
      emphasize: [],
      avoid: [],
      macro_targets: null,
      nds_targets: null,
      notes_md: null,
      schedule_override: null,
    },
  };
}

export function formValuesFromRow(row: ProgramPlanGuidance): GuidanceFormValues {
  return {
    person_id: row.person_id,
    program_slug: row.program_slug,
    program_run_id: row.program_run_id ?? '',
    active: row.active,
    effective_from: row.effective_from ?? '',
    effective_until: row.effective_until ?? '',
    priority: row.priority ?? 0,
    guidance_type: row.guidance_type ?? '',
    notes: row.notes ?? '',
    payload: row.guidance_payload_json,
  };
}

// ---- tiny helpers ---------------------------------------------------------

function textareaToLines(v: string): string[] {
  return v
    .split('\n')
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
}

function linesToTextarea(v: string[] | null | undefined): string {
  return (v ?? []).join('\n');
}

function numberOrNull(v: string): number | null {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// ---- subcomponents --------------------------------------------------------

function Section({
  title,
  children,
  description,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 mb-5">
      <h3 className="text-base font-semibold text-gray-900 mb-1">{title}</h3>
      {description && (
        <p className="text-xs text-gray-500 mb-4">{description}</p>
      )}
      {children}
    </div>
  );
}

// ---- main component -------------------------------------------------------

interface GuidanceEditorProps {
  value: GuidanceFormValues;
  onChange: (next: GuidanceFormValues) => void;
  onSubmit: () => void;
  onCancel?: () => void;
  saving?: boolean;
  submitLabel?: string;
  error?: string | null;
  disabledPersonId?: boolean;
}

interface PersonSuggestion {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
}

export default function GuidanceEditor({
  value,
  onChange,
  onSubmit,
  onCancel,
  saving = false,
  submitLabel = 'Save guidance',
  error = null,
  disabledPersonId = false,
}: GuidanceEditorProps) {
  const [personQuery, setPersonQuery] = useState('');
  const [personResults, setPersonResults] = useState<PersonSuggestion[]>([]);
  const [personSearching, setPersonSearching] = useState(false);
  const [preview, setPreview] = useState<string>('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const update = useCallback(
    (patch: Partial<GuidanceFormValues>) => {
      onChange({ ...value, ...patch });
    },
    [value, onChange],
  );

  const updatePayload = useCallback(
    (patch: Partial<ProgramPlanGuidancePayload>) => {
      onChange({ ...value, payload: { ...value.payload, ...patch } });
    },
    [value, onChange],
  );

  // Person search (debounced)
  useEffect(() => {
    if (disabledPersonId) return;
    const q = personQuery.trim();
    if (q.length < 2) {
      setPersonResults([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setPersonSearching(true);
      try {
        const resp = await fetch(
          `/api/admin/people-search?q=${encodeURIComponent(q)}&limit=8`,
          { signal: ctrl.signal },
        );
        if (resp.ok) {
          const data = (await resp.json()) as { people: PersonSuggestion[] };
          setPersonResults(data.people ?? []);
        }
      } catch {
        /* aborted */
      } finally {
        setPersonSearching(false);
      }
    }, 200);
    return () => {
      ctrl.abort();
      clearTimeout(t);
    };
  }, [personQuery, disabledPersonId]);

  // Payload preview (debounced)
  const payloadKey = useMemo(
    () => JSON.stringify(value.payload),
    [value.payload],
  );
  useEffect(() => {
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setPreviewLoading(true);
      setPreviewError(null);
      try {
        const resp = await fetch('/api/admin/program-guidance/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ guidance_payload_json: value.payload }),
          signal: ctrl.signal,
        });
        const data = await resp.json();
        if (!resp.ok) {
          setPreview('');
          setPreviewError(data?.error ?? 'Invalid payload.');
        } else {
          setPreview(data.summary ?? '');
        }
      } catch {
        /* aborted */
      } finally {
        setPreviewLoading(false);
      }
    }, 300);
    return () => {
      ctrl.abort();
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payloadKey]);

  // --- Schedule override helpers ---
  const schedule = value.payload.schedule_override;
  const requireSlots = schedule?.require_slots ?? [];
  const disallowSlots = schedule?.disallow_slots ?? [];

  const toggleSlot = (
    kind: 'require_slots' | 'disallow_slots',
    slotKey: string,
  ) => {
    const current = (schedule?.[kind] ?? []) as string[];
    const next = current.includes(slotKey)
      ? current.filter((s) => s !== slotKey)
      : [...current, slotKey];
    updatePayload({
      schedule_override: {
        require_slots: kind === 'require_slots' ? (next as never) : (requireSlots as never),
        disallow_slots:
          kind === 'disallow_slots' ? (next as never) : (disallowSlots as never),
        constraints: schedule?.constraints ?? null,
        rationale_md: schedule?.rationale_md ?? null,
      },
    });
  };

  const setConstraint = (
    key: 'no_earlier_than' | 'no_later_than' | 'min_gap_minutes' | 'max_eating_window_minutes',
    v: string,
  ) => {
    const nextConstraints = { ...(schedule?.constraints ?? {}) } as Record<
      string,
      string | number | undefined
    >;
    if (v === '') {
      delete nextConstraints[key];
    } else if (key === 'min_gap_minutes' || key === 'max_eating_window_minutes') {
      const n = Number(v);
      if (!Number.isFinite(n)) return;
      nextConstraints[key] = n;
    } else {
      nextConstraints[key] = v;
    }
    updatePayload({
      schedule_override: {
        require_slots: requireSlots as never,
        disallow_slots: disallowSlots as never,
        constraints:
          Object.keys(nextConstraints).length > 0
            ? (nextConstraints as never)
            : null,
        rationale_md: schedule?.rationale_md ?? null,
      },
    });
  };

  const clearSchedule = () => updatePayload({ schedule_override: null });

  const hasScheduleOverride = !!schedule;

  // --- Macro helpers ---
  const macros = value.payload.macro_targets;
  const setMacro = (key: 'protein_g' | 'carbs_g' | 'fat_g', v: string) => {
    const n = numberOrNull(v);
    const base = macros ?? { protein_g: 0, carbs_g: 0, fat_g: 0 };
    if (n == null && v === '') {
      // If all empty, clear entirely
      const next = { ...base, [key]: 0 };
      const allZero =
        (next.protein_g ?? 0) === 0 &&
        (next.carbs_g ?? 0) === 0 &&
        (next.fat_g ?? 0) === 0;
      updatePayload({ macro_targets: allZero ? null : next });
      return;
    }
    updatePayload({ macro_targets: { ...base, [key]: n ?? 0 } });
  };

  // --- NDS helpers ---
  const nds = value.payload.nds_targets;
  const setNdsMin = (v: string) => {
    const n = numberOrNull(v);
    const base = nds ?? { nds_score_100_min: null, subscore_floors_10: null };
    updatePayload({ nds_targets: { ...base, nds_score_100_min: n } });
  };
  const setSubscoreFloor = (k: SubscoreKey, v: string) => {
    const n = numberOrNull(v);
    const base = nds ?? { nds_score_100_min: null, subscore_floors_10: null };
    const floors = { ...(base.subscore_floors_10 ?? {}) } as Record<
      string,
      number | undefined
    >;
    if (n == null) {
      delete floors[k];
    } else {
      floors[k] = n;
    }
    const nextFloors = Object.keys(floors).length > 0 ? (floors as never) : null;
    updatePayload({ nds_targets: { ...base, subscore_floors_10: nextFloors } });
  };

  return (
    <div className="max-w-4xl">
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-800">
          {error}
        </div>
      )}

      <Section
        title="Scope"
        description="Which person and program this guidance applies to."
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Person
            </label>
            {disabledPersonId ? (
              <input
                type="text"
                value={value.person_id}
                readOnly
                className="w-full px-3 py-2 border border-gray-200 bg-gray-50 text-gray-700 rounded text-sm"
              />
            ) : (
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search by email or name…"
                  value={personQuery || value.person_id}
                  onChange={(e) => {
                    setPersonQuery(e.target.value);
                    update({ person_id: '' });
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
                {personSearching && (
                  <div className="absolute right-2 top-2 text-xs text-gray-400">
                    Searching…
                  </div>
                )}
                {personResults.length > 0 && !value.person_id && (
                  <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded shadow-lg max-h-56 overflow-auto">
                    {personResults.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => {
                          update({ person_id: p.id });
                          setPersonQuery(p.email);
                          setPersonResults([]);
                        }}
                        className="block w-full text-left px-3 py-2 text-sm hover:bg-blue-50"
                      >
                        <div className="font-medium text-gray-900">
                          {p.email}
                        </div>
                        {(p.first_name || p.last_name) && (
                          <div className="text-xs text-gray-500">
                            {[p.first_name, p.last_name]
                              .filter(Boolean)
                              .join(' ')}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
                {value.person_id && (
                  <p className="mt-1 text-xs text-gray-500">
                    Selected id: <code>{value.person_id}</code>
                  </p>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Program slug
            </label>
            <input
              type="text"
              value={value.program_slug}
              onChange={(e) => update({ program_slug: e.target.value })}
              placeholder="e.g. gut-check-reset"
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Program run id (optional)
            </label>
            <input
              type="text"
              value={value.program_run_id}
              onChange={(e) => update({ program_run_id: e.target.value })}
              placeholder="UUID or blank"
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Guidance type
            </label>
            <select
              value={value.guidance_type}
              onChange={(e) =>
                update({
                  guidance_type: (e.target.value || '') as
                    | ProgramGuidanceType
                    | '',
                })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm bg-white"
            >
              <option value="">— unspecified —</option>
              {PROGRAM_GUIDANCE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Section>

      <Section
        title="Lifecycle"
        description="Active state, effective dates, and merge priority."
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2 flex items-center gap-2">
            <input
              id="active"
              type="checkbox"
              checked={value.active}
              onChange={(e) => update({ active: e.target.checked })}
              className="h-4 w-4"
            />
            <label htmlFor="active" className="text-sm text-gray-700">
              Active (Plans will consume this row when inside the effective
              window)
            </label>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Effective from
            </label>
            <input
              type="date"
              value={value.effective_from.slice(0, 10)}
              onChange={(e) => update({ effective_from: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Effective until
            </label>
            <input
              type="date"
              value={value.effective_until.slice(0, 10)}
              onChange={(e) => update({ effective_until: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Priority
            </label>
            <input
              type="number"
              value={value.priority}
              onChange={(e) =>
                update({ priority: Number(e.target.value) || 0 })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
            />
            <p className="mt-1 text-xs text-gray-500">
              Higher wins in future merge passes. Plans consumer defers today.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Internal notes
            </label>
            <input
              type="text"
              value={value.notes}
              onChange={(e) => update({ notes: e.target.value })}
              placeholder="Staff-only note (not shown to end users)"
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
            />
          </div>
        </div>
      </Section>

      <Section
        title="Emphasize & avoid"
        description="Food names, tags, or food_object ids — one per line."
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Emphasize
            </label>
            <textarea
              rows={6}
              value={linesToTextarea(value.payload.emphasize)}
              onChange={(e) =>
                updatePayload({ emphasize: textareaToLines(e.target.value) })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder={'salmon\nleafy greens\nlentils'}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Avoid
            </label>
            <textarea
              rows={6}
              value={linesToTextarea(value.payload.avoid)}
              onChange={(e) =>
                updatePayload({ avoid: textareaToLines(e.target.value) })
              }
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder={'ultra_processed\nadded_sugar\nalcohol'}
            />
          </div>
        </div>
      </Section>

      <Section
        title="Macro targets"
        description="Daily totals. Leave blank to clear."
      >
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Protein (g)
            </label>
            <input
              type="number"
              value={macros?.protein_g ?? ''}
              onChange={(e) => setMacro('protein_g', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Carbs (g)
            </label>
            <input
              type="number"
              value={macros?.carbs_g ?? ''}
              onChange={(e) => setMacro('carbs_g', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Fat (g)
            </label>
            <input
              type="number"
              value={macros?.fat_g ?? ''}
              onChange={(e) => setMacro('fat_g', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
            />
          </div>
        </div>
      </Section>

      <Section
        title="NDS targets"
        description="Minimum daily NDS score and subscore floors (0–10)."
      >
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Minimum NDS score (0–100)
          </label>
          <input
            type="number"
            value={nds?.nds_score_100_min ?? ''}
            onChange={(e) => setNdsMin(e.target.value)}
            className="w-full md:w-64 px-3 py-2 border border-gray-300 rounded text-sm"
          />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {NDS_SUBSCORE_KEYS.map((k) => (
            <div key={k}>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {k.replace(/_10$/, '')} floor
              </label>
              <input
                type="number"
                min={0}
                max={10}
                step={0.1}
                value={
                  (nds?.subscore_floors_10 as
                    | Record<string, number | undefined>
                    | null
                    | undefined)?.[k] ?? ''
                }
                onChange={(e) => setSubscoreFloor(k, e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
              />
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Schedule override"
        description="Require or disallow slots and apply time constraints. Programs never set concrete clock times."
      >
        <div className="mb-3 flex items-center gap-2">
          <input
            id="has-schedule"
            type="checkbox"
            checked={hasScheduleOverride}
            onChange={(e) =>
              e.target.checked
                ? updatePayload({
                    schedule_override: {
                      require_slots: [],
                      disallow_slots: [],
                      constraints: null,
                      rationale_md: null,
                    },
                  })
                : clearSchedule()
            }
            className="h-4 w-4"
          />
          <label htmlFor="has-schedule" className="text-sm text-gray-700">
            Include schedule override
          </label>
        </div>

        {hasScheduleOverride && schedule && (
          <div className="space-y-4">
            <div>
              <div className="text-sm font-medium text-gray-700 mb-1">
                Require slots
              </div>
              <div className="flex flex-wrap gap-2">
                {MEAL_SLOT_KEYS.map((slot) => {
                  const checked = requireSlots.includes(slot);
                  return (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => toggleSlot('require_slots', slot)}
                      className={`px-3 py-1 rounded-full text-xs border ${
                        checked
                          ? 'bg-green-100 border-green-300 text-green-800'
                          : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {MEAL_SLOT_DEFAULT_LABELS[slot]}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="text-sm font-medium text-gray-700 mb-1">
                Disallow slots
              </div>
              <div className="flex flex-wrap gap-2">
                {MEAL_SLOT_KEYS.map((slot) => {
                  const checked = disallowSlots.includes(slot);
                  return (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => toggleSlot('disallow_slots', slot)}
                      className={`px-3 py-1 rounded-full text-xs border ${
                        checked
                          ? 'bg-red-100 border-red-300 text-red-800'
                          : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {MEAL_SLOT_DEFAULT_LABELS[slot]}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  No earlier than (HH:mm)
                </label>
                <input
                  type="time"
                  value={schedule.constraints?.no_earlier_than ?? ''}
                  onChange={(e) => setConstraint('no_earlier_than', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  No later than (HH:mm)
                </label>
                <input
                  type="time"
                  value={schedule.constraints?.no_later_than ?? ''}
                  onChange={(e) => setConstraint('no_later_than', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Min gap (min)
                </label>
                <input
                  type="number"
                  min={0}
                  value={schedule.constraints?.min_gap_minutes ?? ''}
                  onChange={(e) => setConstraint('min_gap_minutes', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Max window (min)
                </label>
                <input
                  type="number"
                  min={0}
                  value={schedule.constraints?.max_eating_window_minutes ?? ''}
                  onChange={(e) =>
                    setConstraint('max_eating_window_minutes', e.target.value)
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Rationale (markdown, user-facing)
              </label>
              <textarea
                rows={3}
                value={schedule.rationale_md ?? ''}
                onChange={(e) =>
                  updatePayload({
                    schedule_override: {
                      require_slots: requireSlots as never,
                      disallow_slots: disallowSlots as never,
                      constraints: schedule.constraints ?? null,
                      rationale_md: e.target.value || null,
                    },
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
              />
            </div>
          </div>
        )}
      </Section>

      <Section
        title="Rationale / notes (user-facing)"
        description="Optional markdown surfaced to users alongside the guidance."
      >
        <textarea
          rows={4}
          value={value.payload.notes_md ?? ''}
          onChange={(e) => updatePayload({ notes_md: e.target.value || null })}
          className="w-full px-3 py-2 border border-gray-300 rounded text-sm"
        />
      </Section>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-5">
        <div className="text-xs font-medium text-blue-900 mb-1">
          Preview {previewLoading && <span className="text-blue-500">· updating…</span>}
        </div>
        {previewError ? (
          <div className="text-sm text-red-700">{previewError}</div>
        ) : (
          <div className="text-sm text-blue-900">
            {preview || 'No preview yet.'}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onSubmit}
          disabled={saving}
          className="px-5 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Saving…' : submitLabel}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded text-sm hover:bg-gray-50"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
