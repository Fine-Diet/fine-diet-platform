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

  // Find the active item across all subcategories, not just the active one
  let activeItem: NavigationItem | undefined;
  for (const subcategory of category.subcategories) {
    const foundItem = subcategory.items.find((item) => item.id === activeItemId);
    if (foundItem) {
      activeItem = foundItem;
      break;
    }
  }

  useEffect(() => {
    if (previewRef.current) {
      previewRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [activeItemId]);

  if (!activeItem) {
    return (
      <div className="w-full p-2 text-white/80">
        <p className="text-sm antialiased">Hover over an item to see details.</p>
      </div>
    );
  }

  const buttons = activeItem.buttons ?? [];

  return (
    <div className="w-full md:w-4/5 p-6 space-y-4 pt-5 overflow-y-auto max-h-[480px]">
      <div
        ref={previewRef}
        className="flex flex-col gap-6 items-start  p-5 md:flex-row"
      >
        <div className="relative w-full overflow-hidden rounded-[2.5rem]">
          <div className="relative aspect-square min-w-[400px] min-h-[400px]">
            <Image src={activeItem.image} alt={activeItem.title} fill className="object-cover" />
          </div>
        </div>
        <div className="flex-1 text-white">
          <h3 className="text-3xl font-semibold antialiased">{activeItem.title}</h3>
          <p className="antialiased mt-1 mb-2 text-base font-light leading-5 text-white font-light">{activeItem.description}</p>
          {buttons.length > 0 && (
            <div className="flex w-full gap-3">
              {buttons.map((button, index) => {
                const targetHref = button.href ?? activeItem.href;
                const basisClass = index === 0 ? 'basis-2/5' : index === 1 ? 'basis-3/5' : 'basis-full';
                return (
                  <Button
                    key={button.label}
                    variant={button.variant as any}
                    size="sm"
                    onClick={() => {
                      if (targetHref) {
                        onNavigate(targetHref);
                      }
                    }}
                    className={`${basisClass} min-w-[140px] gap-2 justify-center`}
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
