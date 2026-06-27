/**
 * Admin: /admin/programs-marketing/[slug]/composition
 *
 * Full composition editor:
 * - Ordered module list with reorder/remove
 * - Inline ModuleContentPanel for field editing
 * - Add module from registered types
 * - Save as draft
 * - Publish composition (promotes draft → published, revalidates public page)
 *
 * Admin-only. Unlike Integrative Care, creating a Programs record does not
 * scaffold a composition, so this editor starts from an EMPTY composition when
 * none exists yet. The public page only renders this composition once BOTH the
 * composition and the product record are published (publish gate).
 */

import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { ModuleContentPanel } from '@/components/admin/ModuleContentPanel';
import { getCurrentUserWithRoleFromSSR } from '@/lib/authServer';
import {
  getProgramsMarketingProductRecord,
  getProgramsMarketingCompositionForEditing,
  compositionKey,
  type ProgramsMarketingProduct,
} from '@/lib/programs/programsMarketingApi';
import type { PageComposition } from '@/lib/modules/types';
import {
  inspectModules,
  type LooseModule,
  type ModuleValidity,
} from '@/lib/modules/compositionValidation';
import {
  listProgramsTemplateOptions,
  getProgramsCompositionTemplate,
  instantiateTemplateModules,
} from '@/lib/modules/compositionTemplates';
import { MODULE_REGISTRY } from '@/lib/modules/registry';

/** Editor composition shape: modules are preserved loosely (never dropped). */
interface EditorComposition {
  key: string;
  version?: number;
  modules: LooseModule[];
}

interface Props {
  product: ProgramsMarketingProduct;
  composition: EditorComposition;
}

const ALL_MODULE_TYPES = Object.keys(MODULE_REGISTRY) as string[];
const TEMPLATE_OPTIONS = listProgramsTemplateOptions();

function moduleLabel(type: string) {
  const parts = type.split('.');
  const version = parts.pop();
  const label = parts.join(' — ').replace(/-/g, ' ');
  return `${label} (${version})`;
}

