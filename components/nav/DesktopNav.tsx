import Image from 'next/image';
import { NavigationData, NavigationCategory } from './types';
import { NavCategoryButton } from './NavCategoryButton';

interface DesktopNavProps {
  navigation: NavigationData;
  activeCategoryId: string | null;
  onCategorySelect: (categoryId: string) => void;
  onCategoryHover?: (categoryId: string) => void;
}

export const DesktopNav = ({
  navigation,
  activeCategoryId,
  onCategorySelect,
  onCategoryHover,
}: DesktopNavProps) => {
  const handleCategoryClick = (category: NavigationCategory) => {
    onCategorySelect(category.id);
  };

  return (
    <div className="hidden w-full items-center justify-between md:flex">
      <div className="flex items-center gap-8">
        <Image
          src="/images/home/Fine-Diet-Logo.svg"
          alt="Fine Diet"
          width={120}
          height={32}
          priority
          className="h-8 w-auto"
        />
      </div>
      <div className="flex items-center gap-2">
        {navigation.categories.map((category) => (
          <NavCategoryButton
            key={category.id}
            label={category.label}
            isActive={activeCategoryId === category.id}
            onClick={() => handleCategoryClick(category)}
            onMouseEnter={() => onCategoryHover?.(category.id)}
          />
        ))}
      </div>
    </div>
  );
};
