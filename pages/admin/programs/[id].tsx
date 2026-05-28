/**
 * Admin Page: Program Editor (Plans Phase 12)
 *
 * All-in-one authoring surface for a single program. Lets admins:
 *   - edit the program's top-level catalogue fields + status
 *   - add / rename / reorder / publish modules
 *   - add / edit / reorder / publish content items of all four types
 *     (article, guidance, video, milestone)
 *
 * Nothing here reaches into program_plan_guidance or program_assignments.
 * This surface is purely the "program content" side of the Packet 11 copy
 * rule that Plans-impact and program-content must stay distinct.
 */

import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import {
  getCurrentUserWithRoleFromSSR,
  type AuthenticatedUser,
} from '@/lib/authServer';
import type {
  Program,
  ProgramContentItem,
  ProgramContentItemType,
  ProgramModule,
  ProgramStatus,
  ProgramWithTree,
} from '@/lib/programs/contentTypes';
import {
  PROGRAM_CONTENT_ITEM_TYPES,
  PROGRAM_STATUSES,
} from '@/lib/programs/contentTypes';
import {
  PROGRAM_DELIVERY_MODULE_TYPES,
  type ProgramDeliveryModuleType,
} from '@/lib/programs/deliveryModuleTypes';
import type { ProgramDeliveryModuleRow } from '@/lib/programs/deliveryModuleAdminServerService';

interface Props {
  user: AuthenticatedUser;
  programId: string;
}

const STATUS_BADGE: Record<ProgramStatus, string> = {
  draft: 'bg-yellow-100 text-yellow-900 border-yellow-300',
  published: 'bg-green-100 text-green-900 border-green-300',
  archived: 'bg-gray-100 text-gray-800 border-gray-300',
};

const LIGHT_CONTROL_CLASS =
  'w-full border border-gray-300 rounded bg-white text-gray-900 placeholder-gray-400 disabled:bg-gray-100 disabled:text-gray-500';

const LIGHT_CONTROL_SM_CLASS = `${LIGHT_CONTROL_CLASS} px-3 py-2 text-sm`;
const LIGHT_CONTROL_COMPACT_CLASS = `${LIGHT_CONTROL_CLASS} px-2 py-2 text-sm`;

function useTree(programId: string) {
  const [tree, setTree] = useState<ProgramWithTree | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(
        `/api/admin/programs/${encodeURIComponent(programId)}/tree`,
      );
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.error ?? 'Failed to load.');
      }
      setTree((await resp.json()) as ProgramWithTree);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed.');
    } finally {
      setLoading(false);
    }
  }, [programId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { tree, setTree, loading, error, refresh };
}

// ---------------------------------------------------------------------------
// Program header (title, status, description)
// ---------------------------------------------------------------------------

