import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** z-index steps for stacked page layers (layer 1 → z-10, layer 2 → z-20, …). */
const LAYER_Z_CLASSES = ['z-10', 'z-20', 'z-30', 'z-40', 'z-50', 'z-[60]'] as const;

export const STACKED_SECTION_OVERLAP = '-mt-8';
export const STACKED_SECTION_TOP_RADIUS = 'rounded-t-[2rem]';

/** Safe `z-*` token for a 1-based stacked layer (clamped to the allowlist). */
export function layerZClass(layer: number): string {
  const index = Math.max(0, layer - 1);
  return LAYER_Z_CLASSES[Math.min(index, LAYER_Z_CLASSES.length - 1)];
}

/** Overlap, rounded top, z-index shell for a 1-based stacked section layer. */
export function stackedLayerClasses(layer: number, ...classNames: Parameters<typeof cn>): string {
  return cn(
    'relative',
    STACKED_SECTION_OVERLAP,
    STACKED_SECTION_TOP_RADIUS,
    'overflow-hidden',
    layerZClass(layer),
    ...classNames,
  );
}

export type StackedPageSectionProps = {
  /** 1-based stack order; each layer sits above the previous. */
  layer: number;
  children: ReactNode;
  className?: string;
  /** Override inner content width (default: max-w-[650px]). */
  contentClassName?: string;
};

/**
 * Full-width page section that overlaps the layer below via negative top margin
 * and a rounded top edge. Use after StackedPageHero or another stacked section.
 */
export function StackedPageSection({
  layer,
  children,
  className,
  contentClassName,
}: StackedPageSectionProps) {
  return (
    <section
      className={cn(
        'relative',
        STACKED_SECTION_OVERLAP,
        STACKED_SECTION_TOP_RADIUS,
        'px-6 pt-6 sm:pt-7 pb-20 sm:px-5',
        layerZClass(layer),
        className,
      )}
    >
      <div className={cn('mx-auto w-full max-w-[650px]', contentClassName)}>{children}</div>
    </section>
  );
}

export type StackedPageHeroProps = {
  children: ReactNode;
  className?: string;
};

/** Bottom layer of a stacked page — flat bottom edge, z-0. */
export function StackedPageHero({ children, className }: StackedPageHeroProps) {
  return <div className={cn('relative z-0', className)}>{children}</div>;
}
