/**
 * Admin: /admin/module-metadata
 *
 * Edits human-facing module discovery metadata only: nicknames, finder
 * descriptions, aliases, tags, and preview hints. This does not edit runtime
 * schemas, components, billing, entitlements, or app/user truth.
 */

import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

import { getCurrentUserWithRoleFromSSR } from '@/lib/authServer';
import type {
  ModuleDiscoveryMetadata,
  ModuleDiscoveryMetadataMap,
  ModulePreviewMode,
} from '@/lib/moduleDiscoveryMetadata';

interface Props {
  userRole: 'editor' | 'admin';
}

interface ModuleAdminItem {
  slug: string;
  name: string;
  category: string;
  lifecycle: string;
  defaultMetadata: ModuleDiscoveryMetadata;
  overrideMetadata: ModuleDiscoveryMetadata;
}

interface DraftFields {
  humanNickname: string;
  finderDescription: string;
  searchAliases: string;
  tags: string;
  previewMode: ModulePreviewMode | '';
  runtimeKey: string;
}

const EMPTY_DRAFT: DraftFields = {
  humanNickname: '',
  finderDescription: '',
  searchAliases: '',
  tags: '',
  previewMode: '',
  runtimeKey: '',
};

function toDraft(metadata?: ModuleDiscoveryMetadata): DraftFields {
  return {
    humanNickname: metadata?.humanNickname ?? '',
    finderDescription: metadata?.finderDescription ?? '',
    searchAliases: (metadata?.searchAliases ?? []).join('\n'),
    tags: (metadata?.tags ?? []).join('\n'),
    previewMode: metadata?.previewMode ?? '',
    runtimeKey: metadata?.runtimeKey ?? '',
  };
}

function splitList(value: string): string[] | undefined {
  const items = value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
  return items.length > 0 ? items : undefined;
}

function draftToMetadata(draft: DraftFields): ModuleDiscoveryMetadata {
  const metadata: ModuleDiscoveryMetadata = {};
  if (draft.humanNickname.trim()) metadata.humanNickname = draft.humanNickname.trim();
  if (draft.finderDescription.trim()) metadata.finderDescription = draft.finderDescription.trim();
  if (draft.runtimeKey.trim()) metadata.runtimeKey = draft.runtimeKey.trim();
  if (draft.previewMode) metadata.previewMode = draft.previewMode;

  const searchAliases = splitList(draft.searchAliases);
  if (searchAliases) metadata.searchAliases = searchAliases;

  const tags = splitList(draft.tags);
  if (tags) metadata.tags = tags;

  return metadata;
}

