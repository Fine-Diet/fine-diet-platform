'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import { HomeIcon, NotebookIcon, ProgramsIcon, PlansIcon, FoodIcon } from '@/components/icons';
import { useMealRhythmOverlay } from '@/components/plans/rhythm/MealRhythmOverlayProvider';
import { APP_ROUTES, LEGACY_JOURNAL_ROUTES } from '@/lib/routes/appRoutes';
import { cn } from '@/lib/utils';
import { SVGProps } from 'react';

/* ------------------------------------------------------------------ */
/*  Route map — single source of truth for footer tab navigation      */
/* ------------------------------------------------------------------ */

const ROUTE_MAP: Record<string, string> = {
  home: APP_ROUTES.home,
  programs: APP_ROUTES.programs,
  log: APP_ROUTES.log,
  plans: APP_ROUTES.plans,
  food: APP_ROUTES.food,
};

type NavItem = {
  id: string;
  label: string;
  icon: React.FC<SVGProps<SVGSVGElement>> | 'profile';
};

const navItems: NavItem[] = [
  { id: 'home', label: 'Home', icon: HomeIcon },
  { id: 'programs', label: 'Programs', icon: ProgramsIcon },
  { id: 'log', label: 'Log', icon: NotebookIcon },
  { id: 'plans', label: 'Plans', icon: PlansIcon },
  { id: 'food', label: 'Food', icon: FoodIcon },
];

// Fixed pill width for consistency
const PILL_WIDTH = 67;

/**
 * Derive the active tab id from the current Next.js pathname.
 * Matches the most specific route first (e.g. /journal/home before /journal).
 */
function deriveActiveTab(pathname: string): string | null {
  // Check specific sub-routes first (order matters — longest prefix first)
  if (pathname === APP_ROUTES.home || pathname.startsWith(LEGACY_JOURNAL_ROUTES.home)) return 'home';
  if (
    pathname.startsWith(APP_ROUTES.programs) ||
    pathname.startsWith(LEGACY_JOURNAL_ROUTES.programs) ||
    pathname.startsWith(LEGACY_JOURNAL_ROUTES.insights)
  ) {
    return 'programs';
  }
  if (pathname.startsWith(APP_ROUTES.plans) || pathname.startsWith(LEGACY_JOURNAL_ROUTES.plans)) return 'plans';
  // Food service: canonical routes plus the legacy flat pantry/meals paths,
  // which redirect into Food but should still highlight the Food tab while
  // the redirect resolves.
  if (
    pathname.startsWith(APP_ROUTES.food) ||
    pathname.startsWith(APP_ROUTES.pantry) ||
    pathname.startsWith(APP_ROUTES.meals)
  ) {
    return 'food';
  }
  if (pathname.startsWith(APP_ROUTES.profile) || pathname.startsWith(LEGACY_JOURNAL_ROUTES.profile)) return null;
  // Anything else under /app/log or /journal (including /journal/log, /journal/entry/…)
  // maps to the "log" tab
  return 'log';
}

