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
    <div className="w-full md:w-1/3 border-r border-white/10 p-4 space-y-6">
      {subcategories.map((subcategory) => {
        const isActiveSubcategory = activeSubcategoryId === subcategory.id;
        return (
          <div key={subcategory.id} className="space-y-3">
            <button
              type="button"
              onClick={() => onSubcategorySelect(subcategory.id)}
              className={`text-left text-base font-semibold transition-colors duration-200 antialiased ${
                isActiveSubcategory ? 'text-white' : 'text-white/70 hover:text-white'
              }`}
            >
              {isActiveSubcategory ? `• ${subcategory.name}` : subcategory.name}
            </button>
            <div className="space-y-2">
              {subcategory.items.map((item) => {
                const isActiveItem = activeItemId === item.id;
                const colorClasses = isActiveItem
                  ? 'text-white'
                  : 'text-white/70 hover:text-white';
                const transformClasses = isActiveItem
                  ? 'translate-x-[3px]'
                  : 'hover:translate-x-[3px]';
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onItemSelect(item.id)}
                    className={`block w-full text-left text-sm font-light transform transition-transform duration-150 antialiased ${colorClasses} ${transformClasses}`}
                  >
                    {item.title}
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