export default function ModuleMetadataAdmin({ userRole }: Props) {
  const [modules, setModules] = useState<ModuleAdminItem[]>([]);
  const [drafts, setDrafts] = useState<Record<string, DraftFields>>({});
  const [activeSlug, setActiveSlug] = useState<string>('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError('');
      try {
        const res = await fetch('/api/admin/module-metadata', {
          headers: { 'Cache-Control': 'no-store' },
        });
        const json = await res.json();
        if (!json.success) {
          setError(json.error ?? 'Unable to load module metadata.');
          return;
        }

        const nextModules: ModuleAdminItem[] = json.modules ?? [];
        const nextDrafts: Record<string, DraftFields> = {};
        for (const mod of nextModules) {
          nextDrafts[mod.slug] = toDraft(mod.overrideMetadata);
        }

        setModules(nextModules);
        setDrafts(nextDrafts);
        setUpdatedAt(json.updatedAt ?? null);
        setActiveSlug((current) => current || nextModules[0]?.slug || '');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load module metadata.');
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const filteredModules = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return modules;
    return modules.filter((mod) => {
      const draft = drafts[mod.slug] ?? EMPTY_DRAFT;
      const haystack = [
        mod.slug,
        mod.name,
        mod.category,
        mod.lifecycle,
        mod.defaultMetadata.humanNickname,
        mod.defaultMetadata.finderDescription,
        draft.humanNickname,
        draft.finderDescription,
        draft.searchAliases,
        draft.tags,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(normalized);
    });
  }, [modules, drafts, query]);

  const activeModule = modules.find((mod) => mod.slug === activeSlug) ?? filteredModules[0] ?? null;
  const activeDraft = activeModule ? drafts[activeModule.slug] ?? EMPTY_DRAFT : EMPTY_DRAFT;

  function updateDraft(slug: string, patch: Partial<DraftFields>) {
    setDrafts((current) => ({
      ...current,
      [slug]: {
        ...(current[slug] ?? EMPTY_DRAFT),
        ...patch,
      },
    }));
  }

  function resetModule(slug: string) {
    if (!window.confirm(`Clear editable overrides for ${slug}? The module will fall back to code defaults.`)) return;
    setDrafts((current) => ({ ...current, [slug]: EMPTY_DRAFT }));
  }

  function seedFromDefaults(mod: ModuleAdminItem) {
    setDrafts((current) => ({
      ...current,
      [mod.slug]: toDraft(mod.defaultMetadata),
    }));
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    setNotice('');

    const metadata: ModuleDiscoveryMetadataMap = {};
    for (const [slug, draft] of Object.entries(drafts)) {
      const entry = draftToMetadata(draft);
      if (Object.keys(entry).length > 0) metadata[slug] = entry;
    }

    try {
      const res = await fetch('/api/admin/module-metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metadata }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error ?? 'Save failed.');
        return;
      }
      setNotice('Module discovery metadata saved. Refresh /style-guide/modules to see the published overrides.');
      setUpdatedAt(new Date().toISOString());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Head>
        <title>Module Metadata · Admin</title>
      </Head>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
        <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Module Metadata</h1>
            <p className="mt-1 max-w-3xl text-sm text-gray-500">
              Edit human-facing nicknames, finder descriptions, aliases, and tags used by the
              module style guide. These fields improve search and discovery only; they do not
              change runtime modules, billing, entitlements, app state, or user truth.
            </p>
            <p className="mt-2 text-xs text-gray-400">
              Role: {userRole}. {updatedAt ? `Last saved: ${new Date(updatedAt).toLocaleString()}` : 'No saved overrides yet.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/style-guide/modules"
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              View Style Guide
            </Link>
            <Link
              href="/admin"
              className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              &larr; Dashboard
            </Link>
          </div>
        </div>

        <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          <strong>Safe edit layer:</strong> code defaults stay intact. Blank fields mean “use the code default.”
          Use “Start from defaults” to copy the current default copy into editable fields before customizing.
        </div>

        {error && (
          <div className="mb-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 whitespace-pre-line">
            {error}
          </div>
        )}
        {notice && (
          <div className="mb-6 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
            {notice}
          </div>
        )}

        {loading ? (
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-sm text-gray-500">
            Loading module metadata…
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
            <aside className="rounded-lg border border-gray-200 bg-white shadow-sm">
              <div className="border-b border-gray-200 p-4">
                <label htmlFor="module-metadata-search" className="sr-only">
                  Search modules
                </label>
                <input
                  id="module-metadata-search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search modules…"
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div className="max-h-[720px] overflow-y-auto divide-y divide-gray-100">
                {filteredModules.map((mod) => {
                  const draft = drafts[mod.slug] ?? EMPTY_DRAFT;
                  const hasOverride = Object.keys(draftToMetadata(draft)).length > 0;
                  return (
                    <button
                      key={mod.slug}
                      type="button"
                      onClick={() => setActiveSlug(mod.slug)}
                      className={`block w-full px-4 py-3 text-left transition ${
                        activeModule?.slug === mod.slug ? 'bg-blue-50' : 'hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium text-gray-900">{mod.name}</div>
                          <div className="mt-0.5 font-mono text-xs text-gray-400">{mod.slug}</div>
                        </div>
                        {hasOverride && (
                          <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-green-700">
                            edited
                          </span>
                        )}
                      </div>
                      <div className="mt-2 flex gap-1.5 text-[10px] uppercase tracking-wide text-gray-400">
                        <span>{mod.category}</span>
                        <span>·</span>
                        <span>{mod.lifecycle}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </aside>

            <main className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
              {activeModule ? (
                <div>
                  <div className="mb-6 flex flex-col gap-4 border-b border-gray-200 pb-6 md:flex-row md:items-start md:justify-between">
                    <div>
                      <h2 className="text-xl font-semibold text-gray-900">{activeModule.name}</h2>
                      <p className="mt-1 font-mono text-xs text-gray-400">{activeModule.slug}</p>
                      <div className="mt-2 flex gap-2 text-xs text-gray-500">
                        <span className="rounded-full bg-gray-100 px-2 py-0.5">{activeModule.category}</span>
                        <span className="rounded-full bg-gray-100 px-2 py-0.5">{activeModule.lifecycle}</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => seedFromDefaults(activeModule)}
                        className="rounded-md border border-gray-300 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
                      >
                        Start from defaults
                      </button>
                      <button
                        type="button"
                        onClick={() => resetModule(activeModule.slug)}
                        className="rounded-md border border-red-200 bg-white px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50"
                      >
                        Clear overrides
                      </button>
                    </div>
                  </div>

                  <div className="mb-6 rounded-md bg-gray-50 p-4 text-sm text-gray-600">
                    <div className="font-medium text-gray-900">Current code default</div>
                    <div className="mt-2 grid gap-3 md:grid-cols-2">
                      <div>
                        <div className="text-xs font-medium uppercase tracking-wide text-gray-400">Nickname</div>
                        <p className="mt-1">{activeModule.defaultMetadata.humanNickname || activeModule.name}</p>
                      </div>
                      <div>
                        <div className="text-xs font-medium uppercase tracking-wide text-gray-400">Preview</div>
                        <p className="mt-1">{activeModule.defaultMetadata.previewMode || 'abstract'}</p>
                      </div>
                    </div>
                    <div className="mt-3">
                      <div className="text-xs font-medium uppercase tracking-wide text-gray-400">Finder description</div>
                      <p className="mt-1 leading-6">{activeModule.defaultMetadata.finderDescription || 'No default finder description.'}</p>
                    </div>
                  </div>

                  <div className="space-y-5">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Human nickname</label>
                      <input
                        value={activeDraft.humanNickname}
                        onChange={(event) => updateDraft(activeModule.slug, { humanNickname: event.target.value })}
                        placeholder={activeModule.defaultMetadata.humanNickname || activeModule.name}
                        className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700">Finder description</label>
                      <textarea
                        value={activeDraft.finderDescription}
                        onChange={(event) => updateDraft(activeModule.slug, { finderDescription: event.target.value })}
                        placeholder={activeModule.defaultMetadata.finderDescription || 'Plain-language description of when to use this module.'}
                        rows={4}
                        className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 leading-6 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>

                    <div className="grid gap-5 md:grid-cols-2">
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Search aliases</label>
                        <textarea
                          value={activeDraft.searchAliases}
                          onChange={(event) => updateDraft(activeModule.slug, { searchAliases: event.target.value })}
                          placeholder={(activeModule.defaultMetadata.searchAliases ?? []).join('\n') || 'One alias per line'}
                          rows={6}
                          className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 font-mono leading-6 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        <p className="mt-1 text-xs text-gray-400">One per line or comma-separated.</p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Tags</label>
                        <textarea
                          value={activeDraft.tags}
                          onChange={(event) => updateDraft(activeModule.slug, { tags: event.target.value })}
                          placeholder={(activeModule.defaultMetadata.tags ?? []).join('\n') || 'family:hero'}
                          rows={6}
                          className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 font-mono leading-6 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                        <p className="mt-1 text-xs text-gray-400">Use tags for page-type, role, surface, and pathway discovery.</p>
                      </div>
                    </div>

                    <div className="grid gap-5 md:grid-cols-2">
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Preview mode</label>
                        <select
                          value={activeDraft.previewMode}
                          onChange={(event) => updateDraft(activeModule.slug, { previewMode: event.target.value as ModulePreviewMode | '' })}
                          className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        >
                          <option value="">Use code default ({activeModule.defaultMetadata.previewMode || 'abstract'})</option>
                          <option value="live">live</option>
                          <option value="fixture">fixture</option>
                          <option value="abstract">abstract</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">Runtime key</label>
                        <input
                          value={activeDraft.runtimeKey}
                          onChange={(event) => updateDraft(activeModule.slug, { runtimeKey: event.target.value })}
                          placeholder="optional, e.g. hero.standard.v1"
                          className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 font-mono focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="mt-8 flex items-center justify-between border-t border-gray-200 pt-6">
                    <p className="text-xs text-gray-400">
                      Saves all edited module metadata as published discovery overrides.
                    </p>
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={saving}
                      className="rounded-md bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
                    >
                      {saving ? 'Saving…' : 'Save module metadata'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="py-20 text-center text-sm text-gray-500">No module selected.</div>
              )}
            </main>
          </div>
        )}
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async (context) => {
  const user = await getCurrentUserWithRoleFromSSR(context);
  if (!user || (user.role !== 'editor' && user.role !== 'admin')) {
    return { redirect: { destination: '/admin', permanent: false } };
  }

  return { props: { userRole: user.role as 'editor' | 'admin' } };
};
