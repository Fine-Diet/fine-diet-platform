import { NavigationData } from './types';
import { NavCategoryButton } from './NavCategoryButton';
import { ArrowUpRightIcon } from '@heroicons/react/24/outline';

interface DesktopNavProps {
  navigation: NavigationData;
  activeCategoryId: string | null;
  onCategorySelect: (categoryId: string) => void;
  onCategoryHover?: (categoryId: string) => void;
  onCategoryHoverCancel?: () => void;
  onAccountClick: () => void;
  isAuthed?: boolean;
  isAccountDrawerOpen?: boolean;
}

export const DesktopNav = ({
  navigation,
  activeCategoryId,
  onCategorySelect,
  onCategoryHover,
  onCategoryHoverCancel,
  onAccountClick,
  isAuthed,
  isAccountDrawerOpen,
}: DesktopNavProps) => {
  return (
    <div className="hidden flex-1 items-center justify-between gap-2 md:flex">
      <div className="flex flex-1 items-center justify-end lg:gap-6 md:gap-1 md:pr-0 lg:pr-4">
        {navigation.categories.map((category) => (
          <NavCategoryButton
            key={category.id}
            label={category.label}
            isActive={activeCategoryId === category.id}
            onClick={() => onCategorySelect(category.id)}
            onMouseEnter={() => onCategoryHover?.(category.id)}
            onMouseLeave={() => onCategoryHoverCancel?.()}
          />
        ))}
      </div>
      <div className="flex items-center gap-9 text-base font-semibold text-white antialiased">
        <div className="relative flex">
          <span className="pointer-events-none absolute inset-y-[-6px] inset-x-[-4px] rounded-[2.5rem] backdrop-blur-sm bg-gradient-to-r from-accent-300 via-denim-700 to-neutral-500 transition"/>
          <a
            href={navigation.topLinks.journal.href}
            className="relative flex items-center gap-1 px-4 pt-2 pb-[6px] text-black transition hover:opacity-90 antialiased"
            target="_blank"
            rel="noopener noreferrer"
          >
            <span>{navigation.topLinks.journal.label.replace(/\s*↗$/, '')}</span>
            <ArrowUpRightIcon className="h-3 w-3 -translate-y-[1px]" strokeWidth={3.5} />
          </a>
        </div>
        <div className="relative flex flex-col items-center">
          <button
            onClick={onAccountClick}
            className="hover:text-white/70 antialiased"
          >
            {isAuthed ? 'Account' : 'Login'}
          </button>
          {/* Triangle indicator — mirrors NavCategoryButton active state */}
          {isAccountDrawerOpen && (
            <span
              className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-0 h-0"
              style={{
                borderLeft: '4px solid transparent',
                borderRight: '4px solid transparent',
                borderTop: '4px solid white',
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
};
