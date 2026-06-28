/**
 * Module Detail — /style-guide/modules/[slug]
 *
 * Detail view for the combined discovery catalog. Runtime-specific modules that
 * do not yet have a live embed still render a safe fixture/spec view.
 */

import type { GetStaticPaths, GetStaticProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';

import { MODULE_DISCOVERY_CATALOG } from '@/lib/moduleDiscoveryCatalog';
import {
  getModuleLifecycle,
  isLifecycleRuledOut,
  type ModuleCategory,
  type ModuleDefinition,
  type ModuleLifecycle,
} from '@/lib/moduleRegistry';
import { getModuleDiscoveryMetadata, getModuleDisplayName, getModuleFinderDescription } from '@/lib/moduleDiscoveryMetadata';

interface ModuleDetailProps {
  mod: ModuleDefinition;
}

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

const LIFECYCLE_BADGE_STYLES: Record<ModuleLifecycle, string> = {
  approved: 'bg-emerald-500/20 text-emerald-300',
  experimental: 'bg-amber-500/20 text-amber-300',
  legacy: 'bg-zinc-500/20 text-zinc-300',
  deprecated: 'bg-red-500/20 text-red-300',
  reference_only: 'bg-indigo-500/20 text-indigo-300',
};

const LIFECYCLE_LABELS: Record<ModuleLifecycle, string> = {
  approved: 'Approved',
  experimental: 'Experimental',
  legacy: 'Legacy',
  deprecated: 'Deprecated',
  reference_only: 'Reference Only',
};

function SpecRow({ label, value }: { label: string; value?: string | string[] }) {
  const display = Array.isArray(value) ? value.join(', ') : value;
  if (!display) return null;
  return (
    <div className="border-b border-white/10 py-3 last:border-0">
      <dt className="text-[10px] font-semibold uppercase tracking-wider text-white/35">{label}</dt>
      <dd className="mt-1 break-words font-mono text-xs leading-6 text-white/70">{display}</dd>
    </div>
  );
}

function DetailPreview({ mod }: { mod: ModuleDefinition }) {
  const metadata = getModuleDiscoveryMetadata(mod);
  const tags = metadata.tags ?? [];
  const isCta = mod.category === 'cta' || mod.properties.hasButtons;
  const isGrid = mod.category === 'grid' || mod.category === 'card';
  const isAmbient = mod.category === 'ambient';

  return (
    <div className="relative min-h-[420px] overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br from-neutral-950 via-neutral-900 to-brand-900 p-8 shadow-2xl">
      {isAmbient ? (
        <div className="absolute inset-0 opacity-80">
          <div className="absolute -left-16 top-12 h-56 w-56 rounded-full bg-denim-500/30 blur-3xl" />
          <div className="absolute bottom-6 right-0 h-64 w-64 rounded-full bg-emerald-500/20 blur-3xl" />
        </div>
      ) : null}
      <div className="relative z-10 flex min-h-[360px] flex-col justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/40">
            {tags.find((tag) => tag.startsWith('bank:'))?.replace('bank:', '') ?? mod.category}
          </p>
          <h2 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight tracking-[-0.04em] text-white antialiased md:text-6xl">
            {metadata.humanNickname ?? mod.name}
          </h2>
          <p className="mt-5 max-w-2xl text-base font-light leading-7 text-white/65 antialiased">
            {metadata.finderDescription ?? mod.description}
          </p>
        </div>

        {isCta ? (
          <div className="mt-10 flex flex-wrap gap-3">
            <div className="h-11 w-36 rounded-full bg-denim-500" />
            <div className="h-11 w-28 rounded-full border border-white/30" />
          </div>
        ) : isGrid ? (
          <div className="mt-10 grid gap-3 md:grid-cols-3">
            <div className="h-32 rounded-2xl bg-white/10" />
            <div className="h-32 rounded-2xl bg-white/15" />
            <div className="h-32 rounded-2xl bg-white/10" />
          </div>
        ) : (
          <div className="mt-10 space-y-3">
            <div className="h-3 w-4/5 max-w-lg rounded bg-white/20" />
            <div className="h-3 w-3/5 max-w-md rounded bg-white/10" />
            <div className="h-3 w-2/5 max-w-sm rounded bg-white/10" />
          </div>
        )}
      </div>
      <div className="pointer-events-none absolute bottom-4 right-4 rounded-full bg-white/10 px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-white/60">
        {metadata.previewMode ?? 'abstract'} preview
      </div>
    </div>
  );
}

export default function ModuleDetailPage({ mod }: ModuleDetailProps) {
  const metadata = getModuleDiscoveryMetadata(mod);
  const lifecycle = getModuleLifecycle(mod);
  const displayName = getModuleDisplayName(mod);
  const finderDescription = getModuleFinderDescription(mod);
  const tags = metadata.tags ?? [];

  return (
    <>
      <Head>
        <title>{displayName} · Module Guide · Fine Diet</title>
      </Head>

      <div className="min-h-screen bg-neutral-900 text-white">
        <header className="sticky top-0 z-30 border-b border-neutral-700/40 bg-neutral-900/95 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4">
            <div className="flex min-w-0 items-center gap-3">
              <Link href="/style-guide/modules" className="shrink-0 text-xs text-white/40 transition-colors hover:text-white/60 antialiased">
                &larr; All Modules
              </Link>
              <span className="shrink-0 text-white/20">/</span>
              <h1 className="truncate text-sm font-semibold antialiased">{displayName}</h1>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${CATEGORY_COLORS[mod.category]}`}>
                {mod.category}
              </span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${LIFECYCLE_BADGE_STYLES[lifecycle]}`}>
                {LIFECYCLE_LABELS[lifecycle]}
              </span>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-5 py-8">
          {isLifecycleRuledOut(lifecycle) && (
            <div className="mb-5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs leading-6 text-amber-100/90">
              <strong>{LIFECYCLE_LABELS[lifecycle]}:</strong> not recommended for new builds. This page remains available for reference.
            </div>
          )}

          <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
            <section>
              <DetailPreview mod={mod} />
              <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                <h2 className="text-sm font-semibold text-white/80">When to use this module</h2>
                <p className="mt-2 max-w-3xl text-sm leading-7 text-white/60">{finderDescription}</p>
                {tags.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {tags.map((tag) => (
                      <span key={tag} className="rounded-full bg-denim-500/10 px-2 py-0.5 text-[10px] text-denim-200/80">
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </section>

            <aside className="space-y-5">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/45">Specs</h2>
                <dl>
                  <SpecRow label="Canonical" value={`${mod.name} · ${mod.slug}`} />
                  <SpecRow label="Runtime key" value={metadata.runtimeKey} />
                  <SpecRow label="Component" value={mod.componentPath} />
                  <SpecRow label="Used on" value={mod.usedOn} />
                  <SpecRow label="Background" value={mod.properties.backgroundType} />
                  <SpecRow label="Headline" value={`${mod.properties.headlineSize} · ${mod.properties.headlineWeight}`} />
                  <SpecRow label="Body" value={`${mod.properties.bodySize} · ${mod.properties.bodyWeight}`} />
                  <SpecRow label="Height" value={mod.properties.height} />
                  <SpecRow label="Responsive" value={mod.properties.responsiveNotes} />
                </dl>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-5">
                <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/45">Governance</h2>
                <dl>
                  <SpecRow label="Surface" value={mod.surface} />
                  <SpecRow label="Reusability" value={mod.reusability} />
                  <SpecRow label="Content source" value={mod.dataContract?.contentSource} />
                  <SpecRow label="Required props" value={mod.dataContract?.requiredProps} />
                  <SpecRow label="Fallback states" value={mod.dataContract?.fallbackStates} />
                  <SpecRow label="Safety notes" value={mod.governance?.safetyNotes} />
                </dl>
              </div>
            </aside>
          </div>
        </main>
      </div>
    </>
  );
}

export const getStaticPaths: GetStaticPaths = async () => {
  const paths = MODULE_DISCOVERY_CATALOG.map((mod) => ({ params: { slug: mod.slug } }));
  return { paths, fallback: false };
};

export const getStaticProps: GetStaticProps<ModuleDetailProps> = async ({ params }) => {
  const slug = params?.slug as string;
  const mod = MODULE_DISCOVERY_CATALOG.find((item) => item.slug === slug);

  if (!mod) {
    return { notFound: true };
  }

  return { props: { mod } };
};
