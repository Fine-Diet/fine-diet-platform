/**
 * ModuleContentPanel
 *
 * Wrapper for editing a single module instance's content fields.
 * Looks up the field descriptors for the module type, renders ModuleFieldEditor,
 * manages local draft state, and exposes an onSave callback.
 *
 * Props:
 *   moduleType   — the module type key (e.g. "hero.offer-blur.v1")
 *   moduleId     — the module instance id (for display only)
 *   initialContent — the current content object from the composition
 *   onSave       — called with the updated content object when the user saves
 *   onClose      — called when the panel should be dismissed
 */

import { useState } from 'react';
import { ModuleFieldEditor } from '@/components/admin/ModuleFieldEditor';
import { MODULE_FIELD_DESCRIPTORS } from '@/lib/modules/fieldDescriptors';

interface Props {
  moduleType: string;
  moduleId: string;
  initialContent: Record<string, unknown>;
  onSave: (updatedContent: Record<string, unknown>) => void;
  onClose: () => void;
}

export function ModuleContentPanel({
  moduleType,
  moduleId,
  initialContent,
  onSave,
  onClose,
}: Props) {
  const descriptors = MODULE_FIELD_DESCRIPTORS[moduleType];
  const [content, setContent] = useState<Record<string, unknown>>(initialContent);
  const [dirty, setDirty] = useState(false);

  const handleChange = (key: string, value: unknown) => {
    setContent((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const handleSave = () => {
    onSave(content);
    setDirty(false);
  };

  if (!descriptors) {
    return (
      <div className="border border-amber-200 bg-amber-50 rounded-md p-4 text-sm text-amber-700">
        <strong>No field editor available for "{moduleType}".</strong>
        <p className="mt-1 text-xs text-amber-600">
          Add a descriptor to <code>lib/modules/fieldDescriptors.ts</code> for this module type.
        </p>
      </div>
    );
  }

  return (
    <div className="border border-blue-200 rounded-lg bg-white overflow-hidden">
      {/* Panel header */}
      <div className="flex items-center justify-between px-4 py-3 bg-blue-50 border-b border-blue-100">
        <div>
          <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider">
            {moduleType}
          </p>
          <p className="text-xs font-mono text-blue-400 mt-0.5">{moduleId}</p>
        </div>
        <div className="flex items-center gap-2">
          {dirty && (
            <span className="text-xs text-amber-600 font-medium">Unsaved changes</span>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty}
            className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-md hover:bg-blue-700 disabled:opacity-40 transition-colors"
          >
            Apply
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-gray-500 text-xs font-medium hover:text-gray-700"
          >
            Close
          </button>
        </div>
      </div>

      {/* Field editor */}
      <div className="px-4 py-4">
        <ModuleFieldEditor
          descriptors={descriptors}
          values={content}
          onChange={handleChange}
        />
      </div>
    </div>
  );
}
