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
  if (!category) {
    return null;
  }

  const transitionClasses = open
    ? 'translate-y-0 opacity-100'
    : '-translate-y-4 opacity-0 pointer-events-none';

  return (
    <div className="absolute left-0 right-0 top-full z-[50] pt-4 px-4">
      <div
        className={`mx-auto max-w-[1000px] rounded-[2.5rem] bg-black/50 backdrop-blur-lg text-white shadow-large overflow-hidden transform transition-all duration-300 ease-out ${transitionClasses}`}
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
