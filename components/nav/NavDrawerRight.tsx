import { useEffect, useRef } from 'react';
import Image from 'next/image';

import { Button } from '@/components/ui/Button';
import { NavigationCategory, NavigationItem, NavigationSubcategory } from './types';

interface NavDrawerRightProps {
  category: NavigationCategory;
  activeSubcategoryId: string | null;
  activeItemId: string | null;
  onNavigate: (href: string) => void;
}

export const NavDrawerRight = ({
  category,
  activeSubcategoryId,
  activeItemId,
  onNavigate,
}: NavDrawerRightProps) => {
  const previewRef = useRef<HTMLDivElement | null>(null);

  const activeSubcategory: NavigationSubcategory | undefined = category.subcategories.find(
    (sub) => sub.id === activeSubcategoryId
  );

  const activeItem: NavigationItem | undefined = activeSubcategory?.items.find(
    (item) => item.id === activeItemId
  );

  useEffect(() => {
    if (previewRef.current) {
      previewRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [activeItemId]);

  if (!activeItem) {
    return (
      <div className="w-full md:w-2/3 p-6 text-white/80">
        <p className="text-sm">Select an option to see details.</p>
      </div>
    );
  }

  const buttons = activeItem.buttons ?? [];

  return (
    <div className="w-full md:w-2/3 p-6 space-y-4 overflow-y-auto max-h-[480px]">
      <div
        ref={previewRef}
        className="flex flex-col gap-6 items-start rounded-[2.5rem] bg-neutral-800/80 p-5 md:flex-row"
      >
        <div className="relative w-full overflow-hidden rounded-[2.5rem] md:w-1/3">
          <div className="relative aspect-square">
            <Image src={activeItem.image} alt={activeItem.title} fill className="object-cover" />
          </div>
        </div>
        <div className="flex-1 space-y-3 text-white">
          <div className="space-y-1">
            <p className="text-sm uppercase tracking-wide text-white/60">{category.label}</p>
            <h3 className="text-3xl font-semibold">{activeItem.title}</h3>
          </div>
          <p className="text-base font-light text-white/80">{activeItem.description}</p>
          {buttons.length > 0 && (
            <div className="flex w-full flex-wrap gap-3">
              {buttons.map((button) => {
                const targetHref = button.href ?? activeItem.href;
                return (
                  <Button
                    key={button.label}
                    variant={button.variant as any}
                    size="md"
                    onClick={() => {
                      if (targetHref) {
                        onNavigate(targetHref);
                      }
                    }}
                    className="flex-1 min-w-[140px] gap-2"
                  >
                    <span>{button.label}</span>
                  </Button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
