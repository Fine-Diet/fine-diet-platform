/** @type {import('tailwindcss').Config} */
const { theme } = require("./styles/theme");

module.exports = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    fontSize: {
      'xs': ['0.65rem', { lineHeight: '0.85rem' }],        // 85% of 12px = 10.2px
      'sm': ['0.8rem', { lineHeight: '1.0625rem' }],     // 85% of 14px = 11.9px
      'base': ['.9rem', { lineHeight: '1.275rem' }],       // 85% of 16px = 13.6px
      'lg': ['0.95625rem', { lineHeight: '1.4875rem' }],     // 85% of 18px = 15.3px
      'xl': ['1.0625rem', { lineHeight: '1.4875rem' }],      // 85% of 20px = 17px
      '2xl': ['1.275rem', { lineHeight: '1.7rem' }],         // 85% of 24px = 20.4px
      '3xl': ['1.8rem', { lineHeight: '1.9125rem' }],    // 85% of 30px = 25.5px
      '4xl': ['1.9125rem', { lineHeight: '2.125rem' }],      // 85% of 36px = 30.6px
      '5xl': ['2.55rem', { lineHeight: '1' }],               // 85% of 48px = 40.8px
      '6xl': ['3.25rem', { lineHeight: '1' }],             // 85% of 60px = 51px
      '7xl': ['3.825rem', { lineHeight: '1' }],              // 85% of 72px = 61.2px
      '8xl': ['5.1rem', { lineHeight: '1' }],                // 85% of 96px = 81.6px
      '9xl': ['6.8rem', { lineHeight: '1' }],                // 85% of 128px = 108.8px
      'hero-mobile': ['2.3375rem', { lineHeight: '1' }],     // 85% of 44px = 37.4px
    },
    extend: {
      colors: {
        brand: theme.colors.brand,
        accent: theme.colors.accent,
        dark_accent: theme.colors.dark_accent,
        neutral: theme.colors.neutral,
        core_data: theme.colors.core_data,
        semantic: theme.colors.semantic,
        overlay: theme.colors.overlay,
      },
      fontFamily: {
        sans: ["Eina03", "sans-serif"],
        serif: ["Playfair Display", "serif"],
        mono: ["Menlo", "monospace"],
      },
      borderRadius: {
        'lg': '0.75rem',
        'xl': '1rem',
        '2xl': '1.5rem',
      },
      boxShadow: {
        'soft': '0 2px 10px rgba(0, 0, 0, 0.04)',
        'medium': '0 4px 16px rgba(0, 0, 0, 0.08)',
        'large': '0 8px 24px rgba(0, 0, 0, 0.12)',
      },
    },
  },
  plugins: [],
}
