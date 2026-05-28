'use client';

import Link from 'next/link';
import type { ProgramProgressSummary } from '@/lib/programs/progressTypes';
import type { ProgramRuntimeSummary } from '@/lib/programs/runtimeTypes';
import {
  filterVisibleDeliveryModules,
  resolveDeliveryModuleCopy,
  type ProgramDeliveryBlock,
  type ProgramDeliveryCta,
  type ProgramDeliveryModuleDefinition,
  type ProgramDeliveryRuntimeContext,
  type ProgramDeliveryTone,
} from '@/lib/programs/deliveryModuleTypes';

interface ProgramDeliveryModulesProps {
  runtimeSummary: ProgramRuntimeSummary | null;
  progressSummary?: ProgramProgressSummary | null;
  modules: ProgramDeliveryModuleDefinition[];
  checkinDue?: boolean;
  day21Handled?: boolean;
  anchors?: Record<string, string>;
}

function formatDateKey(dateKey: string | null | undefined): string {
  if (!dateKey) return 'Not selected';

  try {
    return new Date(`${dateKey}T00:00:00`).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateKey;
  }
}

function capacityLabel(capacity: string | null | undefined): string {
  if (!capacity) return 'Not set';
  return capacity.charAt(0).toUpperCase() + capacity.slice(1);
}

function metricValue(
  metric: 'selected_start' | 'current_day' | 'capacity' | 'content_progress',
  runtimeSummary: ProgramRuntimeSummary | null,
  progressSummary: ProgramProgressSummary | null | undefined,
): { label: string; value: string } {
  switch (metric) {
    case 'selected_start':
      return {
        label: 'Selected start',
        value: formatDateKey(runtimeSummary?.enrollment.selected_start_date),
      };
    case 'current_day':
      return {
        label: 'Current day',
        value:
          runtimeSummary == null
            ? 'Not enrolled'
            : `Day ${runtimeSummary.current_day}`,
      };
    case 'capacity':
      return {
        label: 'Capacity',
        value: capacityLabel(runtimeSummary?.enrollment.current_capacity),
      };
    case 'content_progress':
      return {
        label: 'Progress',
        value: progressSummary
          ? `${progressSummary.items_completed}/${progressSummary.items_total} content items complete`
          : 'Program content progress will appear once items are started.',
      };
  }
}

function toneClass(tone: ProgramDeliveryTone | undefined): string {
  switch (tone) {
    case 'emerald':
      return 'border-emerald-300/15 bg-emerald-400/[0.06]';
    case 'sky':
      return 'border-sky-300/15 bg-sky-400/[0.06]';
    case 'brand':
      return 'border-brand-50/20 bg-brand-50/[0.07]';
    case 'muted':
      return 'border-dashed border-white/15 bg-white/[0.03]';
    case 'neutral':
    default:
      return 'border-white/[0.06] bg-white/[0.035]';
  }
}

function linkToneClass(tone: ProgramDeliveryTone | undefined): string {
  switch (tone) {
    case 'emerald':
      return 'border-emerald-300/25 bg-emerald-400/10 text-emerald-100 hover:bg-emerald-400/15';
    case 'brand':
      return 'border-brand-50/25 bg-brand-50/10 text-brand-50 hover:bg-brand-50/15';
    case 'sky':
      return 'border-sky-300/25 bg-sky-400/10 text-sky-100 hover:bg-sky-400/15';
    case 'muted':
      return 'border-white/12 bg-white/[0.04] text-white/60 hover:bg-white/[0.08]';
    case 'neutral':
    default:
      return 'border-denim-200/25 bg-denim-500/20 text-denim-100 hover:bg-denim-500/30';
  }
}

function renderTemplate(
  value: string,
  runtimeSummary: ProgramRuntimeSummary | null,
): string {
  return value.replace(
    /\{\{\s*current_day\s*\}\}/g,
    runtimeSummary ? String(runtimeSummary.current_day) : '',
  );
}

function DetailPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.04] px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-white/40">
        {label}
      </p>
      <p className="mt-0.5 text-xs font-semibold text-white/82">{value}</p>
    </div>
  );
}

