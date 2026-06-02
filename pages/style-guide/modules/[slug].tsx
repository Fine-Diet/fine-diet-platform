/**
 * Module Detail — /style-guide/modules/[slug]
 *
 * Full-scale, true-to-life rendering of each page module with:
 * - Iframe-based responsive preview (real viewport media queries)
 * - Variant selector
 * - Collapsible property inspector
 *
 * The actual component renders in an iframe at
 * /style-guide/modules/embed/[slug]?variant=... so that Tailwind
 * breakpoints (sm:, md:, lg:) fire correctly at the iframe width.
 *
 * Additive only — imports existing components but never modifies them.
 */

import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import { GetStaticPaths, GetStaticProps } from 'next';
import Link from 'next/link';
import Head from 'next/head';

import {
  MODULE_STYLE_CATALOG,
  MODULE_LIFECYCLES,
  getModuleLifecycle,
  isLifecycleRuledOut,
  type ModuleDefinition,
  type ModuleCategory,
  type ModuleLifecycle,
} from '@/lib/moduleRegistry';

/* ------------------------------------------------------------------ */
/*  Lifecycle styling                                                  */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/*  Viewport widths                                                    */
/* ------------------------------------------------------------------ */

type ViewportSize = 'mobile' | 'tablet' | 'desktop';

const VIEWPORT_PX: Record<ViewportSize, number | null> = {
  mobile: 375,
  tablet: 768,
  desktop: null,
};

/* ------------------------------------------------------------------ */
/*  Variant definitions per slug                                       */
/* ------------------------------------------------------------------ */

const VARIANT_OPTIONS: Record<string, string[]> = {
  hero: ['dual-cta', 'single-cta'],
  'hero-medium': ['dual-cta', 'single-cta'],
  'feature-card': ['multi-slide-carousel', 'single-slide'],
  'grid-2col': ['with-image', 'solid-background'],
  'grid-2col-medium': ['with-image', 'solid-background'],
  'grid-section-app': ['with-data', 'empty-state'],
  'cta-banner': ['with-image', 'solid-background', 'no-description'],
  button: ['primary', 'secondary', 'tertiary', 'quaternary'],
  'buy-offer-button': ['primary', 'secondary', 'ghost'],
  'meal-section': ['empty', 'with-food-items', 'translucent'],
  'journal-hero': ['default'],
  'aurora-background': ['default'],
  'access-card': ['active', 'inactive', 'expiring-soon'],
  'quick-action': ['default', 'accent'],
  'recommendation-card': ['default'],
  'form-panel': ['default'],
  'section-label': ['default'],
  // Packet 2A
  'nutrition-density-gauge': ['default', 'loading', 'empty'],
  'stacked-page-section': ['default'],
  'app-top-nav': ['default'],
  // Footer nav active tab is router-derived, not prop-driven — preview shows the
  // default (log-active) state. Single variant keeps the toggle honest.
  'journal-footer-nav': ['default'],
  'app-shell': ['default'],
  'journal-block-section': ['empty', 'with-items'],
  'daily-summary': ['ready', 'empty'],
  // Packet 2B-B — extracted /journal/home modules
  // today-rhythm's actionable (highlighted) row is derived from the current time.
  'today-rhythm': ['default', 'loading', 'empty'],
  'nutrition-density-scroller': ['ready', 'loading', 'empty'],
  'quick-entry-row': ['default'],
  'prep-pantry-card': ['ready', 'missing-items', 'empty'],
  'home-template-cards': ['default'],
  // Packet 2C-A
  'saved-meal-card': ['default', 'minimal'],
  'journal-date-selector': ['today', 'past-day'],
  'grid-item-app': ['image', 'solid', 'empty'],
  'nds-display': ['score-high', 'score-mid', 'score-low', 'loading'],
  // Packet 2C-B
  'slot-card': ['planned', 'multi-meal', 'logged', 'empty'],
  'day-view': ['ready', 'multi-meal', 'empty'],
  'week-view-panel': ['ready', 'no-plan', 'incomplete'],
  'projected-nds-strip': ['high', 'mid', 'low', 'empty'],
  'schedule-conflict-banner': ['conflict', 'expandable'],
  'profile-defaults-banner': ['complete', 'incomplete', 'loading'],
  'program-delivery-modules': ['default'],
  'baseline-prep-modules': ['primary', 'reference'],
  'logged-item-card': ['default', 'with-units'],
  'compact-logged-card': ['mood', 'water', 'sleep'],
  // Packet 2C-C — Baseline weekly guidance + aurora disambiguation.
  // primary/reference is not a real prop on these week modules (that belongs to
  // BaselinePrepModules); variants reflect capacity copy + the day-end check-in
  // card. The hidden (inactive / out-of-window) state renders null by design and
  // is not surfaced.
  'baseline-week-one-modules': ['steady', 'low', 'high', 'checkin-due'],
  'baseline-week-two-modules': ['steady', 'low', 'high', 'checkin-due'],
  'baseline-week-three-modules': ['steady', 'low', 'high', 'checkin-due', 'recommendation'],
  'aurora-page-wrapper': ['dark', 'light'],
};

