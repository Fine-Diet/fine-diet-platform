'use client';

import { sanitizeDisplayName } from '@/lib/food';

interface FoodItem {
  id: string;
  name: string;
}

interface MealSectionProps {
  title: string;
  actionLabel?: string;
  actionIcon?: 'plus' | 'edit' | 'arrow';
  foodItems?: FoodItem[];
  isTranslucent?: boolean;
  onRemoveItem?: (itemId: string) => void;
  onClick?: () => void;
}

export function MealSection({
  title,
  actionLabel,
  actionIcon = 'plus',
  foodItems = [],
  isTranslucent = false,
  onRemoveItem,
  onClick,
}: MealSectionProps) {
  const getActionIcon = () => {
    switch (actionIcon) {
      case 'edit':
        return (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        );
      case 'arrow':
        return (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        );
      default:
        return (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        );
    }
  };

  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.();
        }
      }}
      className={`w-full rounded-xl p-7 text-left transition-all cursor-pointer ${
        isTranslucent
          ? 'backdrop-blur-sm border border-white/10'
          : 'backdrop-blur-sm border border-white/5'
      }`}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-white font-regular text-2xl mb-1">{title}</h3>
        <div className="flex items-center gap-2 text-white/80">
          {actionLabel && <span className="text-sm">{actionLabel}</span>}
          {getActionIcon()}
        </div>
      </div>

      {/* Food Items */}
      {foodItems.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {foodItems.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/20 text-white text-sm"
            >
              <span>{sanitizeDisplayName(item.name)}</span>
              <button
                type="button"
                className="text-white/60 hover:text-white transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveItem?.(item.id);
                }}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
