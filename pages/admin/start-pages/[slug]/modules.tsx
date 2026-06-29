/**
 * Admin: /admin/start-pages/[slug]/modules
 *
 * Controlled module-zone builder for Start Pages. This intentionally edits only
 * `config.runtimeModules` on the Start Page draft. Billing, trials, checkout,
 * offers, price options, and entitlements remain owned by the existing
 * Start/Offers systems.
 */

import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { ModuleContentPanel } from '@/components/admin/ModuleContentPanel';
import { getCurrentUserWithRoleFromSSR } from '@/lib/authServer';
import { inspectModules, type LooseModule, type ModuleValidity } from '@/lib/modules/compositionValidation';
import { getModuleResolverSlugWarnings } from '@/lib/modules/resolverSlugWarnings';
import { getStartPageBySlug } from '@/lib/startPages/startPageApi';
import {
  START_RUNTIME_MODULE_TAXONOMY,
  START_RUNTIME_MODULE_TYPE_KEYS,
  START_RUNTIME_MODULE_ZONE_KEYS,
  createStartRuntimeModuleStarterContent,
  getStartRuntimeModuleTaxonomy,
  type StartRuntimeModuleBank,
  type StartRuntimeModuleTypeKey,
  type StartRuntimeModuleZoneKey,
} from '@/lib/startPages/startRuntimeModules';
import {
  routePathForSlug,
  type StartPageRecord,
  type StartTemplateConfig,
} from '@/lib/startPages/startPageSchema';

interface Props {
  record: StartPageRecord;
}

type ZoneState = Record<StartRuntimeModuleZoneKey, LooseModule[]>;

const ZONE_LABELS: Record<StartRuntimeModuleZoneKey, string> = {
  afterHero: 'After hero',
  afterSystemCards: 'After system cards',
  beforePricing: 'Before pricing',
  afterPricing: 'After pricing',
  beforeFinalCta: 'Before final CTA',
};

const ZONE_DESCRIPTIONS: Record<StartRuntimeModuleZoneKey, string> = {
  afterHero: 'Best for orientation, proof, marquee, or short explanation modules after the hardened Start hero.',
  afterSystemCards: 'Best for benefit grids, reasons, proof cards, or additional context after the product/system cards.',
  beforePricing: 'Best for comparison, objections, or decision-support modules immediately before plans.',
  afterPricing: 'Best for reassurance, proof, FAQ, or low-pressure explanation after the plan cards.',
  beforeFinalCta: 'Best for final education, FAQ, or persuasion modules before the final CTA.',
};

const BANK_LABELS: Record<StartRuntimeModuleBank, string> = {
  start: 'Start',
  programs: 'Programs',
  'integrative-care': 'Integrative Care',
  offer: 'Offers',
};

function emptyZones(record: StartPageRecord): ZoneState {
  const zones = {} as ZoneState;
  for (const zone of START_RUNTIME_MODULE_ZONE_KEYS) {
    zones[zone] = (record.config?.runtimeModules?.[zone] ?? []).map((mod) => ({
      id: mod.id,
      type: mod.type,
      content: mod.content,
    }));
  }
  return zones;
}

function moduleLabel(type: string) {
  const taxonomy = getStartRuntimeModuleTaxonomy(type as StartRuntimeModuleTypeKey);
  if (taxonomy) return taxonomy.label;
  const parts = type.split('.');
  const version = parts.pop();
  const label = parts.join(' — ').replace(/-/g, ' ');
  return `${label} (${version})`;
}

function moduleUsefulness(type: StartRuntimeModuleTypeKey): string {
  return getStartRuntimeModuleTaxonomy(type)?.usefulFor.map((bank) => BANK_LABELS[bank]).join(', ') ?? 'Start';
}

function recommendedZones(type: StartRuntimeModuleTypeKey): string {
  return getStartRuntimeModuleTaxonomy(type)?.recommendedZones.map((zone) => ZONE_LABELS[zone]).join(', ') ?? 'Any allowed zone';
}

function countModules(zones: ZoneState): number {
  return START_RUNTIME_MODULE_ZONE_KEYS.reduce((total, zone) => total + zones[zone].length, 0);
}

