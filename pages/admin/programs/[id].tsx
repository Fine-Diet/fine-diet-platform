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
import { useCallback, useEffect, useRef, useState } from 'react';
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
import {
  buildCompositionSavePayload,
  metadataHasComposition,
  type EditorMediaBlockInput,
} from '@/lib/programs/deliveryComposition';
import type { ProgramCheckinTemplate } from '@/lib/programs/runtimeTypes';
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
  composition_enabled: boolean;
  program_version_id: string;
  media_blocks: EditorMediaBlockInput[];
  hero_title: string;
  hero_eyebrow: string;
  hero_image_url: string;
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
    composition_enabled: false,
    program_version_id: '',
    media_blocks: [],
    hero_title: '',
    hero_eyebrow: '',
    hero_image_url: '',
  };
}

function jsonText(value: Record<string, unknown>): string {
  return JSON.stringify(value ?? {}, null, 2);
}

function deliveryModuleToForm(
  row: ProgramDeliveryModuleRow,
): DeliveryModuleFormValues {
  const blocks = Array.isArray(row.metadata.blocks)
    ? (row.metadata.blocks as Array<Record<string, unknown>>)
    : [];
  const mediaBlocks: EditorMediaBlockInput[] = blocks.flatMap((block) => {
    if (block.type !== 'audio' && block.type !== 'video') return [];
    return [
      {
        id: typeof block.id === 'string' ? block.id : '',
        type: block.type,
        url: typeof block.url === 'string' ? block.url : '',
        title: typeof block.title === 'string' ? block.title : '',
        description:
          typeof block.description === 'string' ? block.description : '',
      },
    ];
  });
  const hero =
    row.metadata.hero &&
    typeof row.metadata.hero === 'object' &&
    !Array.isArray(row.metadata.hero)
      ? (row.metadata.hero as {
          title?: unknown;
          eyebrow?: unknown;
          imageUrl?: unknown;
        })
      : undefined;
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
    composition_enabled: metadataHasComposition(row.metadata),
    program_version_id: row.program_version_id ?? '',
    media_blocks: mediaBlocks,
    hero_title: typeof hero?.title === 'string' ? hero.title : '',
    hero_eyebrow: typeof hero?.eyebrow === 'string' ? hero.eyebrow : '',
    hero_image_url: typeof hero?.imageUrl === 'string' ? hero.imageUrl : '',
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

function readJsonField(
  label: string,
  value: string,
): { value: Record<string, unknown>; error: string | null } {
  try {
    return { value: parseJsonObject(label, value), error: null };
  } catch (error) {
    return {
      value: {},
      error: error instanceof Error ? error.message : `${label} is invalid.`,
    };
  }
}

function compositionInput(
  form: DeliveryModuleFormValues,
  fields: {
    metadata: Record<string, unknown>;
    capacityVariants: Record<string, unknown>;
    cta: Record<string, unknown>;
    anchor: Record<string, unknown>;
    durationDays?: number | null;
  },
) {
  return buildCompositionSavePayload({
    moduleKey: form.module_key,
    moduleType: form.module_type,
    title: form.title,
    eyebrow: form.eyebrow,
    body: form.body,
    dayStart: optionalDay(form.day_start),
    dayEnd: optionalDay(form.day_end),
    status: form.status,
    programVersionId: form.program_version_id,
    displayOrder: null,
    compositionEnabled: form.composition_enabled,
    mediaBlocks: form.media_blocks,
    heroTitle: form.hero_title,
    heroEyebrow: form.hero_eyebrow,
    heroImageUrl: form.hero_image_url,
    metadata: fields.metadata,
    capacityVariants: fields.capacityVariants,
    cta: fields.cta,
    anchor: fields.anchor,
    durationDays: fields.durationDays,
  });
}

function buildDeliveryModulePayload(
  form: DeliveryModuleFormValues,
  durationDays?: number | null,
) {
  const result = compositionInput(form, {
    metadata: parseJsonObject('Metadata JSON', form.metadata),
    capacityVariants: parseJsonObject(
      'Capacity variants JSON',
      form.capacity_variants_json,
    ),
    cta: parseJsonObject('CTA JSON', form.cta_json),
    anchor: parseJsonObject('Anchor JSON', form.anchor_json),
    durationDays,
  });
  if (result.issues.length > 0) {
    throw new Error(result.issues[0]);
  }
  return result.payload;
}

function DeliveryModuleForm({
  initial,
  submitLabel,
  programSlug,
  programTitle,
  versions,
  versionRows,
  durationDays,
  checkinTemplates,
  lockedVersionId,
  onSave,
  onCancel,
}: {
  initial: DeliveryModuleFormValues;
  submitLabel: string;
  programSlug: string;
  programTitle: string;
  versions: Array<{
    id: string;
    version_label: string | null;
    version_key: string;
    duration_days: number | null;
    status: string;
  }>;
  versionRows: ProgramDeliveryModuleRow[];
  durationDays: number | null;
  checkinTemplates: ProgramCheckinTemplate[];
  lockedVersionId: string;
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
      const versionLocked =
        lockedVersionId && lockedVersionId !== 'unversioned'
          ? { ...form, program_version_id: lockedVersionId }
          : form;
      await onSave(buildDeliveryModulePayload(versionLocked, durationDays));
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
      <div className="md:col-span-6 flex items-center gap-2">
        <input
          id="composition-enabled"
          type="checkbox"
          checked={form.composition_enabled}
          onChange={(e) => set('composition_enabled', e.target.checked)}
        />
        <label htmlFor="composition-enabled" className="text-xs text-gray-700">
          Composition draft for one program version
        </label>
      </div>
      <div className="md:col-span-3">
        <label className="block text-xs font-medium text-gray-700 mb-1">
          Program version
        </label>
        <input
          list="program-version-options"
          value={
            lockedVersionId && lockedVersionId !== 'unversioned'
              ? lockedVersionId
              : form.program_version_id
          }
          onChange={(e) => set('program_version_id', e.target.value)}
          readOnly={Boolean(lockedVersionId && lockedVersionId !== 'unversioned')}
          className={`${LIGHT_CONTROL_COMPACT_CLASS} font-mono`}
          placeholder="Version id"
        />
        <datalist id="program-version-options">
          {versions.map((version) => (
            <option key={version.id} value={version.id}>
              {version.version_label || version.version_key}
            </option>
          ))}
        </datalist>
      </div>
      <div className="md:col-span-3">
        <label className="block text-xs font-medium text-gray-700 mb-1">
          Media for this day
        </label>
        <div className="space-y-2">
          {form.media_blocks.map((block, index) => (
            <div key={`${block.id}-${index}`} className="grid grid-cols-2 gap-2">
              <select
                value={block.type}
                onChange={(e) => {
                  const type = e.target.value as '' | 'audio' | 'video';
                  set(
                    'media_blocks',
                    form.media_blocks.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, type } : item,
                    ),
                  );
                }}
                className={LIGHT_CONTROL_COMPACT_CLASS}
              >
                <option value="">No media</option>
                <option value="audio">Audio</option>
                <option value="video">Video</option>
              </select>
              <input
                value={block.url}
                onChange={(e) =>
                  set(
                    'media_blocks',
                    form.media_blocks.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, url: e.target.value } : item,
                    ),
                  )
                }
                className={LIGHT_CONTROL_COMPACT_CLASS}
                placeholder="https:// or /path"
              />
              <input
                value={block.id}
                onChange={(e) =>
                  set(
                    'media_blocks',
                    form.media_blocks.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, id: e.target.value } : item,
                    ),
                  )
                }
                className={LIGHT_CONTROL_COMPACT_CLASS}
                placeholder="media id"
              />
              <input
                value={block.title}
                onChange={(e) =>
                  set(
                    'media_blocks',
                    form.media_blocks.map((item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, title: e.target.value }
                        : item,
                    ),
                  )
                }
                className={LIGHT_CONTROL_COMPACT_CLASS}
                placeholder="media title"
              />
              <input
                value={block.description}
                onChange={(e) =>
                  set(
                    'media_blocks',
                    form.media_blocks.map((item, itemIndex) =>
                      itemIndex === index
                        ? { ...item, description: e.target.value }
                        : item,
                    ),
                  )
                }
                className={`${LIGHT_CONTROL_COMPACT_CLASS} col-span-2`}
                placeholder="media description"
              />
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              set('media_blocks', [
                ...form.media_blocks,
                {
                  id: `${form.module_key || 'media'}-${form.media_blocks.length + 1}`,
                  type: 'audio',
                  url: '',
                  title: '',
                  description: '',
                },
              ])
            }
            className="text-xs text-blue-700 hover:underline"
          >
            Add media block
          </button>
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">
          Hero title
        </label>
        <input
          value={form.hero_title}
          onChange={(e) => set('hero_title', e.target.value)}
          className={LIGHT_CONTROL_COMPACT_CLASS}
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">
          Hero eyebrow
        </label>
        <input
          value={form.hero_eyebrow}
          onChange={(e) => set('hero_eyebrow', e.target.value)}
          className={LIGHT_CONTROL_COMPACT_CLASS}
        />
      </div>
      <div className="md:col-span-4">
        <label className="block text-xs font-medium text-gray-700 mb-1">
          Hero image
        </label>
        <input
          value={form.hero_image_url}
          onChange={(e) => set('hero_image_url', e.target.value)}
          className={LIGHT_CONTROL_COMPACT_CLASS}
          placeholder="https:// or /path"
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

