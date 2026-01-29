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
      className="flex-shrink-0 w-[180px] h-[90px] rounded-xl bg-white/5 p-4 text-left hover:bg-white/10 transition-colors"
    >
      <h4 className="text-brand-50 font-semibold text-base mb-0 line-clamp-2">
        {name}
      </h4>
      {nutritionDensity !== undefined && (
        <p className="text-brand-50 font-light text-sm">
          Nutrition Density {nutritionDensity}
        </p>
      )}
    </button>
  );
}
