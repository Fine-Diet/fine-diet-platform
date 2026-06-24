import React from 'react';
import { cn } from '@/lib/utils';

export interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'tertiary' | 'quaternary' | 'quinary';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  type?: 'button' | 'submit' | 'reset';
}

const variantStyles = {
  primary: 'bg-gradient-to-bl from-denim-500 to-denim-900 opacity-100 hover:opacity-90 text-neutral-900',
  secondary: 'bg-transparent border border-brand-900 hover:bg-neutral-200 text-brand-900',
  tertiary: 'backdrop-blur-xs bg-transparent border border-white text-white hover:bg-white/10',
  quaternary: 'bg-white hover:bg-brand-50 text-neutral-900',
  quinary: 'bg-brand-900 hover:bg-brand-700 text-white',
} as const;

const sizeStyles = {
  sm: 'px-5 py-1 text-base',
  md: 'px-5 py-2 text-base',
  lg: 'px-5 py-3 text-base',
} as const;

const baseStyles =
  'antialiased font-sans font-semibold rounded-full transition-all duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 inline-flex items-center justify-center text-center overflow-hidden';

export function buttonClassNames({
  variant = 'primary',
  size = 'md',
  disabled = false,
  className = '',
}: Pick<ButtonProps, 'variant' | 'size' | 'disabled' | 'className'>): string {
  const disabledStyles = disabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : '';

  return cn(
    baseStyles,
    variantStyles[variant],
    sizeStyles[size],
    disabledStyles,
    className,
  );
}

export const Button = ({
  variant = 'primary',
  size = 'md',
  disabled = false,
  children,
  onClick,
  className = '',
  type = 'button',
}: ButtonProps) => {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      aria-disabled={disabled}
      className={buttonClassNames({ variant, size, disabled, className })}
    >
      <span className="relative top-[1px] inline-flex items-center gap-1 whitespace-nowrap overflow-hidden text-ellipsis">
        {children}
      </span>
    </button>
  );
};
