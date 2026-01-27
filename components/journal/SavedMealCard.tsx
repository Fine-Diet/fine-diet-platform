'use client';

interface SavedMealCardProps {
  id: string;
  name: string;
  nutritionDensity?: number;
  onClick?: () => void;
}

/**
 * Card for a saved meal in the horizontal carousel.
 */
export function SavedMealCard({
  id,
  name,
  nutritionDensity,
  onClick,
}: SavedMealCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-shrink-0 w-[140px] rounded-xl bg-white/5 border border-white/10 p-4 text-left hover:bg-white/10 transition-colors"
    >
      <h4 className="text-white font-medium text-sm leading-tight mb-1 line-clamp-2">
        {name}
      </h4>
      {nutritionDensity !== undefined && (
        <p className="text-white/50 text-xs">
          Nutrition Density {nutritionDensity}
        </p>
      )}
    </button>
  );
}
