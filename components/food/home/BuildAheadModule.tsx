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
      className="overflow-visible bg-neutral-900 px-0 pb-20 pt-10 sm:px-0 sm:pb-24 sm:pt-12"
      contentClassName="max-w-none"
    >
      <FoodHomeColumn>
        <p className="text-sm font-medium text-white/55 antialiased">Build Ahead</p>
        <h2 className="mt-3 max-w-[22ch] text-4xl font-semibold leading-tight text-white antialiased sm:text-5xl">
          Add meals and recipes to your library
        </h2>
        <p className="mt-4 max-w-[36ch] text-base font-light leading-relaxed text-white/55 antialiased">
          Save options now. Decide when to make them later.
        </p>
        <div className="mt-8">
          <AddNewMenu onAction={onAction} />
        </div>
      </FoodHomeColumn>
    </StackedPageSection>
  );
}
