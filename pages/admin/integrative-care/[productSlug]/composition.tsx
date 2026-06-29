/**
 * Admin: /admin/integrative-care/[productSlug]/composition
 *
 * Full composition editor:
 * - Ordered module list with reorder/remove
 * - Inline ModuleContentPanel for field editing (click "Edit fields")
 * - Add module from registered types
 * - Save as draft
 * - Publish composition (promotes draft → published, revalidates public page)
 */

import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { ModuleContentPanel } from '@/components/admin/ModuleContentPanel';
import { ModuleChromePanel } from '@/components/admin/ModuleChromePanel';
import { getCurrentUserWithRoleFromSSR } from '@/lib/authServer';
import {
  getIntegrativeCareProductRecord,
  getIntegrativeCareComposition,
  type IntegrativeCareProduct,
} from '@/lib/integrativeCareApi';
import type { PageComposition, ModuleInstance } from '@/lib/modules/types';
import type { ModuleChrome } from '@/lib/modules/sectionChrome';
import {
  inspectModules,
  type LooseModule,
  type ModuleValidity,
} from '@/lib/modules/compositionValidation';
import { MODULE_REGISTRY } from '@/lib/modules/registry';
import { getModuleResolverSlugWarnings } from '@/lib/modules/resolverSlugWarnings';
import {
  START_RUNTIME_MODULE_TYPE_KEYS,
  createStartRuntimeModuleStarterContent,
  getStartRuntimeModuleTaxonomy,
  type StartRuntimeModuleBank,
  type StartRuntimeModuleTypeKey,
} from '@/lib/startPages/startRuntimeModules';

interface Props {
  product: IntegrativeCareProduct;
  composition: PageComposition;
}

const ALL_MODULE_TYPES = Object.keys(MODULE_REGISTRY) as string[];
const SHARED_PATHWAY_MODULE_TYPES = START_RUNTIME_MODULE_TYPE_KEYS.filter((type) =>
  ALL_MODULE_TYPES.includes(type),
) as string[];
const OTHER_MODULE_TYPES = ALL_MODULE_TYPES.filter(
  (type) => !SHARED_PATHWAY_MODULE_TYPES.includes(type),
);
const DEFAULT_MODULE_TYPE = SHARED_PATHWAY_MODULE_TYPES[0] ?? ALL_MODULE_TYPES[0] ?? '';

const BANK_LABELS: Record<StartRuntimeModuleBank, string> = {
  start: 'Start',
  programs: 'Programs',
  'integrative-care': 'Integrative Care',
  offer: 'Offers',
};

function isSharedPathwayModuleType(type: string): type is StartRuntimeModuleTypeKey {
  return (START_RUNTIME_MODULE_TYPE_KEYS as readonly string[]).includes(type);
}

function moduleLabel(type: string) {
  if (isSharedPathwayModuleType(type)) {
    return getStartRuntimeModuleTaxonomy(type)?.label ?? type;
  }
  const parts = type.split('.');
  const version = parts.pop();
  const label = parts.join(' — ').replace(/-/g, ' ');
  return `${label} (${version})`;
}

function moduleDescription(type: string): string | undefined {
  return isSharedPathwayModuleType(type) ? getStartRuntimeModuleTaxonomy(type)?.description : undefined;
}

function moduleUsefulness(type: string): string | undefined {
  if (!isSharedPathwayModuleType(type)) return undefined;
  return getStartRuntimeModuleTaxonomy(type)?.usefulFor.map((bank) => BANK_LABELS[bank]).join(', ');
}

function starterContentFor(type: string): Record<string, unknown> {
  return isSharedPathwayModuleType(type) ? createStartRuntimeModuleStarterContent(type) : {};
}

