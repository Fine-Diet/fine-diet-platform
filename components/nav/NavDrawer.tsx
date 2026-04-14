import { NavigationCategory } from './types';
import { NavDrawerCards } from './NavDrawerCards';

interface NavDrawerProps {
  open: boolean;
  category: NavigationCategory | null;
  onNavigate: (href: string) => void;
}

export const NavDrawer = ({
  open,
  category,
  onNavigate,
}: NavDrawerProps) => {
  const transitionClasses = open
    ? 'translate-y-0 opacity-100 pointer-events-auto'
    : '-translate-y-4 opacity-0 pointer-events-none';

  if (!category) {
    return (
      <div className="absolute left-0 right-0 top-full z-[50] pt-4 px-4 pb-[15px] pointer-events-none">
        <div className="mx-auto max-w-[1200px] max-h-[calc(100vh-116px)] rounded-[2.5rem] bg-black/50 backdrop-blur-lg text-white shadow-large overflow-y-auto transform transition-all duration-500 ease-out scrollbar-hide -translate-y-4 opacity-0" />
      </div>
    );
  }

  return (
    <div className="absolute left-0 right-0 top-full z-[50] pt-4 px-3 mx-0 pb-[15px] max-w-[700px] mx-auto">
      <div
        className={`mx-auto max-w-[1200px] max-h-[calc(100vh-116px)] rounded-[2.5rem] bg-neutral-900/50 backdrop-blur-lg text-white shadow-large overflow-y-auto transform transition-all duration-500 ease-out scrollbar-hide ${transitionClasses}`}
      >
        <NavDrawerCards category={category} onNavigate={onNavigate} />
      </div>
    </div>
  );
};
