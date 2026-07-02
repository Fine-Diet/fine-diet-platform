/**
 * ModuleFieldEditor
 *
 * Renders editable fields for a single module's content based on its
 * FieldDescriptor array. Handles all scalar field types and delegates
 * string-list and object-list to repeater sub-components.
 *
 * Props:
 *   descriptors — the field descriptor array for this module type
 *   values      — current content object (may be partial/unknown)
 *   onChange    — called with (key, newValue) on every change
 */

import { useState, useEffect } from 'react';
import type { FieldDescriptor } from '@/lib/modules/fieldDescriptors';
import { ImageFieldWithPicker } from '@/components/admin/ImageFieldWithPicker';

interface Props {
  descriptors: FieldDescriptor[];
  values: Record<string, unknown>;
  onChange: (key: string, value: unknown) => void;
}

export function ModuleFieldEditor({ descriptors, values, onChange }: Props) {
  // Group fields by their group label
  const ungrouped = descriptors.filter((d) => !d.group);
  const groupNames = Array.from(
    new Set(descriptors.filter((d) => d.group).map((d) => d.group!)),
  );

  return (
    <div className="space-y-4">
      {ungrouped.map((descriptor) => (
        <FieldRow
          key={descriptor.key}
          descriptor={descriptor}
          value={values[descriptor.key]}
          onChange={(val) => onChange(descriptor.key, val)}
        />
      ))}

      {groupNames.map((groupName) => {
        const groupFields = descriptors.filter((d) => d.group === groupName);
        const defaultCollapsed = groupFields[0]?.collapsedByDefault ?? false;
        return (
          <FieldGroup
            key={groupName}
            name={groupName}
            defaultCollapsed={defaultCollapsed}
          >
            {groupFields.map((descriptor) => (
              <FieldRow
                key={descriptor.key}
                descriptor={descriptor}
                value={values[descriptor.key]}
                onChange={(val) => onChange(descriptor.key, val)}
              />
            ))}
          </FieldGroup>
        );
      })}
    </div>
  );
}

// ─── Field group (collapsible) ────────────────────────────────────────────────

function FieldGroup({
  name,
  defaultCollapsed,
  children,
}: {
  name: string;
  defaultCollapsed: boolean;
  children: React.ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  return (
    <div className="border border-gray-200 rounded-md overflow-hidden">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider hover:bg-gray-100"
      >
        {name}
        <span className="text-gray-400">{collapsed ? '▸' : '▾'}</span>
      </button>
      {!collapsed && <div className="px-4 pt-3 pb-4 space-y-4">{children}</div>}
    </div>
  );
}

// ─── Individual field row ─────────────────────────────────────────────────────

function FieldRow({
  descriptor,
  value,
  onChange,
}: {
  descriptor: FieldDescriptor;
  value: unknown;
  onChange: (val: unknown) => void;
}) {
  // image-url renders its own label (via ImageFieldWithPicker), so suppress the
  // outer label to avoid duplicating it.
  const labelRenderedByInput = descriptor.type === 'image-url';
  return (
    <div>
      {!labelRenderedByInput && (
        <div className="flex items-baseline gap-1 mb-1">
          <label className="block text-sm font-medium text-gray-700">{descriptor.label}</label>
          {descriptor.optional && (
            <span className="text-xs text-gray-400">(optional)</span>
          )}
        </div>
      )}

      <FieldInput descriptor={descriptor} value={value} onChange={onChange} />

      {descriptor.hint && (
        <p className="mt-1 text-xs text-gray-400">{descriptor.hint}</p>
      )}
    </div>
  );
}

// ─── Field input by type ──────────────────────────────────────────────────────

function FieldInput({
  descriptor,
  value,
  onChange,
}: {
  descriptor: FieldDescriptor;
  value: unknown;
  onChange: (val: unknown) => void;
}) {
  const inputClass =
    'w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500';

  switch (descriptor.type) {
    case 'text':
      return (
        <input
          type="text"
          value={typeof value === 'string' ? value : ''}
          placeholder={descriptor.placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass}
        />
      );

    case 'textarea':
      return (
        <textarea
          rows={3}
          value={typeof value === 'string' ? value : ''}
          placeholder={descriptor.placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass}
        />
      );

    case 'url':
      return (
        <input
          type="text"
          value={typeof value === 'string' ? value : ''}
          placeholder={descriptor.placeholder ?? 'https:// or /path/to/image.jpg'}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass + ' font-mono text-xs'}
        />
      );

    case 'number':
      return (
        <input
          type="number"
          value={typeof value === 'number' ? value : ''}
          placeholder={descriptor.placeholder}
          onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
          className={inputClass + ' w-32'}
        />
      );

    case 'boolean':
      return (
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={value === true}
            onChange={(e) => onChange(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-700">{descriptor.label}</span>
        </label>
      );

    case 'select':
      return (
        <select
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value || undefined)}
          className={inputClass}
        >
          {descriptor.optional && <option value="">— none —</option>}
          {(descriptor.options ?? []).map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
      );

    case 'access-code-select':
      return (
        <AccessCodeSelect
          value={typeof value === 'string' ? value : ''}
          optional={descriptor.optional}
          onChange={onChange}
        />
      );

    case 'image-slot':
      return <ImageSlotInput value={value} onChange={onChange} />;

    case 'image-url':
      return (
        <ImageFieldWithPicker
          label={descriptor.label}
          value={typeof value === 'string' ? value : ''}
          onChange={(url) => onChange(url)}
          placeholder={descriptor.placeholder ?? 'Image URL'}
        />
      );

    case 'string-list':
      return (
        <StringListInput
          value={Array.isArray(value) ? (value as string[]) : []}
          onChange={onChange}
          placeholder={descriptor.placeholder}
        />
      );

    case 'object-list':
      return (
        <ObjectListInput
          value={Array.isArray(value) ? (value as Record<string, unknown>[]) : []}
          fields={descriptor.fields ?? []}
          onChange={onChange}
        />
      );

    case 'object':
      return (
        <ObjectFieldInput
          value={value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}}
          fields={descriptor.fields ?? []}
          onChange={onChange}
        />
      );

    default:
      return (
        <p className="text-xs text-red-400">Unknown field type: {descriptor.type}</p>
      );
  }
}

