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
    primary: 'bg-brand-500 hover:bg-brand-600 text-white',
    secondary: 'bg-neutral-100 hover:bg-neutral-200 text-brand-700',
    tertiary: 'bg-transparent border border-brand-500 text-brand-500 hover:bg-brand-50',
  };

  // Size styles mapping
  const sizeStyles = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg',
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

