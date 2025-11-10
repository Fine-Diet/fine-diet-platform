import React from 'react';
import { theme } from '@/styles/theme';

export interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'tertiary';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
}

export const Button = ({
  variant = 'primary',
  size = 'md',
  disabled = false,
  children,
  onClick,
}: ButtonProps) => {
  // Variant styles mapping
  const variantStyles = {
    primary: 'bg-core_data-emotional_regulation hover:bg-dark_accent-700 text-neutral-900',
    secondary: 'bg-transparent border border-brand-900 hover:bg-neutral-200 text-brand-900',
    tertiary: 'bg-transparent border border-white text-white hover:bg-white/10',
  };

  // Size styles mapping
  const sizeStyles = {
    sm: 'px-3 py-1.5 text-base',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-base',
  };

  // Disabled styles
  const disabledStyles = disabled
    ? 'opacity-50 cursor-not-allowed pointer-events-none'
    : '';

  // Base styles using theme tokens
  const baseStyles = `
    font-sans font-semibold rounded-full
    transition-all duration-200 ease-in-out
    focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2
    inline-flex items-center justify-center
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
      `.trim().replace(/\s+/g, ' ')}
    >
      {children}
    </button>
  );
};

