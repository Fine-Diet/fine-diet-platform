/**
 * Option Button Component
 * Displays a selectable option for a question
 */

import React from 'react';

interface OptionButtonProps {
  optionId: string;
  label: string;
  isSelected: boolean;
  onClick: () => void;
}

export function OptionButton({ optionId, label, isSelected, onClick }: OptionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`
        w-full text-left px-6 py-4 rounded-lg border-2 transition-all duration-200
        ${
          isSelected
            ? 'border-dark_accent-500 bg-dark_accent-500/10 text-white'
            : 'border-neutral-300 bg-transparent text-neutral-300 hover:border-dark_accent-300 hover:bg-dark_accent-300/5'
        }
      `}
      aria-pressed={isSelected}
    >
      <span className="text-base font-medium antialiased">{label}</span>
    </button>
  );
}