/* ------------------------------------------------------------------ */
/*  Auto-resizing iframe                                               */
/* ------------------------------------------------------------------ */

function PreviewFrame({
  slug,
  variant,
  widthPx,
}: {
  slug: string;
  variant: string;
  widthPx: number | null;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(600);

  const syncHeight = useCallback(() => {
    try {
      const iframe = iframeRef.current;
      const doc = iframe?.contentDocument;
      if (!iframe || !doc) return;

      // Give vh-based modules a tall viewport while measuring; otherwise 99vh
      // resolves against the iframe's current (short) height and under-reports.
      const measureViewportH =
        typeof window !== 'undefined' ? Math.max(window.innerHeight, 600) : 900;
      iframe.style.height = `${measureViewportH}px`;

      const contentRoot = doc.body?.firstElementChild as HTMLElement | null;
      const bodyH = doc.body?.scrollHeight ?? 0;
      const rootH = contentRoot?.scrollHeight ?? 0;
      // Measure content root when available — body can inherit min-height from global styles.
      const h = rootH > 0 ? rootH : bodyH > 0 ? bodyH : doc.documentElement.scrollHeight;

      // Safety cap — prevents runaway min-h-screen loops in edge cases.
      const capped = Math.min(h, measureViewportH * 1.25);

      if (capped > 0) {
        iframe.style.height = `${capped}px`;
        setHeight(capped);
      }
    } catch {
      // cross-origin guard (won't happen for same-origin)
    }
  }, []);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const onLoad = () => {
      syncHeight();
      const interval = setInterval(syncHeight, 500);
      setTimeout(() => clearInterval(interval), 8000);
    };

    iframe.addEventListener('load', onLoad);
    return () => iframe.removeEventListener('load', onLoad);
  }, [syncHeight]);

  useEffect(() => {
    syncHeight();
  }, [widthPx, variant, syncHeight]);

  const src = `/style-guide/modules/embed/${slug}?variant=${encodeURIComponent(variant)}`;

  return (
    <iframe
      ref={iframeRef}
      src={src}
      title={`${slug} preview`}
      className="border-0 block bg-brand-900"
      style={{
        width: widthPx ? `${widthPx}px` : '100%',
        height: `${height}px`,
        transition: 'width 0.3s ease',
      }}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Property Inspector                                                 */
/* ------------------------------------------------------------------ */

function PropertyRow({ label, value }: { label: string; value: string }) {
  return (
    <tr className="border-b border-neutral-700/30">
      <td className="py-2 pr-3 text-[11px] font-medium text-white/40 whitespace-nowrap align-top">
        {label}
      </td>
      <td className="py-2 text-[11px] text-white/70 font-mono leading-relaxed break-words">
        {value}
      </td>
    </tr>
  );
}

function PropertyInspector({ mod }: { mod: ModuleDefinition }) {
  const p = mod.properties;
  return (
    <div className="bg-neutral-900/80 border border-neutral-700/40 rounded-xl p-4 text-white">
      <h3 className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-3">
        Properties
      </h3>
      <table className="w-full">
        <tbody>
          <PropertyRow label="Background" value={p.backgroundType.join(', ')} />
          <PropertyRow label="Headline" value={`${p.headlineSize} · ${p.headlineWeight}`} />
          <PropertyRow label="Body" value={`${p.bodySize} · ${p.bodyWeight}`} />
          <PropertyRow label="Alignment" value={p.textAlignment} />
          <PropertyRow label="Content Position" value={p.contentPosition} />
          <PropertyRow label="Corner Radius" value={p.cornerRadius} />
          <PropertyRow label="Max Width" value={p.maxWidth} />
          <PropertyRow label="Height" value={p.height} />
          <PropertyRow
            label="Overlay"
            value={p.hasOverlay ? p.overlayStyle || 'yes' : 'none'}
          />
          <PropertyRow label="Responsive" value={p.responsiveNotes} />
          {p.hasButtons && (
            <PropertyRow label="Buttons" value={p.buttonVariants?.join(', ') || 'yes'} />
          )}
          <PropertyRow
            label="Content-Driven"
            value={p.isContentDriven ? 'JSON / CMS' : 'Hardcoded'}
          />
        </tbody>
      </table>
      {mod.notes && (
        <p className="mt-3 text-[11px] text-white/30 leading-relaxed italic">{mod.notes}</p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Builder Notes / Reuse Contract panel                               */
/* ------------------------------------------------------------------ */

const STATUS_STYLES: Record<string, string> = {
  stable: 'bg-emerald-500/20 text-emerald-300',
  experimental: 'bg-amber-500/20 text-amber-300',
  deprecated: 'bg-red-500/20 text-red-300',
};

const REUSABILITY_STYLES: Record<string, string> = {
  drop_in: 'bg-emerald-500/20 text-emerald-300',
  needs_data: 'bg-blue-500/20 text-blue-300',
  page_specific: 'bg-amber-500/20 text-amber-300',
  do_not_reuse_directly: 'bg-red-500/20 text-red-300',
};

function Pill({ label, className }: { label: string; className: string }) {
  return (
    <span
      className={`inline-flex text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${className}`}
    >
      {label.replace(/_/g, ' ')}
    </span>
  );
}

function ContractRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 py-2 border-b border-neutral-700/30 last:border-0">
      <span className="text-[10px] font-medium text-white/40 uppercase tracking-wider">{label}</span>
      <div className="text-[11px] text-white/70 leading-relaxed break-words min-w-0">{value}</div>
    </div>
  );
}

function FieldList({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((i) => (
        <span
          key={i}
          className="text-[10px] font-mono text-white/60 border border-white/10 rounded px-1.5 py-0.5"
        >
          {i}
        </span>
      ))}
    </div>
  );
}

function ReuseContractPanel({ mod }: { mod: ModuleDefinition }) {
  const { status, surface, reusability, editableFields, dataContract, governance } = mod;
  const lifecycle = getModuleLifecycle(mod);

  const editable: string[] = [];
  if (editableFields) {
    if (editableFields.copy) editable.push('copy');
    if (editableFields.images) editable.push('images');
    if (editableFields.colors) editable.push('colors');
    if (editableFields.buttons) editable.push('buttons');
    if (editableFields.mergeFields?.length) editable.push(...editableFields.mergeFields);
  }

  return (
    <div className="bg-neutral-900/80 border border-neutral-700/40 rounded-xl p-4 text-white">
      <h3 className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-3">
        Builder Notes / Reuse Contract
      </h3>

      {/* Lifecycle / status / surface / reusability pills */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        <Pill
          label={LIFECYCLE_LABELS[lifecycle]}
          className={LIFECYCLE_BADGE_STYLES[lifecycle]}
        />
        {status && <Pill label={status} className={STATUS_STYLES[status] || 'bg-white/10 text-white/70'} />}
        {surface && <Pill label={surface} className="bg-white/10 text-white/70" />}
        {reusability && (
          <Pill
            label={reusability}
            className={REUSABILITY_STYLES[reusability] || 'bg-white/10 text-white/70'}
          />
        )}
      </div>

      {isLifecycleRuledOut(lifecycle) && (
        <p className="mb-3 text-[11px] text-amber-200/90 leading-relaxed">
          <span className="font-semibold">Not recommended for new builds.</span> See the lifecycle
          note above and the module notes below.
        </p>
      )}

      {/* Editable fields */}
      {editable.length > 0 && (
        <ContractRow label="CMS-editable fields" value={<FieldList items={editable} />} />
      )}

      {/* Data contract */}
      {dataContract?.contentSource && (
        <ContractRow label="Content source" value={dataContract.contentSource} />
      )}
      {dataContract?.mockDataPath && (
        <ContractRow
          label="Mock data"
          value={
            <span className="font-mono break-all text-[10px] leading-relaxed">
              {dataContract.mockDataPath}
            </span>
          }
        />
      )}
      {dataContract?.requiredProps && dataContract.requiredProps.length > 0 && (
        <ContractRow label="Required props" value={<FieldList items={dataContract.requiredProps} />} />
      )}
      {dataContract?.optionalProps && dataContract.optionalProps.length > 0 && (
        <ContractRow label="Optional props" value={<FieldList items={dataContract.optionalProps} />} />
      )}
      {dataContract?.fallbackStates && dataContract.fallbackStates.length > 0 && (
        <ContractRow label="Fallback states" value={<FieldList items={dataContract.fallbackStates} />} />
      )}

      {/* Governance */}
      {(governance?.cmsEditable != null || governance?.developerOwned != null) && (
        <ContractRow
          label="Ownership"
          value={
            <span>
              {governance?.cmsEditable ? 'CMS-editable (presentation)' : 'Not CMS-editable'}
              {governance?.developerOwned ? ' · developer-owned behavior' : ''}
            </span>
          }
        />
      )}
      {governance?.safetyNotes && governance.safetyNotes.length > 0 && (
        <ContractRow
          label="Safety notes"
          value={
            <ul className="list-disc list-inside space-y-1 text-amber-200/80">
              {governance.safetyNotes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          }
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

interface ModuleDetailProps {
  mod: ModuleDefinition;
}

export default function ModuleDetailPage({ mod }: ModuleDetailProps) {
  const variants = VARIANT_OPTIONS[mod.slug] || ['default'];
  const [activeVariant, setActiveVariant] = useState(variants[0]);
  const [viewport, setViewport] = useState<ViewportSize>('desktop');
  const [inspectorOpen, setInspectorOpen] = useState(false);

  const lifecycle = getModuleLifecycle(mod);
  const ruledOut = isLifecycleRuledOut(lifecycle);

  const categoryColors: Record<ModuleCategory, string> = {
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

  const currentWidth = VIEWPORT_PX[viewport];

  return (
    <>
      <Head>
        <title>{mod.name} &bull; Module Guide &bull; Fine Diet</title>
      </Head>

      <div className="min-h-screen bg-neutral-900 text-white">
        {/* ── Top bar ──────────────────────────────────────────── */}
        <header className="border-b border-neutral-700/40 bg-neutral-900 sticky top-0 z-30">
          <div className="max-w-[1600px] mx-auto px-5 py-4 flex items-center justify-between gap-4">
            {/* Left: breadcrumb + title */}
            <div className="flex items-center gap-3 min-w-0">
              <Link
                href="/style-guide/modules"
                className="text-xs text-white/40 hover:text-white/60 transition-colors antialiased shrink-0"
              >
                &larr; All Modules
              </Link>
              <span className="text-white/20 shrink-0">/</span>
              <h1 className="text-sm font-semibold antialiased truncate">{mod.name}</h1>
              <span
                className={`shrink-0 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${categoryColors[mod.category]}`}
              >
                {mod.category}
              </span>
              <span
                className={`shrink-0 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full ${LIFECYCLE_BADGE_STYLES[lifecycle]}`}
              >
                {LIFECYCLE_LABELS[lifecycle]}
              </span>
            </div>

            {/* Right: controls */}
            <div className="flex items-center gap-3 shrink-0">
              {/* Viewport toggle */}
              <div className="flex bg-neutral-800/60 rounded-full p-0.5">
                {(['mobile', 'tablet', 'desktop'] as ViewportSize[]).map((size) => (
                  <button
                    key={size}
                    onClick={() => setViewport(size)}
                    className={`text-[10px] font-medium px-3 py-1 rounded-full transition-colors antialiased ${
                      viewport === size
                        ? 'bg-white/10 text-white'
                        : 'text-white/40 hover:text-white/60'
                    }`}
                  >
                    {size === 'mobile' ? '375px' : size === 'tablet' ? '768px' : 'Full'}
                  </button>
                ))}
              </div>

              {/* Inspector toggle */}
              <button
                onClick={() => setInspectorOpen(!inspectorOpen)}
                className={`text-[10px] font-medium px-3 py-1.5 rounded-full transition-colors antialiased ${
                  inspectorOpen
                    ? 'bg-denim-500/20 text-denim-300'
                    : 'bg-neutral-800/60 text-white/40 hover:text-white/60'
                }`}
              >
                {inspectorOpen ? 'Hide Specs' : 'Show Specs'}
              </button>
            </div>
          </div>

          {/* Variant selector */}
          {variants.length > 1 && (
            <div className="max-w-[1600px] mx-auto px-5 pb-3 flex gap-2 overflow-x-auto">
              {variants.map((v) => (
                <button
                  key={v}
                  onClick={() => setActiveVariant(v)}
                  className={`shrink-0 text-[11px] font-medium px-3 py-1 rounded-full border transition-colors antialiased ${
                    activeVariant === v
                      ? 'border-white/30 text-white bg-white/10'
                      : 'border-white/10 text-white/40 hover:text-white/60'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          )}
        </header>

        {/* ── Body ─────────────────────────────────────────────── */}
        <div className={`flex ${inspectorOpen ? 'flex-col xl:flex-row' : 'flex-col'}`}>
          {/* Main preview area */}
          <main className="flex-1 min-w-0">
            {/* Description bar */}
            <div className="max-w-[1600px] mx-auto px-5 py-4 border-b border-neutral-800/60">
              {ruledOut && (
                <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2">
                  <span className="text-amber-300 text-sm leading-none mt-0.5">&#9888;</span>
                  <p className="text-xs text-amber-200/90 leading-relaxed antialiased">
                    <span className="font-semibold">
                      {LIFECYCLE_LABELS[lifecycle]} — not recommended for new builds.
                    </span>{' '}
                    {lifecycle === 'reference_only'
                      ? 'Useful for spacing/taste guidance or understanding the system — not a canonical main-page foundation. Deeper app/detail surfaces stay here until they are designed and accepted.'
                      : lifecycle === 'legacy'
                        ? 'Retained for reference only. Prefer an approved module for new work.'
                        : 'This module has been replaced or no longer meets current standards.'}{' '}
                    This route stays live for reference.
                  </p>
                </div>
              )}
              <p className="text-xs text-white/50 leading-relaxed antialiased max-w-3xl">
                {mod.description}
              </p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {mod.usedOn.map((page) => (
                  <span
                    key={page}
                    className="text-[10px] text-white/30 bg-white/5 rounded px-2 py-0.5 font-mono"
                  >
                    {page}
                  </span>
                ))}
              </div>
            </div>

            {/* Iframe render container */}
            <div className="flex justify-center py-8 px-5">
              <div
                className="overflow-hidden rounded-xl border border-neutral-700/30 shadow-lg transition-all duration-300"
                style={{ width: currentWidth ? `${currentWidth}px` : '100%' }}
              >
                <PreviewFrame
                  slug={mod.slug}
                  variant={activeVariant}
                  widthPx={currentWidth}
                />
              </div>
            </div>

            {/* Component path */}
            <div className="max-w-[1600px] mx-auto px-5 pb-8">
              <p className="text-[10px] text-white/20 font-mono">
                Source: {mod.componentPath}
              </p>
            </div>
          </main>

          {/* Inspector sidebar */}
          {inspectorOpen && (
            <aside className="w-full xl:w-80 shrink-0 border-t xl:border-t-0 xl:border-l border-neutral-700/40 p-5 overflow-y-auto xl:max-h-[calc(100vh-60px)] xl:sticky xl:top-[60px] space-y-5 min-w-0">
              <ReuseContractPanel mod={mod} />

              <PropertyInspector mod={mod} />

              {mod.variants.length > 0 && (
                <div className="mt-5">
                  <h3 className="text-xs font-semibold text-white/50 uppercase tracking-wider mb-2">
                    Variants
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {mod.variants.map((v) => (
                      <span
                        key={v}
                        className="text-[10px] text-white/50 border border-white/10 rounded-full px-2 py-0.5"
                      >
                        {v}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </aside>
          )}
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Static generation                                                  */
/* ------------------------------------------------------------------ */

export const getStaticPaths: GetStaticPaths = async () => {
  const paths = MODULE_STYLE_CATALOG.map((mod) => ({
    params: { slug: mod.slug },
  }));
  return { paths, fallback: false };
};

export const getStaticProps: GetStaticProps<ModuleDetailProps> = async ({ params }) => {
  const slug = params?.slug as string;
  const mod = MODULE_STYLE_CATALOG.find((m) => m.slug === slug);

  if (!mod) {
    return { notFound: true };
  }

  return {
    props: { mod },
  };
};