export default function IntegrativeCareCompositionEditor({ product, composition: initial }: Props) {
  const slug = product.productSlug;
  const [modules, setModules] = useState<LooseModule[]>(
    initial.modules as unknown as LooseModule[],
  );
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [saved, setSaved] = useState(false);
  const [published, setPublished] = useState(false);
  const [error, setError] = useState('');
  const [addType, setAddType] = useState<string>(DEFAULT_MODULE_TYPE);

  // Live per-module validity, matching the Programs composition editor. This
  // keeps incomplete modules visible and explains what would fail before publish.
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
    const stub: LooseModule = { id, type: addType, content: starterContentFor(addType) };
    setModules((prev) => [...prev, stub]);
    setEditingIndex(modules.length); // open editor on the new module
    setSaved(false);
    setPublished(false);
  }

  // Called by ModuleContentPanel "Apply" — updates module content in local state
  function handleContentSave(index: number, updatedContent: Record<string, unknown>) {
    setModules((prev) =>
      prev.map((mod, i) =>
        i === index ? { ...mod, content: updatedContent } : mod,
      ),
    );
    setSaved(false);
    setPublished(false);
  }

  function handleChromeChange(index: number, chrome: ModuleChrome | undefined) {
    setModules((prev) =>
      prev.map((mod, i) => {
        if (i !== index) return mod;
        const next = { ...mod };
        if (chrome) next.chrome = chrome;
        else delete next.chrome;
        return next;
      }),
    );
    setSaved(false);
    setPublished(false);
  }

  // ── Persist operations ─────────────────────────────────────────────────────

  async function handleSaveDraft() {
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const payload: PageComposition = { ...initial, modules: modules as unknown as ModuleInstance[] };
      const res = await fetch(`/api/admin/integrative-care/${slug}/composition`, {
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
    if (!window.confirm('Publish this composition? It will go live immediately.')) return;
    setPublishing(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/integrative-care/${slug}/publish-composition`, {
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
          <Link href="/admin/integrative-care" className="hover:text-gray-700">Integrative Care</Link>
          {' / '}
          <Link href={`/admin/integrative-care/${slug}`} className="hover:text-gray-700 font-mono">
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
              href={`/admin/integrative-care/${slug}/preview`}
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
            Draft saved. Click <strong>Publish</strong> to make it live.
          </div>
        )}
        {published && (
          <div className="mb-5 rounded-md bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
            Published. The public page has been revalidated.
          </div>
        )}

        {/* Module list */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-4 overflow-hidden">
          {modules.length === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-gray-400">
              No modules. Add one below.
            </div>
          ) : (
            <ul className="divide-y divide-gray-100">
              {modules.map((mod, i) => {
                const usefulFor = moduleUsefulness(mod.type);
                const moduleValidity = validity[i];
                const isInvalid = moduleValidity ? !moduleValidity.valid : false;
                const slugWarnings = getModuleResolverSlugWarnings(
                  mod.type,
                  mod.content as unknown as Record<string, unknown>,
                );
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
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                        <span className="font-mono text-gray-400 truncate">{mod.id}</span>
                        {usefulFor && <span className="text-gray-400">Also useful for: {usefulFor}</span>}
                      </div>
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

                  {/* Resolver-slug prerequisite warning (placeholder/empty slug) */}
                  {slugWarnings.length > 0 && (
                    <div className="mx-5 mb-3 rounded-md border border-orange-200 bg-orange-50 px-3 py-2">
                      <p className="text-xs font-semibold text-orange-800">
                        Data prerequisite: this resolver-driven section needs a real slug.
                      </p>
                      <ul className="mt-1 space-y-0.5">
                        {slugWarnings.map((warning) => (
                          <li key={warning.field} className="text-xs text-orange-700">
                            {warning.message}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Inline field editor panel */}
                  {editingIndex === i && (
                    <div className="px-5 pb-4 space-y-3">
                      <ModuleContentPanel
                        moduleType={mod.type}
                        moduleId={mod.id}
                        initialContent={mod.content as unknown as Record<string, unknown>}
                        validationIssues={moduleValidity?.issues ?? []}
                        onSave={(updatedContent) => handleContentSave(i, updatedContent)}
                        onClose={() => setEditingIndex(null)}
                      />
                      <ModuleChromePanel
                        chrome={mod.chrome}
                        onChange={(chrome) => handleChromeChange(i, chrome)}
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
              {SHARED_PATHWAY_MODULE_TYPES.length > 0 && (
                <optgroup label="Shared pathway modules">
                  {SHARED_PATHWAY_MODULE_TYPES.map((type) => (
                    <option key={type} value={type}>{moduleLabel(type)}</option>
                  ))}
                </optgroup>
              )}
              {OTHER_MODULE_TYPES.length > 0 && (
                <optgroup label="Other runtime modules">
                  {OTHER_MODULE_TYPES.map((type) => (
                    <option key={type} value={type}>{moduleLabel(type)}</option>
                  ))}
                </optgroup>
              )}
            </select>
            <button
              type="button"
              onClick={addModule}
              className="px-4 py-2 bg-gray-800 text-white text-sm font-medium rounded-md hover:bg-gray-700 transition-colors"
            >
              Add
            </button>
          </div>
          {moduleDescription(addType) && (
            <p className="mt-2 rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-500">
              {moduleDescription(addType)}
            </p>
          )}
          <p className="mt-2 text-xs text-gray-400">
            Shared pathway modules start with editable starter content. Other modules may still start empty.
          </p>
        </div>

      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  const user = await getCurrentUserWithRoleFromSSR(context);
  if (!user || (user.role !== 'editor' && user.role !== 'admin')) {
    return { redirect: { destination: '/admin', permanent: false } };
  }

  const slug = context.params?.productSlug as string;

  const [product, composition] = await Promise.all([
    (async () =>
      (await getIntegrativeCareProductRecord(slug, 'draft')) ??
      (await getIntegrativeCareProductRecord(slug, 'published')))(),
    (async () =>
      (await getIntegrativeCareComposition(slug, 'draft')) ??
      (await getIntegrativeCareComposition(slug, 'published')))(),
  ]);

  if (!product || !composition) return { notFound: true };

  return { props: { product, composition } };
};