export default function ProgramsMarketingCompositionEditor({ product, composition: initial }: Props) {
  const slug = product.slug;
  const [modules, setModules] = useState<LooseModule[]>(initial.modules);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [published, setPublished] = useState(false);
  const [error, setError] = useState('');
  const [addType, setAddType] = useState<string>(ALL_MODULE_TYPES[0] ?? '');
  const [templateId, setTemplateId] = useState<string>(TEMPLATE_OPTIONS[0]?.id ?? '');

  // Live per-module validity (parallel to `modules`). Recomputed on every edit
  // so badges/reasons update without a save. Same schemas as the loader, so the
  // editor explains exactly what would be dropped on publish/render.
  const validity = useMemo<ModuleValidity[]>(() => inspectModules(modules), [modules]);
  const invalidCount = validity.filter((v) => !v.valid).length;

  // ── Module list operations ──────────────────────────────────────────────────

  function move(index: number, direction: 'up' | 'down') {
    const next = [...modules];
    const swap = direction === 'up' ? index - 1 : index + 1;
    if (swap < 0 || swap >= next.length) return;
    [next[index], next[swap]] = [next[swap], next[index]];
    setModules(next);
    setSaved(false);
    setPublished(false);
    if (editingIndex === index) setEditingIndex(swap);
    else if (editingIndex === swap) setEditingIndex(index);
  }

  function remove(index: number) {
    if (!window.confirm('Remove this module?')) return;
    setModules((prev) => prev.filter((_, i) => i !== index));
    if (editingIndex === index) setEditingIndex(null);
    setSaved(false);
    setPublished(false);
  }

  function addModule() {
    if (!addType) return;
    const id = `${addType}-${Date.now()}`;
    const stub: LooseModule = { id, type: addType, content: {} };
    setModules((prev) => [...prev, stub]);
    setEditingIndex(modules.length); // open editor on the new module
    setSaved(false);
    setPublished(false);
  }

  function handleContentSave(index: number, updatedContent: Record<string, unknown>) {
    setModules((prev) =>
      prev.map((mod, i) => (i === index ? { ...mod, content: updatedContent } : mod)),
    );
    setSaved(false);
    setPublished(false);
  }

  /**
   * Apply a code-backed starting template into the editor draft. Applying to a
   * NON-EMPTY composition replaces the current modules and therefore requires an
   * explicit confirmation. This only changes editor state — nothing is persisted
   * until the admin clicks Save draft (existing flow), so existing drafts /
   * published pages are never changed automatically.
   */
  function applyTemplate() {
    if (!templateId) return;
    const template = getProgramsCompositionTemplate(templateId);
    if (!template) {
      setError('Unknown template.');
      return;
    }
    if (modules.length > 0) {
      const confirmed = window.confirm(
        `Replace the current ${modules.length} module${
          modules.length === 1 ? '' : 's'
        } with the "${template.name}" template?\n\n` +
          'This only changes the editor. Nothing is saved until you click "Save draft".',
      );
      if (!confirmed) return;
    }
    setModules(instantiateTemplateModules(template));
    setEditingIndex(null);
    setSaved(false);
    setPublished(false);
    setError('');
  }

  // ── Persist operations ─────────────────────────────────────────────────────

  async function handleSaveDraft() {
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const payload = {
        key: initial.key,
        version: initial.version,
        modules,
      } as unknown as PageComposition;
      const res = await fetch(`/api/admin/programs-marketing/${slug}/composition`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!json.success) { setError(json.error ?? 'Save failed'); return; }
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish() {
    if (!saved) {
      setError('Save as draft first, then publish.');
      return;
    }
    if (invalidCount > 0) {
      setError(
        `${invalidCount} module${invalidCount === 1 ? '' : 's'} have invalid content. ` +
          'Fix the highlighted modules before publishing — invalid modules would be dropped from the live page.',
      );
      return;
    }
    if (!window.confirm('Publish this composition? The product record must also be published for it to go live.')) return;
    setPublishing(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/programs-marketing/${slug}/publish-composition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (!json.success) { setError(json.error ?? 'Publish failed'); return; }
      setPublished(true);
    } finally {
      setPublishing(false);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <>
      <Head>
        <title>Composition — {product.title || slug} · Admin</title>
      </Head>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-10">

        {/* Breadcrumb */}
        <div className="mb-6 text-sm text-gray-500">
          <Link href="/admin/programs-marketing" className="hover:text-gray-700">Programs Marketing</Link>
          {' / '}
          <Link href={`/admin/programs-marketing/${slug}`} className="hover:text-gray-700 font-mono">
            {slug}
          </Link>
          {' / '}
          <span className="text-gray-700">Composition</span>
        </div>

        {/* Header */}
        <div className="mb-6 flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-2xl font-bold text-gray-900">Composition</h1>
          <div className="flex items-center gap-3">
            <a
              href={`/admin/programs-marketing/${slug}/preview`}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Preview ↗
            </a>
            <button
              type="button"
              onClick={handleSaveDraft}
              disabled={saving}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-40 transition-colors"
            >
              {saving ? 'Saving…' : 'Save draft'}
            </button>
            <button
              type="button"
              onClick={handlePublish}
              disabled={publishing || !saved || invalidCount > 0}
              className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-md hover:bg-green-700 disabled:opacity-40 transition-colors"
              title={
                !saved
                  ? 'Save draft first'
                  : invalidCount > 0
                    ? 'Fix invalid modules before publishing'
                    : ''
              }
            >
              {publishing ? 'Publishing…' : 'Publish'}
            </button>
          </div>
        </div>

        {/* Status messages */}
        {error && (
          <div className="mb-5 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
        {invalidCount > 0 && (
          <div className="mb-5 rounded-md bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
            <strong>
              {invalidCount} module{invalidCount === 1 ? '' : 's'} need attention.
            </strong>{' '}
            Modules with invalid content stay editable here, but they are dropped
            from the live page on render. Fix them before publishing — open
            “Edit fields” on each highlighted module to see why.
          </div>
        )}
        {saved && !published && (
          <div className="mb-5 rounded-md bg-blue-50 border border-blue-200 px-4 py-3 text-sm text-blue-700">
            Draft saved. Click <strong>Publish</strong> to publish the composition (the product
            record must also be published for the public page to switch over).
          </div>
        )}
        {published && (
          <div className="mb-5 rounded-md bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
            Composition published. The public page has been revalidated and will switch over once
            the product record is also published.
          </div>
        )}

        {/* Start from template */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 mb-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-1">Start from template</h2>
          <p className="text-xs text-gray-500 mb-3">
            Populate the editor with a known-good starting layout. Applying to a
            non-empty composition replaces the current modules (with confirmation).
            Nothing is saved until you click <strong>Save draft</strong>.
          </p>
          <div className="flex items-center gap-3">
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="flex-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {TEMPLATE_OPTIONS.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.recommended ? '★ ' : ''}
                  {t.name} ({t.moduleCount} module{t.moduleCount === 1 ? '' : 's'})
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={applyTemplate}
              className="px-4 py-2 bg-gray-800 text-white text-sm font-medium rounded-md hover:bg-gray-700 transition-colors whitespace-nowrap"
            >
              {modules.length > 0 ? 'Replace with template' : 'Use template'}
            </button>
          </div>
          {TEMPLATE_OPTIONS.find((t) => t.id === templateId)?.description && (
            <p className="text-xs text-gray-400 mt-2">
              {TEMPLATE_OPTIONS.find((t) => t.id === templateId)?.description}
            </p>
          )}
        </div>

        {/* Module list */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-4 overflow-hidden">
          {modules.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-gray-400">
              No modules yet. Add one below, or start from a template above.
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {modules.map((mod, i) => {
                const moduleValidity = validity[i];
                const isInvalid = moduleValidity ? !moduleValidity.valid : false;
                return (
                <li key={mod.id} className={isInvalid ? 'bg-amber-50/60' : undefined}>
                  {/* Module row */}
                  <div className="flex items-center gap-3 px-5 py-3">
                    {/* Reorder */}
                    <div className="flex flex-col gap-0.5 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => move(i, 'up')}
                        disabled={i === 0}
                        className="text-gray-400 hover:text-gray-600 disabled:opacity-20 text-xs leading-none"
                        aria-label="Move up"
                      >▲</button>
                      <button
                        type="button"
                        onClick={() => move(i, 'down')}
                        disabled={i === modules.length - 1}
                        className="text-gray-400 hover:text-gray-600 disabled:opacity-20 text-xs leading-none"
                        aria-label="Move down"
                      >▼</button>
                    </div>

                    {/* Position */}
                    <span className="w-6 text-center text-xs font-mono text-gray-400 flex-shrink-0">
                      {i + 1}
                    </span>

                    {/* Type info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900 truncate">
                          {moduleLabel(mod.type)}
                        </span>
                        {moduleValidity && (
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                              moduleValidity.valid
                                ? 'bg-green-100 text-green-700'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                            title={
                              moduleValidity.valid
                                ? 'Renders on the live page'
                                : moduleValidity.issues.map((x) => `${x.path}: ${x.message}`).join('\n')
                            }
                          >
                            {moduleValidity.valid
                              ? 'Valid'
                              : moduleValidity.unknownType
                                ? 'Unknown type'
                                : 'Invalid'}
                          </span>
                        )}
                      </div>
                      <div className="text-xs font-mono text-gray-400 truncate">{mod.id}</div>
                    </div>

                    {/* Actions */}
                    <button
                      type="button"
                      onClick={() => setEditingIndex(editingIndex === i ? null : i)}
                      className={`text-xs font-medium flex-shrink-0 px-2 py-1 rounded ${
                        editingIndex === i
                          ? 'bg-blue-100 text-blue-700'
                          : 'text-blue-600 hover:text-blue-800'
                      }`}
                    >
                      {editingIndex === i ? 'Close' : 'Edit fields'}
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(i)}
                      className="text-xs text-red-400 hover:text-red-600 font-medium flex-shrink-0"
                    >
                      Remove
                    </button>
                  </div>

                  {/* Inline field editor panel */}
                  {editingIndex === i && (
                    <div className="px-5 pb-4">
                      <ModuleContentPanel
                        moduleType={mod.type}
                        moduleId={mod.id}
                        initialContent={mod.content as unknown as Record<string, unknown>}
                        validationIssues={moduleValidity?.issues ?? []}
                        onSave={(updatedContent) => handleContentSave(i, updatedContent)}
                        onClose={() => setEditingIndex(null)}
                      />
                    </div>
                  )}
                </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Add module */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Add module</h2>
          <div className="flex items-center gap-3">
            <select
              value={addType}
              onChange={(e) => setAddType(e.target.value)}
              className="flex-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {ALL_MODULE_TYPES.map((t) => (
                <option key={t} value={t}>{moduleLabel(t)}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={addModule}
              className="px-4 py-2 bg-gray-800 text-white text-sm font-medium rounded-md hover:bg-gray-700 transition-colors"
            >
              Add
            </button>
          </div>
          <p className="mt-2 text-xs text-gray-400">
            New modules start empty. Use "Edit fields" to fill in content, then Save draft.
          </p>
        </div>

      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  const user = await getCurrentUserWithRoleFromSSR(context);
  if (!user || user.role !== 'admin') {
    return { redirect: { destination: '/admin', permanent: false } };
  }

  const slug = context.params?.slug as string;

  const [product, inspected] = await Promise.all([
    (async () =>
      (await getProgramsMarketingProductRecord(slug, 'draft')) ??
      (await getProgramsMarketingProductRecord(slug, 'published')))(),
    // Non-destructive authoring load: preserves partial/invalid modules so they
    // stay editable instead of disappearing on reload.
    (async () =>
      (await getProgramsMarketingCompositionForEditing(slug, 'draft')) ??
      (await getProgramsMarketingCompositionForEditing(slug, 'published')))(),
  ]);

  if (!product) return { notFound: true };

  // Create does not scaffold a composition — start empty when none exists yet.
  const composition: EditorComposition = inspected
    ? { key: inspected.key, version: inspected.version, modules: inspected.modules }
    : { key: compositionKey(slug), version: 1, modules: [] };

  return { props: { product, composition } };
};
