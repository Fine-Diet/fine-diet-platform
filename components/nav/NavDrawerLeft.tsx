import { NavigationSubcategory } from './types';

interface NavDrawerLeftProps {
  subcategories: NavigationSubcategory[];
  activeSubcategoryId: string | null;
  activeItemId: string | null;
  onSubcategorySelect: (subcategoryId: string) => void;
  onItemSelect: (itemId: string) => void;
}

export const NavDrawerLeft = ({
  subcategories,
  activeSubcategoryId,
  activeItemId,
  onSubcategorySelect,
  onItemSelect,
}: NavDrawerLeftProps) => {
  return (
    <div className="w-full md:w-1/5 md:min-w-[230px] border-dotted border-r border-r-[.5px] border-white/5 pl-5 pr-1 pt-[47px] space-y-10">
      {subcategories.map((subcategory) => {
        return (
          <div key={subcategory.id} className="space-y-2">
            <div
              className="text-left text-base font-semibold text-white/100 antialiased"
            >
              {subcategory.name}
            </div>
            <div className="space-y-1 ml-3">
              {subcategory.items.map((item) => {
                const isActiveItem = activeItemId === item.id;
                const colorClasses = isActiveItem
                  ? 'text-white'
                  : 'text-white/95 hover:text-white';
                const transformClasses = isActiveItem
                  ? 'translate-x-[3px]'
                  : 'hover:translate-x-[3px]';
                return (
                  <button
                    key={item.id}
                    type="button"
                    onMouseEnter={() => onItemSelect(item.id)}
                    className={`block w-full text-left text-sm font-light transform transition-transform duration-150 antialiased ${colorClasses} ${transformClasses}`}
                  >
                    {isActiveItem ? `• ${item.title}` : item.title}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};
