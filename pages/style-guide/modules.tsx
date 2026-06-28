/**
 * Module Style Guide — /style-guide/modules
 *
 * Human discovery surface for reusable modules. This page reads the combined
 * discovery catalog, applies editable metadata overrides, and lets teams filter
 * by lifecycle, category, and page-family bank.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import { MODULE_DISCOVERY_CATALOG } from '@/lib/moduleDiscoveryCatalog';
import {
  MODULE_CATEGORIES,
  MODULE_LIFECYCLES,
  getModuleLifecycle,
  isLifecycleRuledOut,
  type ModuleCategory,
  type ModuleDefinition,
  type ModuleLifecycle,
} from '@/lib/moduleRegistry';
import {
  getModuleDiscoveryMetadata,
  getModuleDisplayName,
  getModuleFinderDescription,
  getModuleSearchTokens,
  type ModuleDiscoveryMetadataMap,
} from '@/lib/moduleDiscoveryMetadata';

const LIFECYCLE_BADGE_STYLES: Record<ModuleLifecycle, string> = {
  approved: 'bg-emerald-500/20 text-emerald-300',
  experimental: 'bg-amber-500/20 text-amber-300',
  legacy: 'bg-zinc-500/20 text-zinc-300',
  deprecated: 'bg-red-500/20 text-red-300',
  reference_only: 'bg-indigo-500/20 text-indigo-300',
};

const LIFECYCLE_LABELS: Record<ModuleLifecycle, string> = Object.fromEntries(
  MODULE_LIFECYCLES.map((l) => [l.id, l.label]),
) as Record<ModuleLifecycle, string>;

const CATEGORY_COLORS: Record<ModuleCategory, string> = {
  hero: 'bg-amber-500/20 text-amber-300',
  content: 'bg-blue-500/20 text-blue-300',
  grid: 'bg-purple-500/20 text-purple-300',
  cta: 'bg-emerald-500/20 text-emerald-300',
  card: 'bg-cyan-500/20 text-cyan-300',
  form: 'bg-pink-500/20 text-pink-300',
  ambient: 'bg-orange-500/20 text-orange-300',
  layout: 'bg-indigo-500/20 text-indigo-300',
  navigation: 'bg-teal-500/20 text-teal-300',
};

type ModuleBankId =
  | 'runtime'
  | 'all'
  | 'pathway'
  | 'programs'
  | 'integrative-care'
  | 'start'
  | 'offer'
  | 'app-reference';

interface ModuleBank {
  id: ModuleBankId;
  label: string;
  tag?: string;
  runtimeOnly?: boolean;
}

const MODULE_BANKS: ModuleBank[] = [
  { id: 'runtime', label: 'Runtime Modules', runtimeOnly: true },
  { id: 'all', label: 'All Library Items' },
  { id: 'pathway', label: 'Public Pathway', tag: 'bank:pathway' },
  { id: 'programs', label: 'Programs', tag: 'bank:programs' },
  { id: 'integrative-care', label: 'Integrative Care', tag: 'bank:integrative-care' },
  { id: 'start', label: 'Start / Launch', tag: 'bank:start' },
  { id: 'offer', label: 'Offer / Purchase', tag: 'bank:offer' },
  { id: 'app-reference', label: 'App Reference', tag: 'bank:app-reference' },
];

type LifecycleFilter = ModuleLifecycle | 'all';

function LifecycleBadge({ lifecycle }: { lifecycle: ModuleLifecycle }) {
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${LIFECYCLE_BADGE_STYLES[lifecycle]}`}
    >
      {LIFECYCLE_LABELS[lifecycle]}
    </span>
  );
}

function ModuleMiniPreview({
  mod,
  metadataOverrides,
}: {
  mod: ModuleDefinition;
  metadataOverrides?: ModuleDiscoveryMetadataMap;
}) {
  const metadata = getModuleDiscoveryMetadata(mod, metadataOverrides);

  if (metadata.previewMode === 'live') {
    return <LiveMiniPreview mod={mod} />;
  }

  if (metadata.previewMode === 'fixture') {
    return <FixtureMiniPreview mod={mod} metadataOverrides={metadataOverrides} />;
  }

  return <AbstractModulePreview mod={mod} />;
}

function LiveMiniPreview({ mod }: { mod: ModuleDefinition }) {
  return (
    <div className="relative h-52 w-full overflow-hidden rounded-2xl bg-neutral-950">
      <iframe
        title={`${mod.name} mini preview`}
        src={`/style-guide/modules/embed/${mod.slug}`}
        className="pointer-events-none absolute left-0 top-0 h-[340%] w-[340%] origin-top-left scale-[0.294] border-0 bg-neutral-950"
        loading="lazy"
        tabIndex={-1}
        aria-hidden="true"
      />
      <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/10" />
      <div className="pointer-events-none absolute bottom-2 right-2 rounded-full bg-black/50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white/60">
        Page sample
      </div>
    </div>
  );
}

function FixtureMiniPreview({
  mod,
  metadataOverrides,
}: {
  mod: ModuleDefinition;
  metadataOverrides?: ModuleDiscoveryMetadataMap;
}) {
  const metadata = getModuleDiscoveryMetadata(mod, metadataOverrides);
  const tags = metadata.tags ?? [];
  const bankLabel = tags.find((tag) => tag.startsWith('bank:'))?.replace('bank:', '') ?? mod.category;
  const runtimeKey = metadata.runtimeKey ?? mod.slug;

  return (
    <div className="relative h-52 w-full overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-neutral-950 via-neutral-900 to-brand-900 p-5">
      <div className="absolute inset-0 opacity-70">
        <div className="absolute -left-12 top-4 h-40 w-40 rounded-full bg-denim-500/20 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-44 w-44 rounded-full bg-emerald-500/10 blur-3xl" />
      </div>

      <div className="relative z-10 flex h-full flex-col justify-between">
        <div>
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="truncate text-[10px] font-semibold uppercase tracking-[0.2em] text-white/40">
              {bankLabel}
            </p>
            <p className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 font-mono text-[9px] text-white/45">
              {mod.category}
            </p>
          </div>
          <h4 className="max-w-[92%] text-lg font-semibold leading-tight tracking-[-0.03em] text-white antialiased">
            {metadata.humanNickname ?? mod.name}
          </h4>
          <p className="mt-2 truncate font-mono text-[10px] text-white/40" title={runtimeKey}>
            {runtimeKey}
          </p>
        </div>

        <RuntimeFixtureVisual runtimeKey={runtimeKey} category={mod.category} hasButtons={mod.properties.hasButtons} />
      </div>

      <div className="pointer-events-none absolute bottom-2 right-2 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white/60">
        Fixture preview
      </div>
    </div>
  );
}

function RuntimeFixtureVisual({
  runtimeKey,
  category,
  hasButtons,
}: {
  runtimeKey: string;
  category: ModuleCategory;
  hasButtons: boolean;
}) {
  switch (runtimeKey) {
    case 'hero.offer-blur.v1':
      return (
        <div className="relative h-20 overflow-hidden rounded-2xl border border-white/15 bg-white/10 p-3">
          <div className="absolute inset-0 bg-gradient-to-r from-white/5 via-white/20 to-transparent blur-sm" />
          <div className="relative space-y-2">
            <div className="h-2 w-3/5 rounded bg-white/55" />
            <div className="h-2 w-4/5 rounded bg-white/20" />
            <div className="h-5 w-24 rounded-full bg-denim-500" />
          </div>
        </div>
      );
    case 'grid.program-cards.v1':
      return (
        <div className="grid grid-cols-3 gap-2">
          {[0, 1, 2].map((item) => (
            <div key={item} className="rounded-xl border border-white/10 bg-white/10 p-2">
              <div className="mb-2 h-8 rounded-lg bg-white/15" />
              <div className="h-1.5 w-4/5 rounded bg-white/35" />
              <div className="mt-1 h-1.5 w-1/2 rounded bg-white/15" />
            </div>
          ))}
        </div>
      );
    case 'comparison.table.v1':
      return (
        <div className="overflow-hidden rounded-xl border border-white/15 bg-white/[0.06]">
          <div className="grid grid-cols-2 border-b border-white/10 bg-white/10 text-[9px] uppercase tracking-wider text-white/50">
            <div className="px-2 py-1.5">Fine Diet</div>
            <div className="border-l border-white/10 px-2 py-1.5">Most plans</div>
          </div>
          {[0, 1, 2].map((row) => (
            <div key={row} className="grid grid-cols-2 border-b border-white/10 last:border-0">
              <div className="px-2 py-1.5"><div className="h-1.5 rounded bg-white/35" /></div>
              <div className="border-l border-white/10 px-2 py-1.5"><div className="h-1.5 rounded bg-white/15" /></div>
            </div>
          ))}
        </div>
      );
    case 'faq.accordion.v2':
      return (
        <div className="space-y-2">
          {[0, 1, 2].map((row) => (
            <div key={row} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2">
              <div className="h-2 w-2/3 rounded bg-white/30" />
              <div className="h-4 w-4 rounded-full border border-white/25" />
            </div>
          ))}
        </div>
      );
    case 'feature.icon-tiles.v1':
      return (
        <div className="grid grid-cols-4 gap-2">
          {[0, 1, 2, 3].map((tile) => (
            <div key={tile} className="rounded-xl border border-white/10 bg-white/[0.06] p-2">
              <div className="mb-2 h-5 w-5 rounded-lg bg-denim-500/60" />
              <div className="h-1.5 w-full rounded bg-white/25" />
              <div className="mt-1 h-1.5 w-2/3 rounded bg-white/10" />
            </div>
          ))}
        </div>
      );
    case 'process.slide-stack.v1':
    case 'process.timed-steps.v1':
      return (
        <div className="grid grid-cols-[0.8fr_1fr] gap-3">
          <div className="rounded-xl bg-white/10" />
          <div className="space-y-2">
            {[1, 2, 3].map((step) => (
              <div key={step} className="flex items-center gap-2 rounded-lg bg-white/[0.06] px-2 py-1.5">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-denim-500/50 text-[9px] text-white">{step}</span>
                <div className="h-1.5 flex-1 rounded bg-white/25" />
              </div>
            ))}
          </div>
        </div>
      );
    case 'feature.reasons-split.v1':
      return (
        <div className="grid grid-cols-[1fr_0.9fr] gap-3">
          <div className="space-y-2">
            {[1, 2, 3].map((reason) => (
              <div key={reason} className="flex items-center gap-2">
                <span className="font-mono text-[10px] text-denim-200">0{reason}</span>
                <div className="h-2 flex-1 rounded bg-white/25" />
              </div>
            ))}
          </div>
          <div className="rounded-2xl bg-white/10" />
        </div>
      );
    case 'case-study.scroll-cards.v1':
      return (
        <div className="flex gap-2 overflow-hidden">
          {[0, 1, 2].map((card) => (
            <div key={card} className="h-20 min-w-[42%] rounded-xl border border-white/10 bg-white/[0.07] p-2">
              <div className="mb-2 h-8 rounded-lg bg-white/10" />
              <div className="h-1.5 w-4/5 rounded bg-white/25" />
            </div>
          ))}
        </div>
      );
    case 'ambient.marquee-strip.v1':
      return (
        <div className="flex overflow-hidden rounded-full border border-white/15 bg-white/[0.06] py-3">
          {['PLAN', 'LOG', 'LEARN', 'REPEAT'].map((word) => (
            <span key={word} className="shrink-0 px-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/60">
              {word}
            </span>
          ))}
        </div>
      );
    case 'nav.program-pathway.v1':
      return (
        <div className="flex gap-2 overflow-hidden rounded-full border border-white/10 bg-white/[0.05] p-1.5">
          {['All', 'Baseline', 'Next'].map((item, index) => (
            <div key={item} className={`rounded-full px-3 py-2 text-[10px] ${index === 1 ? 'bg-white/15 text-white' : 'text-white/40'}`}>
              {item}
            </div>
          ))}
        </div>
      );
    case 'pricing.tiers.v1':
      return (
        <div className="grid grid-cols-2 gap-2">
          {[0, 1].map((tier) => (
            <div key={tier} className="rounded-xl border border-white/10 bg-white/[0.06] p-2">
              <div className="h-2 w-2/3 rounded bg-white/25" />
              <div className="mt-2 h-4 w-1/2 rounded bg-white/45" />
              <div className="mt-2 h-5 rounded-full bg-denim-500/70" />
            </div>
          ))}
        </div>
      );
    case 'cta.program-offer.v1':
    case 'persuasion.simple-cta.v1':
      return (
        <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-3">
          <div className="mb-2 h-2 w-3/4 rounded bg-white/35" />
          <div className="mb-3 h-2 w-1/2 rounded bg-white/15" />
          <div className="flex gap-2">
            <div className="h-8 w-28 rounded-full bg-denim-500" />
            <div className="h-8 w-20 rounded-full border border-white/30" />
          </div>
        </div>
      );
    default:
      return <GenericFixtureVisual category={category} hasButtons={hasButtons} />;
  }
}

function GenericFixtureVisual({ category, hasButtons }: { category: ModuleCategory; hasButtons: boolean }) {
  if (hasButtons || category === 'cta') {
    return (
      <div className="flex gap-2">
        <div className="h-9 w-28 rounded-full bg-denim-500" />
        <div className="h-9 w-20 rounded-full border border-white/30" />
      </div>
    );
  }

  if (category === 'grid' || category === 'card') {
    return (
      <div className="grid grid-cols-3 gap-2">
        <div className="h-12 rounded-xl bg-white/10" />
        <div className="h-12 rounded-xl bg-white/15" />
        <div className="h-12 rounded-xl bg-white/10" />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="h-2 w-4/5 rounded bg-white/20" />
      <div className="h-2 w-3/5 rounded bg-white/10" />
      <div className="h-2 w-2/5 rounded bg-white/10" />
    </div>
  );
}

function AbstractModulePreview({ mod }: { mod: ModuleDefinition }) {
  const bgMap: Record<string, string> = {
    image: 'bg-gradient-to-br from-neutral-700 via-neutral-800 to-neutral-900',
    solid: 'bg-neutral-800',
    gradient: 'bg-gradient-to-br from-brand-700 via-brand-800 to-brand-900',
    blur: 'bg-neutral-800/70 backdrop-blur',
    glassmorphism: 'bg-neutral-800/40 backdrop-blur-sm border border-white/10',
    aurora: 'bg-gradient-to-br from-brand-900 via-brand-800 to-brand-700',
  };
  const primaryBg = mod.properties.backgroundType[0];
  const bgClass = bgMap[primaryBg] || bgMap.solid;

  return (
    <div className={`relative flex h-52 w-full flex-col justify-end overflow-hidden rounded-2xl p-5 ${bgClass}`}>
      {mod.properties.hasOverlay && <div className="absolute inset-0 bg-black/30" />}
      <div className="relative z-10 max-w-[85%] space-y-2">
        <div className="h-3 w-3/4 rounded bg-white/80" />
        <div className="h-2 w-1/2 rounded bg-white/40" />
        {mod.properties.hasButtons && <div className="mt-4 h-5 w-20 rounded-full bg-denim-500/80" />}
      </div>
      <div className="pointer-events-none absolute bottom-2 right-2 rounded-full bg-black/30 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white/50">
        Abstract
      </div>
    </div>
  );
}

function PropertyRow({ label, value }: { label: string; value: string }) {
  return (
    <tr className="border-b border-neutral-800/50">
      <td className="whitespace-nowrap py-2.5 pr-4 align-top text-xs font-medium text-white/40">
        {label}
      </td>
      <td className="py-2.5 font-mono text-xs leading-relaxed text-white/80">{value}</td>
    </tr>
  );
}

function PropertiesTable({
  mod,
  metadataOverrides,
}: {
  mod: ModuleDefinition;
  metadataOverrides?: ModuleDiscoveryMetadataMap;
}) {
  const p = mod.properties;
  const metadata = getModuleDiscoveryMetadata(mod, metadataOverrides);
  return (
    <table className="w-full">
      <tbody>
        <PropertyRow label="Canonical" value={`${mod.name} · ${mod.slug}`} />
        <PropertyRow label="Preview" value={metadata.previewMode ?? 'abstract'} />
        {metadata.runtimeKey && <PropertyRow label="Runtime Key" value={metadata.runtimeKey} />}
        <PropertyRow label="Background" value={p.backgroundType.join(', ')} />
        <PropertyRow label="Headline" value={`${p.headlineSize} · ${p.headlineWeight}`} />
        <PropertyRow label="Body" value={`${p.bodySize} · ${p.bodyWeight}`} />
        <PropertyRow label="Alignment" value={p.textAlignment} />
        <PropertyRow label="Content Position" value={p.contentPosition} />
        <PropertyRow label="Height" value={p.height} />
        <PropertyRow label="Responsive" value={p.responsiveNotes} />
        <PropertyRow label="Content-Driven" value={p.isContentDriven ? 'JSON / CMS' : 'Hardcoded'} />
      </tbody>
    </table>
  );
}

function getModuleTags(mod: ModuleDefinition, overrides?: ModuleDiscoveryMetadataMap): string[] {
  return getModuleDiscoveryMetadata(mod, overrides).tags ?? [];
}

function matchesBank(
  mod: ModuleDefinition,
  activeBank: ModuleBankId,
  overrides?: ModuleDiscoveryMetadataMap,
): boolean {
  const metadata = getModuleDiscoveryMetadata(mod, overrides);
  if (activeBank === 'runtime') return Boolean(metadata.runtimeKey);
  if (activeBank === 'all') return true;
  const bank = MODULE_BANKS.find((item) => item.id === activeBank);
  if (bank?.runtimeOnly) return Boolean(metadata.runtimeKey);
  if (!bank?.tag) return true;
  return getModuleTags(mod, overrides).includes(bank.tag);
}

function ModuleCard({
  mod,
  metadataOverrides,
}: {
  mod: ModuleDefinition;
  metadataOverrides?: ModuleDiscoveryMetadataMap;
}) {
  const [expanded, setExpanded] = useState(false);
  const metadata = getModuleDiscoveryMetadata(mod, metadataOverrides);
  const displayName = getModuleDisplayName(mod, metadataOverrides);
  const finderDescription = getModuleFinderDescription(mod, metadataOverrides);
  const tags = metadata.tags ?? [];
  const aliases = metadata.searchAliases ?? [];
  const lifecycle = getModuleLifecycle(mod);

  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-700/40 bg-neutral-800/50">
      <ModuleMiniPreview mod={mod} metadataOverrides={metadataOverrides} />

      <div className="p-5">
        <div className="mb-2 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-white antialiased">{displayName}</h3>
            <p className="mt-1 truncate font-mono text-[10px] text-white/35" title={`${mod.name} · ${mod.slug}`}>
              {mod.name} · {mod.slug}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <LifecycleBadge lifecycle={lifecycle} />
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${CATEGORY_COLORS[mod.category]}`}>
              {mod.category}
            </span>
          </div>
        </div>

        {isLifecycleRuledOut(lifecycle) && (
          <p className="mb-2 text-[10px] leading-relaxed text-amber-300/80 antialiased">
            Not recommended for new builds.
          </p>
        )}

        <p className="mb-3 text-xs leading-relaxed text-white/65 antialiased">{finderDescription}</p>

        {tags.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {tags.slice(0, 8).map((tag) => (
              <span key={tag} className="rounded-full bg-denim-500/10 px-2 py-0.5 text-[10px] text-denim-200/80">
                {tag}
              </span>
            ))}
          </div>
        )}

        {mod.usedOn.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {mod.usedOn.map((page) => (
              <span key={page} className="rounded bg-white/5 px-2 py-0.5 font-mono text-[10px] text-white/40">
                {page}
              </span>
            ))}
          </div>
        )}

        {aliases.length > 0 && (
          <p className="mb-3 truncate text-[10px] text-white/35" title={aliases.join(', ')}>
            Also searched as: {aliases.slice(0, 4).join(', ')}
          </p>
        )}

        <p className="mb-3 truncate font-mono text-[10px] text-white/30" title={mod.componentPath}>
          {mod.componentPath}
        </p>

        <div className="flex items-center gap-4">
          <Link
            href={`/style-guide/modules/${mod.slug}`}
            className="text-xs font-medium text-denim-400 transition-colors hover:text-denim-300 antialiased"
          >
            Full Preview &rarr;
          </Link>
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="text-xs font-medium text-white/40 transition-colors hover:text-white/60 antialiased"
          >
            {expanded ? 'Hide Properties' : 'Show Properties'}
          </button>
        </div>

        {expanded && (
          <div className="mt-4 border-t border-neutral-700/40 pt-4">
            <PropertiesTable mod={mod} metadataOverrides={metadataOverrides} />
            {mod.notes && <p className="mt-3 text-xs italic leading-relaxed text-white/40">{mod.notes}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ModuleStyleGuide() {
  const [activeCategory, setActiveCategory] = useState<ModuleCategory | 'all'>('all');
  const [activeLifecycle, setActiveLifecycle] = useState<LifecycleFilter>('approved');
  const [activeBank, setActiveBank] = useState<ModuleBankId>('runtime');
  const [query, setQuery] = useState('');
  const [metadataOverrides, setMetadataOverrides] = useState<ModuleDiscoveryMetadataMap>({});
  const [metadataLoaded, setMetadataLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadOverrides() {
      try {
        const res = await fetch('/api/module-metadata', { headers: { 'Cache-Control': 'no-store' } });
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled && json?.metadata && typeof json.metadata === 'object') {
          setMetadataOverrides(json.metadata);
        }
      } catch {
        // Code defaults remain the safe fallback.
      } finally {
        if (!cancelled) setMetadataLoaded(true);
      }
    }

    loadOverrides();
    return () => {
      cancelled = true;
    };
  }, []);

  const normalizedQuery = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    return MODULE_DISCOVERY_CATALOG.filter((mod) => {
      const categoryMatch = activeCategory === 'all' || mod.category === activeCategory;
      const lifecycleMatch = activeLifecycle === 'all' || getModuleLifecycle(mod) === activeLifecycle;
      const bankMatch = matchesBank(mod, activeBank, metadataOverrides);
      const searchMatch =
        !normalizedQuery ||
        getModuleSearchTokens(mod, metadataOverrides).join(' ').toLowerCase().includes(normalizedQuery);
      return categoryMatch && lifecycleMatch && bankMatch && searchMatch;
    });
  }, [activeCategory, activeLifecycle, activeBank, normalizedQuery, metadataOverrides]);

  const categoryCounts = useMemo(() => {
    const inScope = MODULE_DISCOVERY_CATALOG.filter((mod) => {
      const lifecycleMatch = activeLifecycle === 'all' || getModuleLifecycle(mod) === activeLifecycle;
      const bankMatch = matchesBank(mod, activeBank, metadataOverrides);
      const searchMatch =
        !normalizedQuery ||
        getModuleSearchTokens(mod, metadataOverrides).join(' ').toLowerCase().includes(normalizedQuery);
      return lifecycleMatch && bankMatch && searchMatch;
    });
    const map: Record<string, number> = { all: inScope.length };
    for (const cat of MODULE_CATEGORIES) {
      map[cat.id] = inScope.filter((mod) => mod.category === cat.id).length;
    }
    return map;
  }, [activeLifecycle, activeBank, normalizedQuery, metadataOverrides]);

  const bankCounts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const bank of MODULE_BANKS) {
      map[bank.id] = MODULE_DISCOVERY_CATALOG.filter((mod) => {
        const lifecycleMatch = activeLifecycle === 'all' || getModuleLifecycle(mod) === activeLifecycle;
        const searchMatch =
          !normalizedQuery ||
          getModuleSearchTokens(mod, metadataOverrides).join(' ').toLowerCase().includes(normalizedQuery);
        return lifecycleMatch && searchMatch && matchesBank(mod, bank.id, metadataOverrides);
      }).length;
    }
    return map;
  }, [activeLifecycle, normalizedQuery, metadataOverrides]);

  const lifecycleCounts = useMemo(() => {
    const map: Record<string, number> = { all: MODULE_DISCOVERY_CATALOG.length };
    for (const lifecycle of MODULE_LIFECYCLES) {
      map[lifecycle.id] = MODULE_DISCOVERY_CATALOG.filter((mod) => getModuleLifecycle(mod) === lifecycle.id).length;
    }
    return map;
  }, []);

  return (
    <div className="min-h-screen bg-brand-900 text-white">
      <header className="border-b border-neutral-700/40">
        <div className="mx-auto max-w-7xl px-5 py-10">
          <div className="mb-2 flex items-center gap-3">
            <Link href="/style-guide" className="text-xs text-white/40 transition-colors hover:text-white/60 antialiased">
              Style Guide
            </Link>
            <span className="text-white/20">/</span>
            <span className="text-xs text-white/60 antialiased">Modules</span>
          </div>
          <h1 className="mb-2 text-4xl font-semibold antialiased">Module Library</h1>
          <p className="max-w-3xl text-base font-light text-white/60 antialiased">
            Reusable composition modules are shown first by default. Switch to All Library Items to review homepage, app-reference, and other style-guide samples.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-white/40 antialiased">
            <span>{MODULE_DISCOVERY_CATALOG.length} library items total</span>
            <span>{bankCounts.runtime ?? 0} runtime modules</span>
            <span>{MODULE_CATEGORIES.length} categories</span>
            <span>{metadataLoaded ? 'Editable metadata loaded' : 'Loading editable metadata...'}</span>
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/admin/module-metadata"
              className="inline-flex rounded-full border border-white/15 px-3 py-1.5 text-xs font-medium text-white/60 transition hover:border-white/30 hover:text-white"
            >
              Edit module nicknames & finder copy
            </Link>
          </div>
        </div>
      </header>

      <nav className="border-b border-neutral-700/40">
        <div className="mx-auto flex max-w-7xl items-center gap-2 overflow-x-auto px-5 py-3">
          <span className="mr-1 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-white/30">Lifecycle</span>
          <button
            type="button"
            onClick={() => setActiveLifecycle('all')}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors antialiased ${activeLifecycle === 'all' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/60'}`}
          >
            All ({lifecycleCounts.all})
          </button>
          {MODULE_LIFECYCLES.map((lifecycle) => (
            <button
              type="button"
              key={lifecycle.id}
              onClick={() => setActiveLifecycle(lifecycle.id)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors antialiased ${activeLifecycle === lifecycle.id ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/60'}`}
            >
              {lifecycle.label} ({lifecycleCounts[lifecycle.id] ?? 0})
            </button>
          ))}
        </div>
      </nav>

      <nav className="sticky top-0 z-20 border-b border-neutral-700/40 bg-brand-900/95 backdrop-blur-sm">
        <div className="mx-auto max-w-7xl px-5 py-3">
          <div className="mb-3">
            <label htmlFor="module-search" className="sr-only">
              Search modules
            </label>
            <input
              id="module-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search runtime keys, use cases, banks, page types, aliases, tags, or categories..."
              className="w-full rounded-full border border-white/10 bg-white/[0.06] px-4 py-2 text-sm text-white outline-none transition placeholder:text-white/30 focus:border-denim-400/60 focus:bg-white/[0.08]"
            />
          </div>

          <div className="mb-3 flex gap-2 overflow-x-auto">
            {MODULE_BANKS.map((bank) => (
              <button
                type="button"
                key={bank.id}
                onClick={() => setActiveBank(bank.id)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors antialiased ${activeBank === bank.id ? 'bg-denim-500/20 text-denim-200' : 'text-white/40 hover:text-white/60'}`}
              >
                {bank.label} ({bankCounts[bank.id] ?? 0})
              </button>
            ))}
          </div>

          <div className="flex gap-2 overflow-x-auto">
            <button
              type="button"
              onClick={() => setActiveCategory('all')}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors antialiased ${activeCategory === 'all' ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/60'}`}
            >
              All categories ({categoryCounts.all})
            </button>
            {MODULE_CATEGORIES.map((cat) => (
              <button
                type="button"
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors antialiased ${activeCategory === cat.id ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/60'}`}
              >
                {cat.label} ({categoryCounts[cat.id] ?? 0})
              </button>
            ))}
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-7xl px-5 py-8">
        <div className="mb-5 flex items-center justify-between gap-4 text-xs text-white/40 antialiased">
          <p>
            Showing {filtered.length} module{filtered.length === 1 ? '' : 's'}
            {query.trim() ? ` for “${query.trim()}”` : ''}
          </p>
          {(query.trim() || activeBank !== 'runtime' || activeCategory !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setActiveBank('runtime');
                setActiveCategory('all');
              }}
              className="text-denim-300 hover:text-denim-200"
            >
              Reset to runtime modules
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((mod) => (
            <ModuleCard key={mod.slug} mod={mod} metadataOverrides={metadataOverrides} />
          ))}
        </div>

        {filtered.length === 0 && (
          <div className="py-20 text-center">
            <p className="text-sm text-white/40 antialiased">
              No modules match this lifecycle, bank, category, and search combination.
            </p>
          </div>
        )}
      </main>

      <footer className="border-t border-neutral-700/40 px-5 py-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 text-xs text-white/30 antialiased sm:flex-row">
          <p>Fine Diet Module Library &bull; {new Date().getFullYear()}</p>
          <div className="flex gap-4">
            <Link href="/style-guide" className="text-white/40 transition-colors hover:text-white/60">
              Design Tokens
            </Link>
            <Link href="/admin/module-metadata" className="text-white/40 transition-colors hover:text-white/60">
              Metadata Editor
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
