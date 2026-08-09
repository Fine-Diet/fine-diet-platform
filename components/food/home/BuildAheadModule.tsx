'use client';

import { StackedPageSection } from '@/components/layout/StackedPageSection';
import { AddNewMenu, type AddNewActionId } from '@/components/food/home/AddNewMenu';
import { FoodHomeColumn } from '@/components/food/home/FoodHomeColumn';

export function BuildAheadModule({
  onAction,
}: {
  onAction: (action: AddNewActionId) => void;
}) {
  return (
    <StackedPageSection
      layer={1}
      className="overflow-visible bg-neutral-900 px-12 pb-20 pt-10 sm:px-12 sm:pb-24 sm:pt-12"
      contentClassName="max-w-none"
    >
      <FoodHomeColumn>
        <p className="text-regular font-regular text-white antialiased text-white/50">Build Ahead</p>
        <h2 className="mt-1 text-4xl font-regular leading-[1] tracking-tight text-white antialiased md:text-4xl">
          Add meals and recipes to your library
        </h2>
        <p className="mt-1 text-base font-light leading-relaxed text-white/55 antialiased">
          Save options now. Decide when to make them later.
        </p>
        <div className="mt-4">
          <AddNewMenu onAction={onAction} />
        </div>
      </FoodHomeColumn>
    </StackedPageSection>
  );
}