function DeliveryModulesSection({
  programId,
  programSlug,
  programTitle,
}: {
  programId: string;
  programSlug: string;
  programTitle: string;
}) {
  const [rows, setRows] = useState<ProgramDeliveryModuleRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedVersionId, setSelectedVersionId] = useState('');
  const [checkinTemplates, setCheckinTemplates] = useState<ProgramCheckinTemplate[]>(
    [],
  );
  const [checkinDraft, setCheckinDraft] = useState<{
    id?: string;
    checkin_day: string;
    title: string;
    description: string;
    prompt_md: string;
    questions_json: string;
  } | null>(null);
  const loadGeneration = useRef(0);
  const [versions, setVersions] = useState<
    Array<{
      id: string;
      version_label: string | null;
      version_key: string;
      duration_days: number | null;
      status: string;
    }>
  >([]);
  const [publishing, setPublishing] = useState(false);
  const [draftDurationInput, setDraftDurationInput] = useState('');
  const [creatingDraft, setCreatingDraft] = useState(false);
  const selectedVersion = versions.find((version) => version.id === selectedVersionId);
  const refresh = useCallback(async () => {
    if (!selectedVersionId) {
      setRows([]);
      setCheckinTemplates([]);
      setLoading(false);
      return;
    }
    const generation = loadGeneration.current + 1;
    loadGeneration.current = generation;
    setLoading(true);
    setError(null);
    try {
      const resp = await fetch(
        `/api/admin/programs/${encodeURIComponent(
          programId,
        )}/delivery-modules?version_id=${encodeURIComponent(selectedVersionId)}`,
      );
      if (generation !== loadGeneration.current) return;
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.error ?? 'Failed to load delivery modules.');
      }
      setRows((await resp.json()) as ProgramDeliveryModuleRow[]);
      if (selectedVersionId === 'unversioned') {
        setCheckinTemplates([]);
        return;
      }
      const templateResp = await fetch(
        `/api/admin/programs/${encodeURIComponent(
          programId,
        )}/checkin-templates?version_id=${encodeURIComponent(selectedVersionId)}`,
      );
      if (generation !== loadGeneration.current) return;
      if (!templateResp.ok) {
        const body = await templateResp.json().catch(() => ({}));
        throw new Error(body.error ?? 'Failed to load check-in templates.');
      }
      setCheckinTemplates((await templateResp.json()) as ProgramCheckinTemplate[]);
    } catch (err) {
      if (generation !== loadGeneration.current) return;
      setError(err instanceof Error ? err.message : 'Failed.');
    } finally {
      if (generation === loadGeneration.current) setLoading(false);
    }
  }, [programId, selectedVersionId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const resp = await fetch(
        `/api/admin/programs/${encodeURIComponent(programId)}/versions`,
      );
      if (!resp.ok || cancelled) return;
      const body = (await resp.json()) as Array<{
        id: string;
        version_label: string | null;
        version_key: string;
        duration_days: number | null;
        status: string;
      }>;
      if (!cancelled) setVersions(body);
    })();
    return () => {
      cancelled = true;
    };
  }, [programId]);

  const createDraftVersion = async (sourceVersionId?: string) => {
    setError(null);
    const trimmedDuration = draftDurationInput.trim();
    const durationDays = trimmedDuration === '' ? null : Number(trimmedDuration);
    if (durationDays !== null && (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 3650)) {
      setError('Program duration must be a whole number between 1 and 3650 days.');
      return;
    }
    setCreatingDraft(true);
    try {
      const resp = await fetch(`/api/admin/programs/${encodeURIComponent(programId)}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_version_id: sourceVersionId ?? null,
          version_label: null,
          duration_days: durationDays,
        }),
      });
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(body.error ?? 'Could not create a draft program version.');
      const created = body as { id: string };
      setVersions((current) => [...current, body]);
      setSelectedVersionId(created.id);
      setRows([]);
      setCheckinTemplates([]);
      setEditingId(null);
      setAdding(false);
      setDraftDurationInput('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create a draft program version.');
    } finally {
      setCreatingDraft(false);
    }
  };

  const publishSelectedVersion = async () => {
    if (!selectedVersion || selectedVersion.status !== 'draft') return;
    setPublishing(true);
    setError(null);
    try {
      const resp = await fetch(
        `/api/admin/programs/${encodeURIComponent(programId)}/versions/${encodeURIComponent(selectedVersion.id)}/publish`,
        { method: 'POST' },
      );
      const body = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(body.error ?? 'Could not publish this version.');
      setVersions((current) => current.map((version) =>
        version.id === selectedVersion.id ? { ...version, status: 'published' } : version,
      ));
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not publish this version.');
    } finally {
      setPublishing(false);
    }
  };

  const move = async (moduleId: string, dir: -1 | 1) => {
    const ordered = rows.map((row) => row.id);
    const index = ordered.indexOf(moduleId);
    const nextIndex = index + dir;
    if (index < 0 || nextIndex < 0 || nextIndex >= ordered.length) return;
    [ordered[index], ordered[nextIndex]] = [ordered[nextIndex], ordered[index]];
    if (!selectedVersionId) return;
    try {
      const response = await fetch(
        `/api/admin/programs/${programId}/delivery-modules-reorder?version_id=${encodeURIComponent(selectedVersionId)}`,
        {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ordered_ids: ordered }),
        },
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? 'Could not reorder delivery modules.');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reorder delivery modules.');
    }
  };

  const archive = async (row: ProgramDeliveryModuleRow) => {
    if (!confirm(`Archive delivery module "${row.title}"?`)) return;
    try {
      const response = await fetch(`/api/admin/program-delivery-modules/${row.id}`, {
        method: 'DELETE',
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? 'Could not archive delivery module.');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not archive delivery module.');
    }
  };

  const beginCheckinEdit = (template?: ProgramCheckinTemplate) => {
    setError(null);
    setCheckinDraft(template ? {
      id: template.id,
      checkin_day: String(template.checkin_day),
      title: template.title,
      description: template.description ?? '',
      prompt_md: template.prompt_md ?? '',
      questions_json: JSON.stringify(template.questions_json ?? [], null, 2),
    } : { checkin_day: '1', title: '', description: '', prompt_md: '', questions_json: '[]' });
  };

  const saveCheckin = async () => {
    if (!checkinDraft || !selectedVersionId || selectedVersionId === 'unversioned') return;
    let questions: unknown;
    try {
      questions = JSON.parse(checkinDraft.questions_json);
    } catch {
      setError('Questions JSON must be valid JSON.');
      return;
    }
    setError(null);
    try {
      const response = await fetch(`/api/admin/programs/${programId}/checkin-templates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: checkinDraft.id ?? null,
          version_id: selectedVersionId,
          checkin_day: Number(checkinDraft.checkin_day),
          title: checkinDraft.title,
          description: checkinDraft.description || null,
          prompt_md: checkinDraft.prompt_md || null,
          questions_json: questions,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? 'Check-in template save failed.');
      setCheckinDraft(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Check-in template save failed.');
    }
  };

  return (
    <section className="bg-white border border-gray-200 rounded-lg p-4 mb-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">
            Delivery Modules
          </h2>
          <p className="text-xs text-gray-600 mt-1">
            Drafts are editable. Publishing freezes a version and makes it
            available to new enrollments while existing enrollments keep their version.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 justify-end">
          <label className="text-xs font-medium text-gray-700">
            New version duration (days)
            <input
              type="number"
              min="1"
              max="3650"
              step="1"
              value={draftDurationInput}
              onChange={(event) => setDraftDurationInput(event.target.value)}
              placeholder={selectedVersion?.status === 'published' ? 'Inherit if blank' : 'Optional'}
              aria-label="New version duration in days"
              className="mt-1 block w-44 rounded border border-gray-300 px-2 py-1 text-sm"
            />
            <span className="mt-1 block max-w-48 font-normal text-gray-500">
              Required for scheduled check-ins. Blank clones inherit their source duration.
            </span>
          </label>
          <button
            type="button"
            disabled={creatingDraft}
            onClick={() => void createDraftVersion()}
            className="px-3 py-2 border border-gray-300 rounded text-sm font-medium text-gray-800 hover:bg-gray-50"
          >
            New blank draft version
          </button>
          {selectedVersion?.status === 'published' && (
            <button
              type="button"
              disabled={creatingDraft}
              onClick={() => void createDraftVersion(selectedVersion.id)}
              className="px-3 py-2 border border-gray-300 rounded text-sm font-medium text-gray-800 hover:bg-gray-50"
            >
              Clone as draft
            </button>
          )}
          <button
            type="button"
            disabled={!selectedVersion || selectedVersion.status !== 'draft'}
            onClick={() => {
              setEditingId(null);
              setAdding((value) => !value);
            }}
            className="px-3 py-2 bg-green-600 text-white rounded text-sm font-medium hover:bg-green-700 disabled:opacity-40"
          >
            {adding ? 'Cancel' : '+ Add delivery module'}
          </button>
          {selectedVersion?.status === 'draft' && (
            <button
              type="button"
              disabled={publishing || rows.length === 0}
              onClick={() => void publishSelectedVersion()}
              className="px-3 py-2 bg-blue-700 text-white rounded text-sm font-medium hover:bg-blue-800 disabled:opacity-40"
            >
              {publishing ? 'Publishing…' : 'Publish version'}
            </button>
          )}
        </div>
      </div>
      <label className="mb-3 block text-xs font-medium text-gray-700">
        Selected program version
        <select
          value={selectedVersionId}
          onChange={(event) => {
            loadGeneration.current += 1;
            setSelectedVersionId(event.target.value);
            setRows([]);
            setCheckinTemplates([]);
            setEditingId(null);
            setAdding(false);
          }}
          className="mt-1 block w-full max-w-md border border-gray-300 rounded px-2 py-1"
        >
          <option value="">Choose a version</option>
          <option value="unversioned">Unversioned rows</option>
          {versions.map((version) => (
            <option key={version.id} value={version.id}>
              {version.version_label || version.version_key}
              {` · ${version.status}`}
              {version.duration_days == null
                ? ''
                : ` · ${version.duration_days} days`}
            </option>
          ))}
        </select>
      </label>

      {adding && selectedVersionId && (
        <div className="mb-3">
          <DeliveryModuleForm
            initial={{
              ...emptyDeliveryModuleForm(),
              program_version_id:
                selectedVersionId === 'unversioned' ? '' : selectedVersionId,
            }}
            submitLabel="Create delivery module"
            programSlug={programSlug}
            programTitle={programTitle}
            versions={versions}
            versionRows={rows}
            durationDays={selectedVersion?.duration_days ?? null}
            checkinTemplates={checkinTemplates}
            lockedVersionId={selectedVersionId}
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

      {selectedVersion?.status === 'draft' && selectedVersionId !== 'unversioned' && (
        <section className="mb-4 rounded border border-gray-200 p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-gray-900">Check-in templates</h3>
            <button type="button" disabled={selectedVersion.duration_days == null} className="text-xs text-blue-700 hover:underline disabled:text-gray-400" onClick={() => beginCheckinEdit()}>
              + Add check-in
            </button>
          </div>
          {selectedVersion.duration_days == null && (
            <p className="mb-2 text-xs text-amber-700">
              Scheduled check-ins require a version duration. Create a new draft with a duration in days.
              Published versions cannot be changed.
            </p>
          )}
          {checkinTemplates.length === 0 && <p className="text-xs text-gray-600">No check-ins are authored for this version.</p>}
          <ul className="divide-y divide-gray-100">
            {checkinTemplates.map((template) => (
              <li key={template.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                <span>Day {template.checkin_day}: {template.title} <span className="text-xs text-gray-500">({template.status})</span></span>
                <button type="button" className="text-xs text-blue-700 hover:underline" onClick={() => beginCheckinEdit(template)}>Edit</button>
              </li>
            ))}
          </ul>
          {checkinDraft && (
            <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
              <label className="text-xs">Day<input type="number" min="1" max={selectedVersion.duration_days ?? undefined} value={checkinDraft.checkin_day} onChange={(e) => setCheckinDraft({ ...checkinDraft, checkin_day: e.target.value })} className={`${LIGHT_CONTROL_SM_CLASS} mt-1`} /></label>
              <label className="text-xs">Title<input value={checkinDraft.title} onChange={(e) => setCheckinDraft({ ...checkinDraft, title: e.target.value })} className={`${LIGHT_CONTROL_SM_CLASS} mt-1`} /></label>
              <label className="text-xs">Description<textarea value={checkinDraft.description} onChange={(e) => setCheckinDraft({ ...checkinDraft, description: e.target.value })} className={`${LIGHT_CONTROL_SM_CLASS} mt-1`} /></label>
              <label className="text-xs">Prompt<textarea value={checkinDraft.prompt_md} onChange={(e) => setCheckinDraft({ ...checkinDraft, prompt_md: e.target.value })} className={`${LIGHT_CONTROL_SM_CLASS} mt-1`} /></label>
              <label className="text-xs md:col-span-2">Questions JSON<textarea rows={8} value={checkinDraft.questions_json} onChange={(e) => setCheckinDraft({ ...checkinDraft, questions_json: e.target.value })} className={`${LIGHT_CONTROL_SM_CLASS} mt-1 font-mono`} /></label>
              <div className="flex gap-2 md:col-span-2">
                <button type="button" onClick={() => void saveCheckin()} className="rounded bg-blue-700 px-3 py-1.5 text-sm text-white">Save check-in</button>
                <button type="button" onClick={() => setCheckinDraft(null)} className="rounded border border-gray-300 px-3 py-1.5 text-sm">Cancel</button>
              </div>
            </div>
          )}
        </section>
      )}

      {loading && <p className="text-sm text-gray-600">Loading…</p>}
      {error && <p className="text-sm text-red-700">{error}</p>}

      {!loading && rows.length === 0 && (
        <p className="text-sm text-gray-600 italic">
          No delivery modules yet. Add modules to this draft before publishing it.
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
                        disabled={selectedVersion?.status !== 'draft' || index === 0}
                        onClick={() => move(row.id, -1)}
                          className="px-2 py-1 text-sm font-semibold text-gray-800 hover:bg-gray-100 disabled:text-gray-300 disabled:hover:bg-white border-r border-gray-300"
                        >
                          ↑
                        </button>
                      <button
                        type="button"
                        disabled={selectedVersion?.status !== 'draft' || index === rows.length - 1}
                        onClick={() => move(row.id, 1)}
                          className="px-2 py-1 text-sm font-semibold text-gray-800 hover:bg-gray-100 disabled:text-gray-300 disabled:hover:bg-white"
                        >
                          ↓
                        </button>
                      </div>
                      <button
                        type="button"
                        disabled={selectedVersion?.status !== 'draft'}
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
                        disabled={selectedVersion?.status !== 'draft'}
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
                    programSlug={programSlug}
                    programTitle={programTitle}
                    versions={versions}
                    versionRows={rows}
                    durationDays={selectedVersion?.duration_days ?? null}
                    checkinTemplates={checkinTemplates}
                    lockedVersionId={selectedVersionId}
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

              <DeliveryModulesSection
                programId={programId}
                programSlug={tree.program.slug}
                programTitle={tree.program.title}
              />

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
