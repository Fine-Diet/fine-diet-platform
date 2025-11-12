import React from 'react';
import { theme } from '@/styles/theme';

export interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'tertiary';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}

export const Button = ({
  variant = 'primary',
  size = 'md',
  disabled = false,
  children,
  onClick,
  className = '',
}: ButtonProps) => {
  // Variant styles mapping
  const variantStyles = {
    primary: 'bg-core_data-emotional_regulation hover:bg-dark_accent-700 text-neutral-900',
    secondary: 'bg-transparent border border-brand-900 hover:bg-neutral-200 text-brand-900 ',
    tertiary: 'backdrop-blur-sm bg-transparent border border-white text-white hover:bg-white/10',
  };

  // Size styles mapping (10px added to left/right padding)
  const sizeStyles = {
    sm: 'px-10 py-1 text-base',
    md: 'px-10 py-2 text-base',
    lg: 'px-9 py-3 text-base',
  };

  // Disabled styles
  const disabledStyles = disabled
    ? 'opacity-50 cursor-not-allowed pointer-events-none'
    : '';

  // Base styles using theme tokens
  const baseStyles = `
    antialiased font-sans font-semibold rounded-full
    transition-all duration-200 ease-in-out
    focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2
    inline-flex items-center justify-center text-center
  `;

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-disabled={disabled}
      className={`
        ${baseStyles}
        ${variantStyles[variant]}
        ${sizeStyles[size]}
        ${disabledStyles}
        ${className}
      `.trim().replace(/\s+/g, ' ')}
    >
      <span className="relative top-[1px]">
        {children}
      </span>
    </button>
  );
};

