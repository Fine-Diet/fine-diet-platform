import { NavigationCategory } from './types';
import { NavDrawerLeft } from './NavDrawerLeft';
import { NavDrawerRight } from './NavDrawerRight';
import { NavDrawerProspect } from './NavDrawerProspect';

interface NavDrawerProps {
  open: boolean;
  category: NavigationCategory | null;
  activeSubcategoryId: string | null;
  activeItemId: string | null;
  onSubcategorySelect: (subcategoryId: string) => void;
  onItemSelect: (itemId: string) => void;
  onNavigate: (href: string) => void;
}

export const NavDrawer = ({
  open,
  category,
  activeSubcategoryId,
  activeItemId,
  onSubcategorySelect,
  onItemSelect,
  onNavigate,
}: NavDrawerProps) => {
  const transitionClasses = open
    ? 'translate-y-0 opacity-100 pointer-events-auto'
    : '-translate-y-4 opacity-0 pointer-events-none';

  // Always render the container for smooth transitions
  if (!category) {
    return (
      <div className="absolute left-0 right-0 top-full z-[50] pt-4 px-4 pb-[15px] pointer-events-none">
        <div className="mx-auto max-w-[1200px] max-h-[calc(100vh-116px)] rounded-[2.5rem] bg-black/50 backdrop-blur-lg text-white shadow-large overflow-y-auto transform transition-all duration-500 ease-out scrollbar-hide flex flex-col justify-start -translate-y-4 opacity-0">
        </div>
      </div>
    );
  }

  return (
    <div className="absolute left-0 right-0 top-full z-[50] pt-4 px-0 mx-5 pb-[15px]">
      <div
        className={`mx-auto max-w-[1200px] max-h-[calc(100vh-116px)] rounded-[2.5rem] bg-neutral-900/50 backdrop-blur-lg text-white shadow-large overflow-y-auto transform transition-all duration-500 ease-out scrollbar-hide flex flex-col justify-start ${transitionClasses}`}
      >
        {/* Top Row: Left Nav + Right Preview */}
        <div className="flex mt-10 ml-3 flex-col md:flex-row">
          <NavDrawerLeft
            subcategories={category.subcategories}
            activeSubcategoryId={activeSubcategoryId}
            activeItemId={activeItemId}
            onSubcategorySelect={onSubcategorySelect}
            onItemSelect={onItemSelect}
          />
          <NavDrawerRight
            category={category}
            activeSubcategoryId={activeSubcategoryId}
            activeItemId={activeItemId}
            onNavigate={onNavigate}
          />
        </div>

        {/* Bottom Row: Prospect Product (if exists) */}
        {(category as any).prospectProduct && (
          <NavDrawerProspect
            prospectProduct={(category as any).prospectProduct}
            onNavigate={onNavigate}
          />
        )}
      </div>
    </div>
  );
};