// ─── Image slot sub-form ──────────────────────────────────────────────────────

function ImageSlotInput({
  value,
  onChange,
}: {
  value: unknown;
  onChange: (val: unknown) => void;
}) {
  const obj = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;

  const update = (key: string, val: string) =>
    onChange({ ...obj, [key]: val || undefined });

  const inputClass =
    'w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <div className="space-y-2 pl-3 border-l-2 border-gray-100">
      <ImageFieldWithPicker
        label="Desktop"
        value={typeof obj.desktop === 'string' ? obj.desktop : ''}
        placeholder="/images/..."
        onChange={(url) => update('desktop', url)}
      />
      <ImageFieldWithPicker
        label="Mobile"
        value={typeof obj.mobile === 'string' ? obj.mobile : ''}
        placeholder="/images/..."
        onChange={(url) => update('mobile', url)}
      />
      <div>
        <label className="block text-xs text-gray-500 mb-0.5">Alt text</label>
        <input
          type="text"
          value={typeof obj.alt === 'string' ? obj.alt : ''}
          placeholder="Descriptive alt text"
          onChange={(e) => update('alt', e.target.value)}
          className={inputClass}
        />
      </div>
    </div>
  );
}

// ─── String list repeater ─────────────────────────────────────────────────────

export function StringListInput({
  value,
  onChange,
  placeholder,
}: {
  value: string[];
  onChange: (val: unknown) => void;
  placeholder?: string;
}) {
  const items = value.length > 0 ? value : [''];

  const updateItem = (i: number, val: string) => {
    const next = [...items];
    next[i] = val;
    onChange(next.filter(Boolean));
  };

  const addItem = () => onChange([...items, '']);

  const removeItem = (i: number) => {
    const next = items.filter((_, idx) => idx !== i);
    onChange(next.length > 0 ? next : []);
  };

  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type="text"
            value={item}
            placeholder={placeholder}
            onChange={(e) => updateItem(i, e.target.value)}
            className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="button"
            onClick={() => removeItem(i)}
            className="text-gray-400 hover:text-red-500 text-sm flex-shrink-0"
            aria-label="Remove item"
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={addItem}
        className="text-xs text-blue-600 hover:text-blue-800 font-medium"
      >
        + Add item
      </button>
    </div>
  );
}

// ─── Object list repeater ─────────────────────────────────────────────────────

export function ObjectListInput({
  value,
  fields,
  onChange,
}: {
  value: Record<string, unknown>[];
  fields: FieldDescriptor[];
  onChange: (val: unknown) => void;
}) {
  const items = value.length > 0 ? value : [];

  const updateItem = (i: number, key: string, val: unknown) => {
    const next = items.map((item, idx) =>
      idx === i ? { ...item, [key]: val } : item,
    );
    onChange(next);
  };

  const addItem = () => {
    onChange([...items, {}]);
  };

  const removeItem = (i: number) => {
    onChange(items.filter((_, idx) => idx !== i));
  };

  const moveItem = (i: number, dir: 'up' | 'down') => {
    const next = [...items];
    const swap = dir === 'up' ? i - 1 : i + 1;
    if (swap < 0 || swap >= next.length) return;
    [next[i], next[swap]] = [next[swap], next[i]];
    onChange(next);
  };

  return (
    <div className="space-y-3">
      {items.map((item, i) => (
        <ObjectListItem
          key={i}
          index={i}
          total={items.length}
          item={item}
          fields={fields}
          onUpdate={(key, val) => updateItem(i, key, val)}
          onRemove={() => removeItem(i)}
          onMove={(dir) => moveItem(i, dir)}
        />
      ))}
      <button
        type="button"
        onClick={addItem}
        className="text-xs text-blue-600 hover:text-blue-800 font-medium"
      >
        + Add item
      </button>
    </div>
  );
}