function flattenModules(zones: ZoneState): LooseModule[] {
  return START_RUNTIME_MODULE_ZONE_KEYS.flatMap((zone) => zones[zone]);
}

function validityKey(zone: StartRuntimeModuleZoneKey, index: number) {
  return `${zone}:${index}`;
}

function buildValidityMap(zones: ZoneState): Map<string, ModuleValidity> {
  const map = new Map<string, ModuleValidity>();
  const all = flattenModules(zones);
  const validity = inspectModules(all);
  let offset = 0;
  for (const zone of START_RUNTIME_MODULE_ZONE_KEYS) {
    zones[zone].forEach((_, index) => {
      const item = validity[offset + index];
      if (item) map.set(validityKey(zone, index), item);
    });
    offset += zones[zone].length;
  }
  return map;
}

export default function StartRuntimeModulesBuilder({ record }: Props) {
  const [zones, setZones] = useState<ZoneState>(() => emptyZones(record));
  const [selectedZone, setSelectedZone] = useState<StartRuntimeModuleZoneKey>('beforePricing');
  const [selectedType, setSelectedType] = useState<StartRuntimeModuleTypeKey>('comparison.table.v1');
  const [editing, setEditing] = useState<{ zone: StartRuntimeModuleZoneKey; index: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const selectedTaxonomy = getStartRuntimeModuleTaxonomy(selectedType);
  const validity = useMemo(() => buildValidityMap(zones), [zones]);
  const invalidCount = Array.from(validity.values()).filter((item) => !item.valid).length;
  const moduleCount = countModules(zones);

  function setZoneModules(zone: StartRuntimeModuleZoneKey, updater: (modules: LooseModule[]) => LooseModule[]) {
    setZones((prev) => ({ ...prev, [zone]: updater(prev[zone]) }));
    setSaved(false);
  }

  function addModule() {
    const id = `${selectedType}-${Date.now()}`;
    const mod: LooseModule = {
      id,
      type: selectedType,
      content: createStartRuntimeModuleStarterContent(selectedType),
    };
    setZoneModules(selectedZone, (modules) => [...modules, mod]);
    setEditing({ zone: selectedZone, index: zones[selectedZone].length });
  }

  function removeModule(zone: StartRuntimeModuleZoneKey, index: number) {
    if (!window.confirm('Remove this module from the Start page?')) return;
    setZoneModules(zone, (modules) => modules.filter((_, i) => i !== index));
    if (editing?.zone === zone && editing.index === index) setEditing(null);
  }

  function moveModule(zone: StartRuntimeModuleZoneKey, index: number, direction: 'up' | 'down') {
    setZoneModules(zone, (modules) => {
      const swap = direction === 'up' ? index - 1 : index + 1;
      if (swap < 0 || swap >= modules.length) return modules;
      const next = [...modules];
      [next[index], next[swap]] = [next[swap], next[index]];
      return next;
    });
  }

  function handleContentSave(zone: StartRuntimeModuleZoneKey, index: number, content: Record<string, unknown>) {
    setZoneModules(zone, (modules) =>
      modules.map((mod, i) => (i === index ? { ...mod, content } : mod)),
    );
  }

  function buildConfig(): StartTemplateConfig {
    const runtimeModules: StartTemplateConfig['runtimeModules'] = {};
    for (const zone of START_RUNTIME_MODULE_ZONE_KEYS) {
      const modules = zones[zone];
      if (modules.length > 0) {
        runtimeModules[zone] = modules.map((mod) => ({
          id: mod.id,
          type: mod.type as StartRuntimeModuleTypeKey,
          content: mod.content as Record<string, unknown>,
        }));
      }
    }

    const base = { ...(record.config ?? {}) } as Record<string, unknown>;
    if (Object.keys(runtimeModules).length > 0) base.runtimeModules = runtimeModules;
    else delete base.runtimeModules;
    return base as StartTemplateConfig;
  }

  async function handleSaveDraft() {
    setError('');
    setSaved(false);
    if (invalidCount > 0) {
      setError('Fix invalid module content before saving. Start Page config validates module content at save time.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`/api/admin/start-pages/${record.slug}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateKey: record.templateKey,
          primaryOfferKey: record.primaryOfferKey,
          priceOptionKeys: record.priceOptionKeys,
          seoTitle: record.seoTitle ?? null,
          seoDescription: record.seoDescription ?? null,
          config: buildConfig(),
        }),
      });
      const json = await res.json();
      if (!json.success) {
        setError(json.error ?? 'Save failed');
        return;
      }
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Head>
        <title>Start Modules · {record.slug} · Admin</title>
      </Head>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-10">
        <div className="mb-6 text-sm text-gray-500">
          <Link href="/admin/start-pages" className="hover:text-gray-700">Start Pages</Link>
          {' / '}
          <Link href={`/admin/start-pages/${record.slug}`} className="hover:text-gray-700 font-mono">
            {record.slug}
          </Link>
          {' / '}
          <span className="text-gray-700">Runtime modules</span>
        </div>

        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Start runtime modules</h1>
            <p className="mt-1 text-sm text-gray-500">
              Controlled module zones for <span className="font-mono">{routePathForSlug(record.slug)}</span>.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <a
              href={`/admin/start-pages/${record.slug}/preview`}
              target="_blank"
              rel="noreferrer"
              className="px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Preview ↗
            </a>
            <button
              type="button"
              onClick={handleSaveDraft}
              disabled={saving || invalidCount > 0}
              className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-40"
            >
              {saving ? 'Saving…' : 'Save draft'}
            </button>
          </div>
        </div>

        <div className="mb-6 rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          This builder only edits Start presentation modules. It cannot change price options, billing, checkout,
          trial logic, entitlement mappings, or offer grants.
        </div>

        {error && (
          <div className="mb-5 rounded-md bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
        {saved && (
          <div className="mb-5 rounded-md bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
            Runtime module draft saved. Use the Start Page editor to publish when preview is approved.
          </div>
        )}
        {invalidCount > 0 && (
          <div className="mb-5 rounded-md bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
            <strong>{invalidCount} module{invalidCount === 1 ? '' : 's'} need valid content.</strong>{' '}
            Open “Edit fields” on each highlighted module before saving.
          </div>
        )}

        <section className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 mb-5">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Add module</h2>
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
            <select
              value={selectedZone}
              onChange={(e) => setSelectedZone(e.target.value as StartRuntimeModuleZoneKey)}
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {START_RUNTIME_MODULE_ZONE_KEYS.map((zone) => (
                <option key={zone} value={zone}>{ZONE_LABELS[zone]}</option>
              ))}
            </select>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value as StartRuntimeModuleTypeKey)}
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {START_RUNTIME_MODULE_TAXONOMY.map((item) => (
                <option key={item.type} value={item.type}>{item.label}</option>
              ))}
              {START_RUNTIME_MODULE_TYPE_KEYS.filter((type) => !getStartRuntimeModuleTaxonomy(type)).map((type) => (
                <option key={type} value={type}>{moduleLabel(type)}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={addModule}
              className="px-4 py-2 bg-gray-800 text-white text-sm font-medium rounded-md hover:bg-gray-700"
            >
              Add
            </button>
          </div>
          <div className="mt-3 rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-500">
            <p><span className="font-semibold text-gray-700">Selected:</span> {selectedTaxonomy?.description ?? moduleLabel(selectedType)}</p>
            <p className="mt-1"><span className="font-semibold text-gray-700">Recommended zones:</span> {recommendedZones(selectedType)}</p>
          </div>
          <p className="mt-2 text-xs text-gray-400">
            New modules start with valid starter content. Open “Edit fields” to tailor the copy before preview and publish.
          </p>
        </section>

        {moduleCount === 0 && (
          <div className="rounded-lg border border-dashed border-gray-300 bg-white px-6 py-12 text-center text-sm text-gray-400">
            No Start runtime modules yet. Add one above.
          </div>
        )}

        <div className="space-y-5">
          {START_RUNTIME_MODULE_ZONE_KEYS.map((zone) => (
            <section key={zone} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="border-b border-gray-100 px-5 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-gray-900">{ZONE_LABELS[zone]}</h2>
                    <p className="mt-1 text-xs text-gray-500">{ZONE_DESCRIPTIONS[zone]}</p>
                  </div>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                    {zones[zone].length} module{zones[zone].length === 1 ? '' : 's'}
                  </span>
                </div>
              </div>

              {zones[zone].length === 0 ? (
                <div className="px-5 py-6 text-sm text-gray-400">No modules in this zone.</div>
              ) : (
                <ul className="divide-y divide-gray-100">
                  {zones[zone].map((mod, index) => {
                    const moduleValidity = validity.get(validityKey(zone, index));
                    const isInvalid = moduleValidity ? !moduleValidity.valid : false;
                    const slugWarnings = getModuleResolverSlugWarnings(
                      mod.type,
                      mod.content as unknown as Record<string, unknown>,
                    );
                    const type = mod.type as StartRuntimeModuleTypeKey;
                    const taxonomy = getStartRuntimeModuleTaxonomy(type);
                    return (
                      <li key={mod.id} className={isInvalid ? 'bg-amber-50/60' : undefined}>
                        <div className="flex items-center gap-3 px-5 py-3">
                          <div className="flex flex-col gap-0.5 flex-shrink-0">
                            <button
                              type="button"
                              onClick={() => moveModule(zone, index, 'up')}
                              disabled={index === 0}
                              className="text-gray-400 hover:text-gray-600 disabled:opacity-20 text-xs leading-none"
                              aria-label="Move up"
                            >▲</button>
                            <button
                              type="button"
                              onClick={() => moveModule(zone, index, 'down')}
                              disabled={index === zones[zone].length - 1}
                              className="text-gray-400 hover:text-gray-600 disabled:opacity-20 text-xs leading-none"
                              aria-label="Move down"
                            >▼</button>
                          </div>

                          <span className="w-6 text-center text-xs font-mono text-gray-400 flex-shrink-0">
                            {index + 1}
                          </span>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-gray-900 truncate">
                                {moduleLabel(mod.type)}
                              </span>
                              {moduleValidity && (
                                <span
                                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                                    moduleValidity.valid ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-800'
                                  }`}
                                  title={
                                    moduleValidity.valid
                                      ? 'Valid Start module'
                                      : moduleValidity.issues.map((x) => `${x.path}: ${x.message}`).join('\n')
                                  }
                                >
                                  {moduleValidity.valid ? 'Valid' : 'Invalid'}
                                </span>
                              )}
                            </div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                              <span className="font-mono text-gray-400 truncate">{mod.id}</span>
                              <span className="text-gray-400">Also useful for: {taxonomy?.usefulFor.map((bank) => BANK_LABELS[bank]).join(', ') ?? moduleUsefulness(type)}</span>
                            </div>
                          </div>

                          <button
                            type="button"
                            onClick={() => setEditing(editing?.zone === zone && editing.index === index ? null : { zone, index })}
                            className={`text-xs font-medium flex-shrink-0 px-2 py-1 rounded ${
                              editing?.zone === zone && editing.index === index
                                ? 'bg-blue-100 text-blue-700'
                                : 'text-blue-600 hover:text-blue-800'
                            }`}
                          >
                            {editing?.zone === zone && editing.index === index ? 'Close' : 'Edit fields'}
                          </button>
                          <button
                            type="button"
                            onClick={() => removeModule(zone, index)}
                            className="text-xs text-red-400 hover:text-red-600 font-medium flex-shrink-0"
                          >
                            Remove
                          </button>
                        </div>

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

                        {editing?.zone === zone && editing.index === index && (
                          <div className="px-5 pb-4">
                            <ModuleContentPanel
                              moduleType={mod.type}
                              moduleId={mod.id}
                              initialContent={mod.content as unknown as Record<string, unknown>}
                              validationIssues={moduleValidity?.issues ?? []}
                              onSave={(updatedContent) => handleContentSave(zone, index, updatedContent)}
                              onClose={() => setEditing(null)}
                            />
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          ))}
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

  const slug = String(context.params?.slug ?? '').trim().toLowerCase();
  if (!slug) return { notFound: true };

  const record =
    (await getStartPageBySlug(slug, 'draft')) ??
    (await getStartPageBySlug(slug, 'published'));
  if (!record) return { notFound: true };

  return { props: { record: { ...record, status: 'draft' } } };
};
