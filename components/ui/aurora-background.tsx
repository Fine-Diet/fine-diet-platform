'use client';
import { cn } from '@/lib/utils';
import React, { ReactNode } from 'react';
import { theme } from '@/styles/theme';

interface AuroraBackgroundProps extends React.HTMLProps<HTMLDivElement> {
  children: ReactNode;
  showRadialGradient?: boolean;
  variant?: 'light' | 'dark';
}

export const AuroraBackground = ({
  className,
  children,
  showRadialGradient = true,
  variant = 'dark',
  ...props
}: AuroraBackgroundProps) => {
  const isDark = variant === 'dark';
  
  // Fine Diet brand colors for aurora effect
  // Using denim palette (teal/cyan) for the main aurora
  // Mixing in accent colors for additional depth and contrast
  const auroraColors = {
    light: {
      // For light backgrounds, use darker teal shades for visibility
      primary: theme.colors.denim[900],   // #6ab1ae - darkest teal
      secondary: theme.colors.denim[700], // #87bcb8 - darker teal
      tertiary: theme.colors.denim[500],  // #a2c8c4 - medium teal
      quaternary: theme.colors.accent[500],     // #948e70 - accent beige for contrast
      accent: theme.colors.denim[300],    // #bdd5d0 - light teal
    },
    dark: {
      // For dark backgrounds, use lighter teal shades for brightness
      primary: theme.colors.denim[100],   // #d7e3dc - lightest teal
      secondary: theme.colors.denim[300], // #bdd5d0 - light teal
      tertiary: theme.colors.denim[500], // #a2c8c4 - medium teal
      quaternary: theme.colors.denim[700], // #87bcb8 - darker teal
      accent: theme.colors.denim[900],    // #6ab1ae - darkest teal
    },
  };

  const colors = auroraColors[isDark ? 'dark' : 'light'];

  return (
    <div
      className={cn(
        'relative flex min-h-screen flex-col items-center justify-center overflow-hidden',
        isDark 
          ? 'bg-brand-900 text-neutral-0' 
          : 'bg-neutral-0 text-neutral-900',
        className,
      )}
      {...props}
    >
      <div
        className="absolute inset-0 overflow-hidden"
        style={
          {
            '--aurora': `repeating-linear-gradient(100deg,${colors.primary} 10%,${colors.secondary} 15%,${colors.tertiary} 20%,${colors.quaternary} 25%,${colors.accent} 30%)`,
            '--dark-gradient': `repeating-linear-gradient(100deg,${theme.colors.brand[900]} 0%,${theme.colors.brand[900]} 7%,transparent 10%,transparent 12%,${theme.colors.brand[900]} 16%)`,
            '--light-gradient': `repeating-linear-gradient(100deg,${theme.colors.neutral[0]} 0%,${theme.colors.neutral[0]} 7%,transparent 10%,transparent 12%,${theme.colors.neutral[0]} 16%)`,
            '--primary': colors.primary,
            '--secondary': colors.secondary,
            '--tertiary': colors.tertiary,
            '--quaternary': colors.quaternary,
            '--accent': colors.accent,
            '--black': theme.colors.brand[900],
            '--white': theme.colors.neutral[0],
            '--transparent': 'transparent',
          } as React.CSSProperties
        }
      >
        <div
          className={cn(
            `after:animate-aurora pointer-events-none absolute -inset-[10px] opacity-70 blur-[10px] filter will-change-transform`,
            isDark
              ? '[background-image:var(--dark-gradient),var(--aurora)] [background-size:300%,200%] [background-position:50%_50%,50%_50%] after:absolute after:inset-0 after:[background-image:var(--dark-gradient),var(--aurora)] after:[background-size:200%,100%] after:[background-attachment:fixed] after:mix-blend-difference after:content-[""]'
              : '[background-image:var(--light-gradient),var(--aurora)] [background-size:300%,200%] [background-position:50%_50%,50%_50%] invert after:absolute after:inset-0 after:[background-image:var(--light-gradient),var(--aurora)] after:[background-size:200%,100%] after:[background-attachment:fixed] after:mix-blend-difference after:content-[""]',
            showRadialGradient &&
              `[mask-image:radial-gradient(ellipse_at_100%_0%,black_10%,var(--transparent)_70%)]`,
          )}
        ></div>
      </div>
      {children}
    </div>
  );
};