function ObjectListItem({
  index,
  total,
  item,
  fields,
  onUpdate,
  onRemove,
  onMove,
}: {
  index: number;
  total: number;
  item: Record<string, unknown>;
  fields: FieldDescriptor[];
  onUpdate: (key: string, val: unknown) => void;
  onRemove: () => void;
  onMove: (dir: 'up' | 'down') => void;
}) {
  const [collapsed, setCollapsed] = useState(index > 0);

  // Preview label: first text-like field value or "Item N"
  const previewField = fields.find((f) =>
    ['text', 'textarea'].includes(f.type),
  );
  const previewText =
    previewField && typeof item[previewField.key] === 'string'
      ? (item[previewField.key] as string).substring(0, 50)
      : `Item ${index + 1}`;

  return (
    <div className="border border-gray-200 rounded-md overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50">
        {/* Reorder */}
        <div className="flex flex-col gap-0.5 flex-shrink-0">
          <button
            type="button"
            onClick={() => onMove('up')}
            disabled={index === 0}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-20 text-xs leading-none"
          >▲</button>
          <button
            type="button"
            onClick={() => onMove('down')}
            disabled={index === total - 1}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-20 text-xs leading-none"
          >▼</button>
        </div>

        {/* Preview + collapse toggle */}
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="flex-1 text-left text-sm text-gray-700 truncate"
        >
          {previewText}
        </button>

        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="text-gray-400 text-xs flex-shrink-0"
        >
          {collapsed ? '▸' : '▾'}
        </button>

        <button
          type="button"
          onClick={onRemove}
          className="text-gray-400 hover:text-red-500 text-xs flex-shrink-0"
          aria-label="Remove"
        >
          ✕
        </button>
      </div>

      {!collapsed && (
        <div className="px-4 pt-3 pb-4 space-y-4">
          {fields.map((field) => (
            <FieldRow
              key={field.key}
              descriptor={field}
              value={item[field.key]}
              onChange={(val) => onUpdate(field.key, val)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Singleton object sub-form ────────────────────────────────────────────────

function ObjectFieldInput({
  value,
  fields,
  onChange,
}: {
  value: Record<string, unknown>;
  fields: FieldDescriptor[];
  onChange: (val: unknown) => void;
}) {
  const update = (key: string, val: unknown) => onChange({ ...value, [key]: val });

  return (
    <div className="space-y-4 pl-3 border-l-2 border-gray-100">
      {fields.map((field) => (
        <FieldRow
          key={field.key}
          descriptor={field}
          value={value[field.key]}
          onChange={(val) => update(field.key, val)}
        />
      ))}
    </div>
  );
}

// ─── Access code selector (dynamic, frontend-safe) ───────────────────────────
//
// Populated from GET /api/admin/access-codes/options, which returns ONLY the
// non-secret `code_key`, `label`, `status`, and `offer_key`. No hashes, IDs,
// or raw codes ever reach this selector. Editors bind a gate to a code by its
// code_key; the raw code is managed in /admin/access-codes.

interface AccessCodeOption {
  code_key: string | null;
  label: string | null;
  status: string;
  offer_key: string | null;
}

function AccessCodeSelect({
  value,
  optional,
  onChange,
}: {
  value: string;
  optional?: boolean;
  onChange: (val: unknown) => void;
}) {
  const [options, setOptions] = useState<AccessCodeOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/access-codes/options');
        if (!res.ok) throw new Error('Failed to load access codes');
        const data = await res.json();
        if (!cancelled) setOptions(data.options ?? []);
      } catch (err) {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Load failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const inputClass =
    'w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500';

  if (loading) {
    return <p className="text-xs text-gray-400">Loading access codes…</p>;
  }
  if (loadError) {
    return (
      <div className="space-y-1">
        <p className="text-xs text-red-500">{loadError}</p>
        <p className="text-xs text-gray-400">
          You can still type a code_key manually. Manage codes in /admin/access-codes.
        </p>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value || undefined)}
          placeholder="code_key"
          className={inputClass + ' font-mono text-xs'}
        />
      </div>
    );
  }

  const known = options.some((o) => o.code_key === value);
  return (
    <div className="space-y-1">
      <select
        value={known ? value : '__custom'}
        onChange={(e) => {
          if (e.target.value === '__custom') return;
          onChange(e.target.value || undefined);
        }}
        className={inputClass}
      >
        {optional && <option value="">— none —</option>}
        {options.map((o) => (
          <option key={o.code_key} value={o.code_key ?? ''}>
            {o.label ? `${o.label} (${o.code_key})` : o.code_key}
            {o.status !== 'active' ? ` — ${o.status}` : ''}
          </option>
        ))}
        {/* Preserve a previously-authored code_key that is no longer offered
            (e.g. paused/archived) so it is not silently dropped on edit. */}
        {value && !known && <option value="__custom">{value} (not selectable)</option>}
      </select>
      {value && !known && (
        <p className="text-xs text-amber-600">
          “{value}” is not currently offered (it may be paused, expired, archived, or missing a
          code_key). Re-select an active code or update it in /admin/access-codes.
        </p>
      )}
      {options.length === 0 && (
        <p className="text-xs text-gray-400">
          No selectable access codes yet. Create one in /admin/access-codes.
        </p>
      )}
    </div>
  );
}
