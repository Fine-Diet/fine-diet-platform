/**
 * Module: grid.cards.v1
 *
 * Responsive 2-column grid of image cards with optional buttons.
 * Thin adapter over the existing GridSection component.
 */

import { GridSection } from '@/components/home/GridSection';
import type { GridCardsV1Content } from '@/lib/modules/types';

interface Props {
  content: GridCardsV1Content;
}

export function GridCardsV1({ content }: Props) {
  return (
    <div className="px-3 pb-3 pt-1.5">
      <GridSection
        section={{
          title: content.title,
          items: content.items.map((item) => ({
            title: item.title,
            description: item.description,
            image: item.image,
            button: item.button
              ? {
                  label: item.button.label,
                  variant: item.button.variant ?? 'primary',
                  href: item.button.href,
                }
              : undefined,
            aspect: item.aspect,
          })),
        }}
      />
    </div>
  );
}
