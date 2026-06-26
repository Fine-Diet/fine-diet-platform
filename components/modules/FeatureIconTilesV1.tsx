/**
 * Module: feature.icon-tiles.v1
 *
 * Heading + supporting intro + a row of icon tiles. Author-driven editorial
 * content with an ALLOWLISTED icon enum — content selects an icon by key and the
 * renderer maps it to a code-owned component, so a composition can never inject
 * an arbitrary glyph.
 *
 * Mirrors the code-owned CategoryDifferentiators section. Presentational only
 * (no hooks) — safe for SSR and direct unit-test rendering.
 */

import type { ComponentType } from 'react';
import type { FeatureIconTilesV1Content, FeatureIconName } from '@/lib/modules/types';
import type { IconProps } from '@/components/icons';
import {
  InsightsIcon,
  ProgramsIcon,
  NotebookIcon,
  QuadrantsIcon,
  HomeIcon,
  SaveIcon,
} from '@/components/icons';
import { cn } from '@/lib/utils';

const ICONS: Record<FeatureIconName, ComponentType<IconProps>> = {
  insights: InsightsIcon,
  programs: ProgramsIcon,
  notebook: NotebookIcon,
  quadrants: QuadrantsIcon,
  home: HomeIcon,
  save: SaveIcon,
};

interface Props {
  content: FeatureIconTilesV1Content;
}

export function FeatureIconTilesV1({ content }: Props) {
  if (content.tiles.length === 0) return null;
  const isDark = (content.surface ?? 'dark') === 'dark';

  return (
    <section
      className={cn(
        'px-6 py-16 sm:py-20',
        isDark ? 'bg-brand-900 text-white' : 'bg-brand-50 text-brand-900',
      )}
    >
      <div className="mx-auto max-w-3xl">
        <h2 className="text-3xl font-semibold leading-tight tracking-[-0.03em] antialiased sm:text-4xl">
          {content.heading}
        </h2>
        {content.intro && (
          <p
            className={cn(
              'mt-6 max-w-3xl text-base font-light leading-relaxed sm:text-lg',
              isDark ? 'text-white/76' : 'text-brand-900/68',
            )}
          >
            {content.intro}
          </p>
        )}
        <div className="mt-12 grid gap-10 sm:grid-cols-3 sm:gap-0">
          {content.tiles.map((tile, index) => {
            const Icon = tile.icon ? ICONS[tile.icon] : null;
            return (
              <div
                key={`${tile.title}-${index}`}
                className={cn(
                  index > 0 ? 'sm:border-l sm:pl-10' : undefined,
                  index < content.tiles.length - 1 ? 'sm:pr-10' : undefined,
                  isDark ? 'sm:border-white/40' : 'sm:border-brand-900/15',
                )}
              >
                {Icon && (
                  <Icon
                    className={cn('h-7 w-7', isDark ? 'text-white' : 'text-brand-900')}
                    aria-hidden="true"
                  />
                )}
                <h3 className="mt-6 text-base font-semibold antialiased">
                  {tile.title}
                </h3>
                <p
                  className={cn(
                    'mt-4 text-base font-light leading-relaxed',
                    isDark ? 'text-white/76' : 'text-brand-900/68',
                  )}
                >
                  {tile.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
