'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { HomeIcon, InsightsIcon, NotebookIcon, SaveIcon } from '@/components/icons';
import { SVGProps } from 'react';

type NavItem = {
  id: string;
  label: string;
  icon: React.FC<SVGProps<SVGSVGElement>> | 'profile';
};

const navItems: NavItem[] = [
  { id: 'home', label: 'Home', icon: HomeIcon },
  { id: 'insights', label: 'Insights', icon: InsightsIcon },
  { id: 'journal', label: 'Journal', icon: NotebookIcon },
  { id: 'programs', label: 'Programs', icon: SaveIcon },
  { id: 'profile', label: 'Profile', icon: 'profile' },
];

// Fixed pill width for consistency
const PILL_WIDTH = 67;

interface JournalFooterNavProps {
  activeTab?: string;
  onTabChange?: (tabId: string) => void;
}

export function JournalFooterNav({ 
  activeTab = 'journal', 
  onTabChange 
}: JournalFooterNavProps) {
  const [selected, setSelected] = useState(activeTab);
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

  // Update selected pill position
  useEffect(() => {
    const left = getPillLeft(selected);
    setSelectedPillLeft(left);
  }, [selected, getPillLeft]);

  // Update hover pill position
  useEffect(() => {
    if (hoveredId && hoveredId !== selected) {
      const left = getPillLeft(hoveredId);
      setHoverPillLeft(left);
      setHoverPillVisible(true);
    } else {
      setHoverPillVisible(false);
    }
  }, [hoveredId, selected, getPillLeft]);

  // Handle resize and initial mount
  useEffect(() => {
    const handleResize = () => {
      setSelectedPillLeft(getPillLeft(selected));
      if (hoveredId && hoveredId !== selected) {
        setHoverPillLeft(getPillLeft(hoveredId));
      }
    };
    
    window.addEventListener('resize', handleResize);
    
    // Initial calculation
    requestAnimationFrame(() => {
      setSelectedPillLeft(getPillLeft(selected));
      setMounted(true);
    });

    return () => window.removeEventListener('resize', handleResize);
  }, [selected, hoveredId, getPillLeft]);

  const handleSelect = (id: string) => {
    setSelected(id);
    onTabChange?.(id);
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 bg-black/50 backdrop-blur-md rounded-full my-2 mx-2 max-w-[650px] mx-auto">
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
              opacity: mounted ? 1 : 0,
              transition: 'left 0.25s ease-out, opacity 0.15s ease-out',
            }}
          />

          {navItems.map((item) => {
            const isSelected = selected === item.id;
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
  );
}