export function JournalFooterNav() {
  const router = useRouter();
  const activeTab = deriveActiveTab(router.pathname);
  // Meal Rhythm overlay is z-[51] below topnav (z-[60]). Footer defaults to z-[70],
  // which would paint above the overlay — drop under the overlay while it is open.
  const { isOpen: mealRhythmOpen } = useMealRhythmOverlay();

  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [selectedPillLeft, setSelectedPillLeft] = useState(0);
  const [hoverPillLeft, setHoverPillLeft] = useState(0);
  const [hoverPillVisible, setHoverPillVisible] = useState(false);
  const [mounted, setMounted] = useState(false);

  const navRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<{ [key: string]: HTMLButtonElement | null }>({});

  // Calculate pill center position for a given target
  const getPillLeft = useCallback((targetId: string) => {
    const button = buttonRefs.current[targetId];
    const nav = navRef.current;

    if (button && nav) {
      const navRect = nav.getBoundingClientRect();
      const buttonRect = button.getBoundingClientRect();

      // Center the pill on the button
      const buttonCenter = buttonRect.left - navRect.left + buttonRect.width / 2;
      return buttonCenter - PILL_WIDTH / 2;
    }
    return 0;
  }, []);

  // Update selected pill position when active tab changes
  useEffect(() => {
    if (activeTab) {
      const left = getPillLeft(activeTab);
      setSelectedPillLeft(left);
    }
  }, [activeTab, getPillLeft]);

  // Update hover pill position
  useEffect(() => {
    if (hoveredId && hoveredId !== activeTab) {
      const left = getPillLeft(hoveredId);
      setHoverPillLeft(left);
      setHoverPillVisible(true);
    } else {
      setHoverPillVisible(false);
    }
  }, [hoveredId, activeTab, getPillLeft]);

  // Handle resize and initial mount
  useEffect(() => {
    const handleResize = () => {
      if (activeTab) {
        setSelectedPillLeft(getPillLeft(activeTab));
      }
      if (hoveredId && hoveredId !== activeTab) {
        setHoverPillLeft(getPillLeft(hoveredId));
      }
    };

    window.addEventListener('resize', handleResize);

    // Initial calculation
    requestAnimationFrame(() => {
      if (activeTab) {
        setSelectedPillLeft(getPillLeft(activeTab));
      }
      setMounted(true);
    });

    return () => window.removeEventListener('resize', handleResize);
  }, [activeTab, hoveredId, getPillLeft]);

  const handleSelect = (id: string) => {
    const route = ROUTE_MAP[id];
    if (route && route !== router.asPath.split('?')[0]) {
      router.push(route);
    }
  };

  return (
    <div
      className={cn(
        'fixed bottom-0 left-0 right-0 mx-auto my-2 max-w-[600px] px-2 lg:left-[250px]',
        mealRhythmOpen ? 'z-[40]' : 'z-[70]',
      )}
      aria-hidden={mealRhythmOpen || undefined}
    >
      <nav className="relative bg-black/20 backdrop-blur-md rounded-full">
        <div className="px-4 pb-safe">
        <div
          ref={navRef}
          className="relative flex items-center justify-around py-2"
        >
          {/* Hover pill (translucent) */}
          <div
            className="absolute rounded-full pointer-events-none"
            style={{
              left: hoverPillLeft,
              width: PILL_WIDTH,
              height: 40,
              top: '50%',
              transform: 'translateY(-50%)',
              opacity: hoverPillVisible ? 1 : 0,
              backgroundColor: 'rgba(243, 243, 234, 0.15)', // brand-50 with opacity
              transition: 'left 0.2s ease-out, opacity 0.15s ease-out',
            }}
          />

          {/* Selected pill (solid brand-50) */}
          <div
            className="absolute bg-brand-50 rounded-full pointer-events-none"
            style={{
              left: selectedPillLeft,
              width: PILL_WIDTH,
              height: 40,
              top: '50%',
              transform: 'translateY(-50%)',
              opacity: mounted && activeTab ? 1 : 0,
              transition: 'left 0.25s ease-out, opacity 0.15s ease-out',
            }}
          />

          {navItems.map((item) => {
            const isSelected = activeTab === item.id;
            const isHovered = hoveredId === item.id && !isSelected;
            const Icon = item.icon;

            // Colors: selected = black, hovered (not selected) = brand-50, default = brand-50
            const getColor = () => {
              if (isSelected) return '#000000';
              if (isHovered) return '#f3f3ea'; // brand-50
              return '#f3f3ea'; // brand-50
            };

            const color = getColor();

            return (
              <button
                key={item.id}
                ref={(el) => { buttonRefs.current[item.id] = el; }}
                onClick={() => handleSelect(item.id)}
                onMouseEnter={() => setHoveredId(item.id)}
                onMouseLeave={() => setHoveredId(null)}
                className="relative z-10 flex items-center justify-center p-3"
                aria-label={item.label}
                aria-current={isSelected ? 'page' : undefined}
              >
                {/* Icon */}
                {Icon === 'profile' ? (
                  <div
                    className="w-6 h-6 rounded-full border-2"
                    style={{
                      borderColor: color,
                      backgroundColor: isSelected ? 'rgba(0,0,0,0.1)' : 'transparent',
                      transition: 'border-color 0.2s, background-color 0.2s',
                    }}
                  />
                ) : (
                  <Icon
                    className="w-6 h-6"
                    style={{
                      color: color,
                      transition: 'color 0.2s',
                    }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>
      </nav>
    </div>
  );
}