function RoadmapBlock({
  block,
  currentDay,
}: {
  block: Extract<ProgramDeliveryBlock, { type: 'roadmap' }>;
  currentDay: number | null;
}) {
  return (
    <ol className="space-y-2">
      {block.items.map((item) => {
        const isCurrent =
          currentDay != null &&
          item.dayStart != null &&
          item.dayEnd != null &&
          currentDay >= item.dayStart &&
          currentDay <= item.dayEnd;
        return (
          <li
            key={item.key}
            className={`rounded-2xl border p-3 ${
              isCurrent
                ? 'border-emerald-300/25 bg-emerald-400/10'
                : 'border-white/[0.06] bg-white/[0.035]'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">{item.label}</p>
                <p className="mt-1 text-xs leading-snug text-white/58">
                  {item.description}
                </p>
              </div>
              <span className="shrink-0 rounded-full border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-white/52">
                {item.range}
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function BlockRenderer({
  block,
  runtimeSummary,
  progressSummary,
}: {
  block: ProgramDeliveryBlock;
  runtimeSummary: ProgramRuntimeSummary | null;
  progressSummary: ProgramProgressSummary | null | undefined;
}) {
  switch (block.type) {
    case 'metrics':
      return (
        <div className="grid gap-2 sm:grid-cols-4">
          {block.metrics.map((metric) => (
            <DetailPill
              key={metric}
              {...metricValue(metric, runtimeSummary, progressSummary)}
            />
          ))}
        </div>
      );
    case 'list':
      return (
        <ul className="grid gap-2 sm:grid-cols-2">
          {block.items.map((item) => (
            <li
              key={item}
              className="rounded-2xl border border-white/[0.06] bg-white/[0.035] p-3 text-sm leading-snug text-white/78"
            >
              {item}
            </li>
          ))}
        </ul>
      );
    case 'cards':
      return (
        <div className="grid gap-3 sm:grid-cols-3">
          {block.cards.map((card) => (
            <div
              key={card.title}
              className="rounded-2xl border border-white/[0.06] bg-white/[0.035] p-3"
            >
              <p className="text-sm font-semibold text-white">{card.title}</p>
              <p className="mt-1 text-xs leading-snug text-white/58">
                {card.body}
              </p>
            </div>
          ))}
        </div>
      );
    case 'notice':
      return (
        <div className={`rounded-2xl border p-3 ${toneClass(block.tone)}`}>
          {block.eyebrow && (
            <p className="text-xs font-semibold uppercase tracking-wider text-white/45">
              {block.eyebrow}
            </p>
          )}
          <p className="text-sm font-semibold text-white">
            {renderTemplate(block.title, runtimeSummary)}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-white/62">
            {renderTemplate(block.body, runtimeSummary)}
          </p>
        </div>
      );
    case 'roadmap':
      return (
        <RoadmapBlock
          block={block}
          currentDay={runtimeSummary?.current_day ?? null}
        />
      );
  }
}

function ctaHref(
  cta: ProgramDeliveryCta,
  anchors: Record<string, string> | undefined,
): string | null {
  if (cta.href) return cta.href;
  if (cta.anchorKey && anchors?.[cta.anchorKey]) {
    return `#${anchors[cta.anchorKey]}`;
  }
  return null;
}

function ctaVisible(
  cta: ProgramDeliveryCta,
  ctx: ProgramDeliveryRuntimeContext,
): boolean {
  const conditions = Array.isArray(cta.showWhen)
    ? cta.showWhen
    : [cta.showWhen ?? 'always'];

  return conditions.every((condition) => {
    switch (condition) {
      case 'checkin_due':
        return Boolean(ctx.checkinDue);
      case 'checkin_not_due':
        return !ctx.checkinDue;
      case 'day21_handled':
        return Boolean(ctx.day21Handled);
      case 'day21_not_handled':
        return !ctx.day21Handled;
      case 'always':
      default:
        return true;
    }
  });
}

function ModuleCta({
  cta,
  anchors,
  ctx,
}: {
  cta: ProgramDeliveryCta;
  anchors: Record<string, string> | undefined;
  ctx: ProgramDeliveryRuntimeContext;
}) {
  if (!ctaVisible(cta, ctx)) return null;
  const href = ctaHref(cta, anchors);

  if (cta.disabled || !href) {
    return (
      <div>
        <button
          type="button"
          disabled
          className="inline-flex cursor-not-allowed rounded-full border border-white/12 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-white/42"
        >
          {cta.label}
        </button>
        {cta.microcopy && (
          <p className="mt-2 text-xs leading-snug text-white/48">
            {cta.microcopy}
          </p>
        )}
      </div>
    );
  }

  return (
    <div>
      <Link
        href={href}
        className={`inline-flex rounded-full border px-3 py-1.5 text-xs font-semibold ${linkToneClass(
          cta.tone,
        )}`}
      >
        {cta.label}
      </Link>
      {cta.microcopy && (
        <p className="mt-2 text-xs leading-snug text-white/58">
          {cta.microcopy}
        </p>
      )}
    </div>
  );
}

function DeliveryCard({
  module,
  runtimeSummary,
  progressSummary,
  anchors,
  ctx,
}: {
  module: ProgramDeliveryModuleDefinition;
  runtimeSummary: ProgramRuntimeSummary | null;
  progressSummary: ProgramProgressSummary | null | undefined;
  anchors: Record<string, string> | undefined;
  ctx: ProgramDeliveryRuntimeContext;
}) {
  const copy = resolveDeliveryModuleCopy(module, runtimeSummary);
  const hasDetailContent =
    Boolean(module.blocks?.length) ||
    Boolean(copy.practice) ||
    Boolean(module.cta) ||
    Boolean(module.safetyNotes?.length) ||
    Boolean(module.noClaimsNotes?.length);
  const notes = [
    ...(module.safetyNotes ?? []),
    ...(module.noClaimsNotes ?? []),
  ];

  return (
    <section
      id={module.anchorId}
      className="rounded-3xl border border-white/[0.07] bg-white/[0.04] p-4"
    >
      {copy.eyebrow && (
        <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/42">
          {copy.eyebrow}
        </p>
      )}
      <h3 className="mt-1 text-xl font-semibold leading-tight text-white">
        {copy.title}
      </h3>
      <p className="mt-2 text-sm leading-relaxed text-white/68">{copy.body}</p>
      {hasDetailContent && (
        <div className="mt-4 space-y-3">
          {module.blocks?.map((block, index) => (
            <BlockRenderer
              key={`${module.id}-${block.type}-${index}`}
              block={block}
              runtimeSummary={runtimeSummary}
              progressSummary={progressSummary}
            />
          ))}
          {copy.practice && (
            <div className={`rounded-2xl border p-3 ${toneClass('sky')}`}>
              <p className="text-xs font-semibold uppercase tracking-wider text-sky-100/75">
                Capacity-aware practice
              </p>
              <p className="mt-1 text-sm leading-relaxed text-white/72">
                {copy.practice}
              </p>
            </div>
          )}
          {module.cta && (
            <ModuleCta cta={module.cta} anchors={anchors} ctx={ctx} />
          )}
          {notes.length > 0 && (
            <ul className="space-y-1 rounded-2xl border border-white/[0.06] bg-white/[0.025] p-3">
              {notes.map((note) => (
                <li
                  key={note}
                  className="text-xs leading-relaxed text-white/52"
                >
                  {note}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

export function ProgramDeliveryModules({
  runtimeSummary,
  progressSummary,
  modules,
  checkinDue = false,
  day21Handled = false,
  anchors,
}: ProgramDeliveryModulesProps) {
  const ctx: ProgramDeliveryRuntimeContext = {
    runtimeSummary,
    checkinDue,
    day21Handled,
  };
  const visibleModules = filterVisibleDeliveryModules(modules, ctx);
  if (visibleModules.length === 0) return null;

  const groups: Array<{
    key: string;
    title: string | null;
    modules: ProgramDeliveryModuleDefinition[];
  }> = [];
  for (const module of visibleModules) {
    const key = module.groupId ?? module.id;
    const existing = groups.find((group) => group.key === key);
    if (existing) {
      existing.modules.push(module);
    } else {
      groups.push({
        key,
        title: module.groupTitle ?? null,
        modules: [module],
      });
    }
  }

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <section key={group.key}>
          {group.title && (
            <h2 className="mb-2 text-[11px] uppercase tracking-wider text-white/50">
              {group.title}
            </h2>
          )}
          <div className="space-y-3">
            {group.modules.map((module) => (
              <DeliveryCard
                key={module.id}
                module={module}
                runtimeSummary={runtimeSummary}
                progressSummary={progressSummary}
                anchors={anchors}
                ctx={ctx}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
