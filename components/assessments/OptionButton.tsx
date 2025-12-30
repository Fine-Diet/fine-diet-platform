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
        w-full rounded-full px-6 py-4 text-base
        flex items-center justify-between gap-4
        transition-colors duration-200
        ${
          isSelected
            ? 'bg-[#6AB1AE] text-white font-semibold'
            : 'bg-[#fffff6] text-[#4F4234] hover:bg-white font-normal'
        }
      `}
      aria-pressed={isSelected}
    >
      <span className="flex-1 text-left">{label}</span>
      <div
        className={`
          w-5 h-5 rounded-full border-[1.5px] flex items-center justify-center flex-shrink-0
          ${
            isSelected
              ? 'bg-white border-white'
              : 'bg-transparent border-[#4F4234]'
          }
        `}
      >
        {isSelected && (
          <svg
            className="w-3 h-3"
            fill="none"
            viewBox="0 0 24 24"
            stroke="#4F4234"
            strokeWidth={3}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M5 13l4 4L19 7"
            />
          </svg>
        )}
      </div>
    </button>
  );
}