function ProgramHeader({
  program,
  onChange,
}: {
  program: Program;
  onChange: (p: Program) => void;
}) {
  const [title, setTitle] = useState(program.title);
  const [tagline, setTagline] = useState(program.tagline ?? '');
  const [description, setDescription] = useState(program.description ?? '');
  const [storefrontHref, setStorefrontHref] = useState(
    program.storefront_href ?? '',
  );
  const [status, setStatus] = useState<ProgramStatus>(program.status);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setErr(null);
    try {
      const resp = await fetch(`/api/admin/programs/${program.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          tagline: tagline.trim() || null,
          description: description.trim() || null,
          storefront_href: storefrontHref.trim() || null,
          status,
        }),
      });
      if (!resp.ok) {
        const b = await resp.json().catch(() => ({}));
        throw new Error(b.error ?? 'Save failed.');
      }
      const updated = (await resp.json()) as Program;
      onChange(updated);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 mb-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="font-mono text-xs text-gray-500">{program.slug}</p>
          <h2 className="text-xl font-semibold text-gray-900">
            Program details
          </h2>
        </div>
        <span
          className={`inline-block px-2 py-0.5 text-xs rounded-full border ${STATUS_BADGE[program.status]}`}
        >
          {program.status}
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Title
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={LIGHT_CONTROL_SM_CLASS}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Status
          </label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as ProgramStatus)}
            className={LIGHT_CONTROL_SM_CLASS}
          >
            {PROGRAM_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Tagline
          </label>
          <input
            value={tagline}
            onChange={(e) => setTagline(e.target.value)}
            className={LIGHT_CONTROL_SM_CLASS}
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className={`${LIGHT_CONTROL_SM_CLASS} font-sans`}
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Storefront href (optional)
          </label>
          <input
            value={storefrontHref}
            onChange={(e) => setStorefrontHref(e.target.value)}
            placeholder="/programs"
            className={`${LIGHT_CONTROL_SM_CLASS} font-mono`}
          />
        </div>
      </div>
      <div className="flex items-center gap-3 mt-4">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-40"
        >
          {saving ? 'Saving…' : 'Save details'}
        </button>
        {err && <p className="text-sm text-red-700">{err}</p>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Item editor (inline form)
// ---------------------------------------------------------------------------

interface ItemFormValues {
  item_type: ProgramContentItemType;
  title: string;
  summary: string;
  body: string;
  video_url: string;
  video_provider: string;
  estimated_minutes: string;
  status: ProgramStatus;
}

function emptyItemForm(): ItemFormValues {
  return {
    item_type: 'article',
    title: '',
    summary: '',
    body: '',
    video_url: '',
    video_provider: '',
    estimated_minutes: '',
    status: 'draft',
  };
}

function itemToForm(i: ProgramContentItem): ItemFormValues {
  return {
    item_type: i.item_type,
    title: i.title,
    summary: i.summary ?? '',
    body: i.body ?? '',
    video_url: i.video_url ?? '',
    video_provider: i.video_provider ?? '',
    estimated_minutes:
      i.estimated_minutes != null ? String(i.estimated_minutes) : '',
    status: i.status,
  };
}

function buildItemPayload(form: ItemFormValues) {
  const minutes = form.estimated_minutes.trim();
  return {
    item_type: form.item_type,
    title: form.title.trim(),
    summary: form.summary.trim() || null,
    body: form.body.trim() || null,
    video_url: form.video_url.trim() || null,
    video_provider: form.video_provider.trim() || null,
    estimated_minutes: minutes === '' ? null : Number(minutes),
    status: form.status,
  };
}

function ItemForm({
  initial,
  onSave,
  onCancel,
  submitLabel,
}: {
  initial: ItemFormValues;
  onSave: (payload: ReturnType<typeof buildItemPayload>) => Promise<void>;
  onCancel: () => void;
  submitLabel: string;
}) {
  const [form, setForm] = useState<ItemFormValues>(initial);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const set = <K extends keyof ItemFormValues>(k: K, v: ItemFormValues[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      await onSave(buildItemPayload(form));
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  const isVideo = form.item_type === 'video';

  return (
    <form
      onSubmit={submit}
      className="border border-gray-200 rounded p-3 grid grid-cols-1 md:grid-cols-6 gap-3 bg-gray-50"
    >
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">
          Type
        </label>
        <select
          value={form.item_type}
          onChange={(e) =>
            set('item_type', e.target.value as ProgramContentItemType)
          }
          className={LIGHT_CONTROL_COMPACT_CLASS}
        >
          {PROGRAM_CONTENT_ITEM_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      <div className="md:col-span-3">
        <label className="block text-xs font-medium text-gray-700 mb-1">
          Title
        </label>
        <input
          value={form.title}
          onChange={(e) => set('title', e.target.value)}
          className={LIGHT_CONTROL_COMPACT_CLASS}
          required
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">
          Minutes
        </label>
        <input
          value={form.estimated_minutes}
          onChange={(e) => set('estimated_minutes', e.target.value)}
          type="number"
          min={0}
          className={LIGHT_CONTROL_COMPACT_CLASS}
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">
          Status
        </label>
        <select
          value={form.status}
          onChange={(e) => set('status', e.target.value as ProgramStatus)}
          className={LIGHT_CONTROL_COMPACT_CLASS}
        >
          {PROGRAM_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>
      <div className="md:col-span-6">
        <label className="block text-xs font-medium text-gray-700 mb-1">
          Summary
        </label>
        <input
          value={form.summary}
          onChange={(e) => set('summary', e.target.value)}
          className={LIGHT_CONTROL_COMPACT_CLASS}
          placeholder="Short one-liner shown in lists."
        />
      </div>
      {isVideo ? (
        <>
          <div className="md:col-span-4">
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Video URL
            </label>
            <input
              value={form.video_url}
              onChange={(e) => set('video_url', e.target.value)}
              className={`${LIGHT_CONTROL_COMPACT_CLASS} font-mono`}
              placeholder="https://…"
              required
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Provider
            </label>
            <input
              value={form.video_provider}
              onChange={(e) => set('video_provider', e.target.value)}
              className={LIGHT_CONTROL_COMPACT_CLASS}
              placeholder="vimeo, youtube, mux"
            />
          </div>
        </>
      ) : (
        <div className="md:col-span-6">
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Body
          </label>
          <textarea
            value={form.body}
            onChange={(e) => set('body', e.target.value)}
            rows={6}
            className={`${LIGHT_CONTROL_COMPACT_CLASS} font-sans`}
            placeholder="Markdown or plain text."
          />
        </div>
      )}
      <div className="md:col-span-6 flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-40"
        >
          {saving ? 'Saving…' : submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-gray-300 rounded bg-white text-sm text-gray-800 hover:bg-gray-100"
        >
          Cancel
        </button>
        {err && <p className="text-sm text-red-700">{err}</p>}
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Delivery module authoring foundation
// ---------------------------------------------------------------------------

interface DeliveryModuleFormValues {
  module_key: string;
  module_type: ProgramDeliveryModuleType;
  title: string;
  eyebrow: string;
  body: string;
  day_start: string;
  day_end: string;
  status: ProgramStatus;
  capacity_variants_json: string;
  cta_json: string;
  anchor_json: string;
  metadata: string;
}

function emptyDeliveryModuleForm(): DeliveryModuleFormValues {
  return {
    module_key: '',
    module_type: 'guide',
    title: '',
    eyebrow: '',
    body: '',
    day_start: '',
    day_end: '',
    status: 'draft',
    capacity_variants_json: '{}',
    cta_json: '{}',
    anchor_json: '{}',
    metadata: '{}',
  };
}

function jsonText(value: Record<string, unknown>): string {
  return JSON.stringify(value ?? {}, null, 2);
}

function deliveryModuleToForm(
  row: ProgramDeliveryModuleRow,
): DeliveryModuleFormValues {
  return {
    module_key: row.module_key,
    module_type: row.module_type,
    title: row.title,
    eyebrow: row.eyebrow ?? '',
    body: row.body,
    day_start: row.day_start == null ? '' : String(row.day_start),
    day_end: row.day_end == null ? '' : String(row.day_end),
    status: row.status,
    capacity_variants_json: jsonText(row.capacity_variants_json),
    cta_json: jsonText(row.cta_json),
    anchor_json: jsonText(row.anchor_json),
    metadata: jsonText(row.metadata),
  };
}

function parseJsonObject(label: string, value: string): Record<string, unknown> {
  const trimmed = value.trim();
  if (!trimmed) return {};
  const parsed = JSON.parse(trimmed) as unknown;
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    Array.isArray(parsed)
  ) {
    throw new Error(`${label} must be a JSON object.`);
  }
  return parsed as Record<string, unknown>;
}

function optionalDay(value: string): number | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : Number(trimmed);
}

function buildDeliveryModulePayload(form: DeliveryModuleFormValues) {
  return {
    module_key: form.module_key.trim(),
    module_type: form.module_type,
    title: form.title.trim(),
    eyebrow: form.eyebrow.trim() || null,
    body: form.body.trim(),
    day_start: optionalDay(form.day_start),
    day_end: optionalDay(form.day_end),
    status: form.status,
    capacity_variants_json: parseJsonObject(
      'Capacity variants JSON',
      form.capacity_variants_json,
    ),
    cta_json: parseJsonObject('CTA JSON', form.cta_json),
    anchor_json: parseJsonObject('Anchor JSON', form.anchor_json),
    metadata: parseJsonObject('Metadata JSON', form.metadata),
  };
}

function DeliveryModuleForm({
  initial,
  submitLabel,
  onSave,
  onCancel,
}: {
  initial: DeliveryModuleFormValues;
  submitLabel: string;
  onSave: (payload: ReturnType<typeof buildDeliveryModulePayload>) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<DeliveryModuleFormValues>(initial);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const set = <K extends keyof DeliveryModuleFormValues>(
    key: K,
    value: DeliveryModuleFormValues[K],
  ) => setForm((current) => ({ ...current, [key]: value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErr(null);
    try {
      await onSave(buildDeliveryModulePayload(form));
    } catch (error) {
      setErr(error instanceof Error ? error.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="border border-gray-200 rounded p-3 grid grid-cols-1 md:grid-cols-6 gap-3 bg-gray-50"
    >
      <div className="md:col-span-2">
        <label className="block text-xs font-medium text-gray-700 mb-1">
          Module key
        </label>
        <input
          value={form.module_key}
          onChange={(e) => set('module_key', e.target.value)}
          className={`${LIGHT_CONTROL_COMPACT_CLASS} font-mono`}
          placeholder="baseline-week-1-focus"
          required
        />
      </div>
      <div className="md:col-span-2">
        <label className="block text-xs font-medium text-gray-700 mb-1">
          Type
        </label>
        <select
          value={form.module_type}
          onChange={(e) =>
            set('module_type', e.target.value as ProgramDeliveryModuleType)
          }
          className={LIGHT_CONTROL_COMPACT_CLASS}
        >
          {PROGRAM_DELIVERY_MODULE_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </div>
      <div className="md:col-span-2">
        <label className="block text-xs font-medium text-gray-700 mb-1">
          Status
        </label>
        <select
          value={form.status}
          onChange={(e) => set('status', e.target.value as ProgramStatus)}
          className={LIGHT_CONTROL_COMPACT_CLASS}
        >
          {PROGRAM_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </div>
      <div className="md:col-span-4">
        <label className="block text-xs font-medium text-gray-700 mb-1">
          Title
        </label>
        <input
          value={form.title}
          onChange={(e) => set('title', e.target.value)}
          className={LIGHT_CONTROL_COMPACT_CLASS}
          required
        />
      </div>
      <div className="md:col-span-2">
        <label className="block text-xs font-medium text-gray-700 mb-1">
          Eyebrow
        </label>
        <input
          value={form.eyebrow}
          onChange={(e) => set('eyebrow', e.target.value)}
          className={LIGHT_CONTROL_COMPACT_CLASS}
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">
          Day start
        </label>
        <input
          value={form.day_start}
          onChange={(e) => set('day_start', e.target.value)}
          type="number"
          min={0}
          className={LIGHT_CONTROL_COMPACT_CLASS}
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">
          Day end
        </label>
        <input
          value={form.day_end}
          onChange={(e) => set('day_end', e.target.value)}
          type="number"
          min={0}
          className={LIGHT_CONTROL_COMPACT_CLASS}
        />
      </div>
      <div className="md:col-span-6">
        <label className="block text-xs font-medium text-gray-700 mb-1">
          Body
        </label>
        <textarea
          value={form.body}
          onChange={(e) => set('body', e.target.value)}
          rows={4}
          className={`${LIGHT_CONTROL_COMPACT_CLASS} font-sans`}
          required
        />
      </div>
      <div className="md:col-span-2">
        <label className="block text-xs font-medium text-gray-700 mb-1">
          Capacity variants JSON
        </label>
        <textarea
          value={form.capacity_variants_json}
          onChange={(e) => set('capacity_variants_json', e.target.value)}
          rows={5}
          className={`${LIGHT_CONTROL_COMPACT_CLASS} font-mono text-xs`}
        />
      </div>
      <div className="md:col-span-2">
        <label className="block text-xs font-medium text-gray-700 mb-1">
          CTA JSON
        </label>
        <textarea
          value={form.cta_json}
          onChange={(e) => set('cta_json', e.target.value)}
          rows={5}
          className={`${LIGHT_CONTROL_COMPACT_CLASS} font-mono text-xs`}
        />
      </div>
      <div className="md:col-span-2">
        <label className="block text-xs font-medium text-gray-700 mb-1">
          Anchor JSON
        </label>
        <textarea
          value={form.anchor_json}
          onChange={(e) => set('anchor_json', e.target.value)}
          rows={5}
          className={`${LIGHT_CONTROL_COMPACT_CLASS} font-mono text-xs`}
        />
      </div>
      <div className="md:col-span-6">
        <label className="block text-xs font-medium text-gray-700 mb-1">
          Metadata JSON
        </label>
        <textarea
          value={form.metadata}
          onChange={(e) => set('metadata', e.target.value)}
          rows={4}
          className={`${LIGHT_CONTROL_COMPACT_CLASS} font-mono text-xs`}
          placeholder='{"groupId":"baseline-week-1","showWhen":"checkin_due"}'
        />
      </div>
      <div className="md:col-span-6 flex items-center gap-3">
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-40"
        >
          {saving ? 'Saving…' : submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-gray-300 rounded bg-white text-sm text-gray-800 hover:bg-gray-100"
        >
          Cancel
        </button>
        {err && <p className="text-sm text-red-700">{err}</p>}
      </div>
    </form>
  );
}

function DeliveryModulesSection({ programId }: { programId: string }) {
  const [rows, setRows] = useState<ProgramDeliveryModuleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(
        `/api/admin/programs/${encodeURIComponent(
          programId,
        )}/delivery-modules`,
      );
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.error ?? 'Failed to load delivery modules.');
      }
      setRows((await resp.json()) as ProgramDeliveryModuleRow[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed.');
    } finally {
      setLoading(false);
    }
  }, [programId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const move = async (moduleId: string, dir: -1 | 1) => {
    const ordered = rows.map((row) => row.id);
    const index = ordered.indexOf(moduleId);
    const nextIndex = index + dir;
    if (index < 0 || nextIndex < 0 || nextIndex >= ordered.length) return;
    [ordered[index], ordered[nextIndex]] = [ordered[nextIndex], ordered[index]];
    await fetch(`/api/admin/programs/${programId}/delivery-modules-reorder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ordered_ids: ordered }),
    });
    await refresh();
  };

  const archive = async (row: ProgramDeliveryModuleRow) => {
    if (!confirm(`Archive delivery module "${row.title}"?`)) return;
    await fetch(`/api/admin/program-delivery-modules/${row.id}`, {
      method: 'DELETE',
    });
    await refresh();
  };

  return (
    <section className="bg-white border border-gray-200 rounded-lg p-4 mb-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">
            Delivery Modules
          </h2>
          <p className="text-xs text-gray-600 mt-1">
            First-pass admin authoring for app delivery cards. Published rows
            override code-owned Baseline delivery when present.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setEditingId(null);
            setAdding((value) => !value);
          }}
          className="px-3 py-2 bg-green-600 text-white rounded text-sm font-medium hover:bg-green-700"
        >
          {adding ? 'Cancel' : '+ Add delivery module'}
        </button>
      </div>

      {adding && (
        <div className="mb-3">
          <DeliveryModuleForm
            initial={emptyDeliveryModuleForm()}
            submitLabel="Create delivery module"
            onCancel={() => setAdding(false)}
            onSave={async (payload) => {
              const resp = await fetch(
                `/api/admin/programs/${programId}/delivery-modules`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(payload),
                },
              );
              if (!resp.ok) {
                const body = await resp.json().catch(() => ({}));
                throw new Error(body.error ?? 'Create failed.');
              }
              setAdding(false);
              await refresh();
            }}
          />
        </div>
      )}

      {loading && <p className="text-sm text-gray-600">Loading…</p>}
      {error && <p className="text-sm text-red-700">{error}</p>}

      {!loading && rows.length === 0 && (
        <p className="text-sm text-gray-600 italic">
          No delivery modules yet. Baseline still uses the code-owned fallback.
        </p>
      )}

      {rows.length > 0 && (
        <ul className="divide-y divide-gray-100 border border-gray-200 rounded">
          {rows.map((row, index) => {
            const editing = editingId === row.id;
            return (
              <li key={row.id} className="p-3">
                {!editing && (
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span
                          className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 border rounded ${STATUS_BADGE[row.status]}`}
                        >
                          {row.status}
                        </span>
                        <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 border border-gray-300 rounded text-gray-700">
                          {row.module_type}
                        </span>
                        <span className="text-[11px] text-gray-500 font-mono">
                          {row.module_key}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-gray-900">
                        {row.title}
                      </p>
                      <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">
                        {row.body}
                      </p>
                      {(row.day_start != null || row.day_end != null) && (
                        <p className="text-[11px] text-gray-500 mt-1">
                          Days {row.day_start ?? 'any'}-{row.day_end ?? 'any'}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="inline-flex rounded border border-gray-300 overflow-hidden bg-white">
                        <button
                          type="button"
                          onClick={() => move(row.id, -1)}
                          disabled={index === 0}
                          className="px-2 py-1 text-sm font-semibold text-gray-800 hover:bg-gray-100 disabled:text-gray-300 disabled:hover:bg-white border-r border-gray-300"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => move(row.id, 1)}
                          disabled={index === rows.length - 1}
                          className="px-2 py-1 text-sm font-semibold text-gray-800 hover:bg-gray-100 disabled:text-gray-300 disabled:hover:bg-white"
                        >
                          ↓
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setAdding(false);
                          setEditingId(row.id);
                        }}
                        className="text-xs text-blue-700 hover:underline"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => archive(row)}
                        className="text-xs text-red-700 hover:underline"
                      >
                        Archive
                      </button>
                    </div>
                  </div>
                )}
                {editing && (
                  <DeliveryModuleForm
                    initial={deliveryModuleToForm(row)}
                    submitLabel="Save delivery module"
                    onCancel={() => setEditingId(null)}
                    onSave={async (payload) => {
                      const resp = await fetch(
                        `/api/admin/program-delivery-modules/${row.id}`,
                        {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify(payload),
                        },
                      );
                      if (!resp.ok) {
                        const body = await resp.json().catch(() => ({}));
                        throw new Error(body.error ?? 'Save failed.');
                      }
                      setEditingId(null);
                      await refresh();
                    }}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Module panel
// ---------------------------------------------------------------------------

function ModulePanel({
  module,
  items,
  index,
  totalModules,
  onChanged,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
}: {
  module: ProgramModule;
  items: ProgramContentItem[];
  index: number;
  totalModules: number;
  onChanged: () => Promise<void> | void;
  onMoveUp: () => void | Promise<void>;
  onMoveDown: () => void | Promise<void>;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const [title, setTitle] = useState(module.title);
  const [description, setDescription] = useState(module.description ?? '');
  const [status, setStatus] = useState<ProgramStatus>(module.status);
  const [moduleErr, setModuleErr] = useState<string | null>(null);
  const [addingItem, setAddingItem] = useState(false);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

  const saveModule = async () => {
    setModuleErr(null);
    const resp = await fetch(`/api/admin/program-modules/${module.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: title.trim(),
        description: description.trim() || null,
        status,
      }),
    });
    if (!resp.ok) {
      const b = await resp.json().catch(() => ({}));
      setModuleErr(b.error ?? 'Save failed.');
      return;
    }
    await onChanged();
  };

  const deleteModule = async () => {
    if (
      !confirm(
        `Delete module "${module.title}" and all of its content items? This cannot be undone.`,
      )
    ) {
      return;
    }
    const resp = await fetch(`/api/admin/program-modules/${module.id}`, {
      method: 'DELETE',
    });
    if (!resp.ok) {
      const b = await resp.json().catch(() => ({}));
      setModuleErr(b.error ?? 'Delete failed.');
      return;
    }
    await onChanged();
  };

  const deleteItem = async (itemId: string, itemTitle: string) => {
    if (!confirm(`Delete item "${itemTitle}"?`)) return;
    await fetch(`/api/admin/program-content-items/${itemId}`, {
      method: 'DELETE',
    });
    await onChanged();
  };

  const moveItem = async (itemId: string, dir: -1 | 1) => {
    const ordered = items.map((i) => i.id);
    const idx = ordered.indexOf(itemId);
    if (idx < 0) return;
    const j = idx + dir;
    if (j < 0 || j >= ordered.length) return;
    [ordered[idx], ordered[j]] = [ordered[j], ordered[idx]];
    await fetch(`/api/admin/program-modules/${module.id}/items-reorder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ordered_ids: ordered }),
    });
    await onChanged();
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-center justify-between gap-3 mb-3 pb-3 border-b border-gray-200">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-medium text-gray-700 shrink-0">
            Module {index + 1} of {totalModules}
          </span>
          <span
            className={`inline-block px-2 py-0.5 text-xs rounded-full border ${STATUS_BADGE[module.status]}`}
          >
            {module.status}
          </span>
          <span className="text-xs text-gray-500 truncate hidden sm:inline">
            {module.title}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="inline-flex rounded border border-gray-300 overflow-hidden bg-white">
            <button
              type="button"
              onClick={() => onMoveUp()}
              disabled={!canMoveUp}
              aria-label="Move module up"
              title="Move module up"
              className="px-2 py-1 text-sm font-semibold text-gray-800 hover:bg-gray-100 disabled:text-gray-300 disabled:hover:bg-white border-r border-gray-300"
            >
              ↑
            </button>
            <button
              type="button"
              onClick={() => onMoveDown()}
              disabled={!canMoveDown}
              aria-label="Move module down"
              title="Move module down"
              className="px-2 py-1 text-sm font-semibold text-gray-800 hover:bg-gray-100 disabled:text-gray-300 disabled:hover:bg-white"
            >
              ↓
            </button>
          </div>
          <button
            type="button"
            onClick={deleteModule}
            className="px-2 py-1 text-xs font-medium text-red-700 border border-red-200 bg-white rounded hover:bg-red-50"
          >
            Delete module
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
        <div className="md:col-span-3">
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Module title
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={LIGHT_CONTROL_COMPACT_CLASS}
          />
        </div>
        <div className="md:col-span-1">
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Status
          </label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as ProgramStatus)}
            className={LIGHT_CONTROL_COMPACT_CLASS}
          >
            {PROGRAM_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="md:col-span-2 flex items-end">
          <button
            type="button"
            onClick={saveModule}
            className="px-3 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700"
          >
            Save module
          </button>
        </div>
        <div className="md:col-span-6">
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Module description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className={`${LIGHT_CONTROL_COMPACT_CLASS} font-sans`}
          />
        </div>
        {moduleErr && (
          <p className="md:col-span-6 text-sm text-red-700">{moduleErr}</p>
        )}
      </div>

      <div className="mt-4 border-t border-gray-200 pt-3">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-600">
            Content items ({items.length})
          </p>
          <button
            type="button"
            onClick={() => {
              setEditingItemId(null);
              setAddingItem((x) => !x);
            }}
            className="text-xs text-blue-700 hover:underline"
          >
            {addingItem ? 'Cancel' : '+ Add item'}
          </button>
        </div>

        {addingItem && (
          <div className="mb-3">
            <ItemForm
              initial={emptyItemForm()}
              submitLabel="Create item"
              onCancel={() => setAddingItem(false)}
              onSave={async (payload) => {
                const resp = await fetch(
                  `/api/admin/program-modules/${module.id}/items`,
                  {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                  },
                );
                if (!resp.ok) {
                  const b = await resp.json().catch(() => ({}));
                  throw new Error(b.error ?? 'Create failed.');
                }
                setAddingItem(false);
                await onChanged();
              }}
            />
          </div>
        )}

        {items.length === 0 ? (
          <p className="text-xs text-gray-500 italic">
            No content items yet.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100 border border-gray-200 rounded">
            {items.map((item, itemIdx) => {
              const editing = editingItemId === item.id;
              return (
                <li key={item.id} className="p-3">
                  {!editing && (
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 border border-gray-300 rounded text-gray-700">
                            {item.item_type}
                          </span>
                          <span
                            className={`text-[10px] uppercase tracking-wider px-1.5 py-0.5 border rounded ${STATUS_BADGE[item.status]}`}
                          >
                            {item.status}
                          </span>
                          {item.estimated_minutes != null && (
                            <span className="text-[11px] text-gray-500">
                              ~{item.estimated_minutes}m
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-medium text-gray-900">
                          {item.title}
                        </p>
                        {item.summary && (
                          <p className="text-xs text-gray-600 mt-0.5">
                            {item.summary}
                          </p>
                        )}
                        {item.item_type === 'video' && item.video_url && (
                          <p className="text-[11px] text-gray-500 mt-0.5 font-mono truncate max-w-[60ch]">
                            {item.video_url}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <div className="inline-flex rounded border border-gray-300 overflow-hidden bg-white">
                          <button
                            type="button"
                            onClick={() => moveItem(item.id, -1)}
                            disabled={itemIdx === 0}
                            aria-label="Move item up"
                            title="Move item up"
                            className="px-2 py-1 text-sm font-semibold text-gray-800 hover:bg-gray-100 disabled:text-gray-300 disabled:hover:bg-white border-r border-gray-300"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            onClick={() => moveItem(item.id, 1)}
                            disabled={itemIdx === items.length - 1}
                            aria-label="Move item down"
                            title="Move item down"
                            className="px-2 py-1 text-sm font-semibold text-gray-800 hover:bg-gray-100 disabled:text-gray-300 disabled:hover:bg-white"
                          >
                            ↓
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setAddingItem(false);
                            setEditingItemId(item.id);
                          }}
                          className="text-xs text-blue-700 hover:underline"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteItem(item.id, item.title)}
                          className="text-xs text-red-700 hover:underline"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                  {editing && (
                    <ItemForm
                      initial={itemToForm(item)}
                      submitLabel="Save item"
                      onCancel={() => setEditingItemId(null)}
                      onSave={async (payload) => {
                        const resp = await fetch(
                          `/api/admin/program-content-items/${item.id}`,
                          {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(payload),
                          },
                        );
                        if (!resp.ok) {
                          const b = await resp.json().catch(() => ({}));
                          throw new Error(b.error ?? 'Save failed.');
                        }
                        setEditingItemId(null);
                        await onChanged();
                      }}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AdminProgramEditorPage({ user: _user, programId }: Props) {
  const { tree, setTree, loading, error, refresh } = useTree(programId);
  const [newModuleTitle, setNewModuleTitle] = useState('');
  const [creatingModule, setCreatingModule] = useState(false);

  const addModule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newModuleTitle.trim()) return;
    setCreatingModule(true);
    try {
      await fetch(`/api/admin/programs/${programId}/modules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newModuleTitle.trim() }),
      });
      setNewModuleTitle('');
      await refresh();
    } finally {
      setCreatingModule(false);
    }
  };

  const moveModule = async (moduleId: string, dir: -1 | 1) => {
    if (!tree) return;
    const ordered = tree.modules.map((m) => m.module.id);
    const idx = ordered.indexOf(moduleId);
    const j = idx + dir;
    if (idx < 0 || j < 0 || j >= ordered.length) return;
    [ordered[idx], ordered[j]] = [ordered[j], ordered[idx]];
    await fetch(`/api/admin/programs/${programId}/modules-reorder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ordered_ids: ordered }),
    });
    await refresh();
  };

  return (
    <>
      <Head>
        <title>Program Editor · Fine Diet Admin</title>
      </Head>
      <div className="bg-gray-100 min-h-screen pb-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <Link
            href="/admin/programs"
            className="text-sm text-gray-600 hover:text-gray-900 inline-block mb-3"
          >
            ← Back to Programs
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 mb-5">
            Program Editor
          </h1>

          {loading && <p className="text-sm text-gray-600">Loading…</p>}
          {error && (
            <p className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-3">
              {error}
            </p>
          )}

          {tree && (
            <>
              <ProgramHeader
                program={tree.program}
                onChange={(p) =>
                  setTree((prev) => (prev ? { ...prev, program: p } : prev))
                }
              />

              <DeliveryModulesSection programId={programId} />

              <div className="flex items-center justify-between mb-3">
                <h2 className="text-xl font-semibold text-gray-900">
                  Modules
                </h2>
                <form
                  onSubmit={addModule}
                  className="flex items-center gap-2"
                >
                  <input
                    value={newModuleTitle}
                    onChange={(e) => setNewModuleTitle(e.target.value)}
                    placeholder="New module title"
                    className={`${LIGHT_CONTROL_SM_CLASS} w-auto`}
                  />
                  <button
                    type="submit"
                    disabled={creatingModule || !newModuleTitle.trim()}
                    className="px-3 py-2 bg-green-600 text-white rounded text-sm font-medium hover:bg-green-700 disabled:opacity-40"
                  >
                    + Add module
                  </button>
                </form>
              </div>

              {tree.modules.length === 0 ? (
                <p className="text-sm text-gray-600 italic bg-white border border-gray-200 rounded-lg p-4">
                  No modules yet. Add one above.
                </p>
              ) : (
                <div className="space-y-3">
                  {tree.modules.map((entry, idx) => (
                    <ModulePanel
                      key={entry.module.id}
                      module={entry.module}
                      items={entry.items}
                      index={idx}
                      totalModules={tree.modules.length}
                      onChanged={refresh}
                      canMoveUp={idx > 0}
                      canMoveDown={idx < tree.modules.length - 1}
                      onMoveUp={() => moveModule(entry.module.id, -1)}
                      onMoveDown={() => moveModule(entry.module.id, 1)}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async (
  context,
) => {
  const user = await getCurrentUserWithRoleFromSSR(context);
  if (!user || (user.role !== 'editor' && user.role !== 'admin')) {
    return {
      redirect: {
        destination: '/login?redirect=/admin/programs',
        permanent: false,
      },
    };
  }
  const { id } = context.params ?? {};
  if (typeof id !== 'string') {
    return { notFound: true };
  }
  return { props: { user, programId: id } };
};
