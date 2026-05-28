/**
 * Admin: Program Assignment Editor (Plans Phase 8)
 *
 * Shared editor used by create + edit pages. Fields mirror
 * ProgramAssignmentCreateSchema / ProgramAssignmentUpdateSchema.
 */

import { useCallback, useEffect, useState } from 'react';
import type {
  ProgramAcquisitionSource,
  ProgramAssignment,
  ProgramAssignmentStatus,
} from '@/lib/plans/types';
import {
  PROGRAM_ACQUISITION_SOURCES,
  PROGRAM_ASSIGNMENT_STATUSES,
} from '@/lib/plans/types';

export interface AssignmentFormValues {
  person_id: string;
  program_slug: string;
  acquisition_source: ProgramAcquisitionSource;
  status: ProgramAssignmentStatus;
  active_from: string;
  active_to: string;
  priority: number;
  source_ref: string;
  notes: string;
}

export function emptyAssignmentForm(): AssignmentFormValues {
  return {
    person_id: '',
    program_slug: '',
    acquisition_source: 'admin_grant',
    status: 'active',
    active_from: '',
    active_to: '',
    priority: 0,
    source_ref: '',
    notes: '',
  };
}

export function formValuesFromAssignment(
  row: ProgramAssignment,
): AssignmentFormValues {
  return {
    person_id: row.person_id,
    program_slug: row.program_slug,
    acquisition_source: row.acquisition_source,
    status: row.status,
    active_from: row.active_from ?? '',
    active_to: row.active_to ?? '',
    priority: row.priority,
    source_ref: row.source_ref ?? '',
    notes: row.notes ?? '',
  };
}

interface PersonSuggestion {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
}

interface Props {
  value: AssignmentFormValues;
  onChange: (next: AssignmentFormValues) => void;
  onSubmit: () => void;
  onCancel?: () => void;
  saving?: boolean;
  submitLabel?: string;
  error?: string | null;
  disabledPersonId?: boolean;
}

const LIGHT_CONTROL_CLASS =
  'w-full px-3 py-2 border border-gray-300 rounded bg-white text-sm text-gray-900 placeholder-gray-400 disabled:bg-gray-100 disabled:text-gray-500';

export default function AssignmentEditor({
  value,
  onChange,
  onSubmit,
  onCancel,
  saving = false,
  submitLabel = 'Save assignment',
  error = null,
  disabledPersonId = false,
}: Props) {
  const [personQuery, setPersonQuery] = useState('');
  const [personResults, setPersonResults] = useState<PersonSuggestion[]>([]);
  const [searching, setSearching] = useState(false);

  const update = useCallback(
    (patch: Partial<AssignmentFormValues>) => onChange({ ...value, ...patch }),
    [value, onChange],
  );

  useEffect(() => {
    if (disabledPersonId) return;
    const q = personQuery.trim();
    if (q.length < 2) {
      setPersonResults([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setSearching(true);
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
        setSearching(false);
      }
    }, 200);
    return () => {
      ctrl.abort();
      clearTimeout(t);
    };
  }, [personQuery, disabledPersonId]);

  return (
    <div className="max-w-3xl">
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-lg p-5 mb-5">
        <h3 className="text-base font-semibold text-gray-900 mb-4">Scope</h3>
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
                className="w-full px-3 py-2 border border-gray-200 bg-gray-50 text-gray-700 rounded text-sm disabled:bg-gray-100 disabled:text-gray-500"
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
                  className={`${LIGHT_CONTROL_CLASS} focus:outline-none focus:ring-2 focus:ring-blue-400`}
                />
                {searching && (
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
              className={LIGHT_CONTROL_CLASS}
            />
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-5 mb-5">
        <h3 className="text-base font-semibold text-gray-900 mb-4">Lifecycle</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Status
            </label>
            <select
              value={value.status}
              onChange={(e) =>
                update({
                  status: e.target.value as ProgramAssignmentStatus,
                })
              }
              className={LIGHT_CONTROL_CLASS}
            >
              {PROGRAM_ASSIGNMENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Acquisition source
            </label>
            <select
              value={value.acquisition_source}
              onChange={(e) =>
                update({
                  acquisition_source: e.target.value as ProgramAcquisitionSource,
                })
              }
              className={LIGHT_CONTROL_CLASS}
            >
              {PROGRAM_ACQUISITION_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Active from
            </label>
            <input
              type="date"
              value={value.active_from.slice(0, 10)}
              onChange={(e) => update({ active_from: e.target.value })}
              className={LIGHT_CONTROL_CLASS}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Active to
            </label>
            <input
              type="date"
              value={value.active_to.slice(0, 10)}
              onChange={(e) => update({ active_to: e.target.value })}
              className={LIGHT_CONTROL_CLASS}
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
              className={LIGHT_CONTROL_CLASS}
            />
            <p className="mt-1 text-xs text-gray-500">
              Higher wins when multiple assignments overlap for the same slug.
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Source ref
            </label>
            <input
              type="text"
              value={value.source_ref}
              onChange={(e) => update({ source_ref: e.target.value })}
              placeholder="offer_key, stripe sub id, etc."
              className={LIGHT_CONTROL_CLASS}
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Internal notes
            </label>
            <textarea
              rows={3}
              value={value.notes}
              onChange={(e) => update({ notes: e.target.value })}
              className={LIGHT_CONTROL_CLASS}
            />
          </div>
        </div>
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
