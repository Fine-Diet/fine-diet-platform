/** @type {import('tailwindcss').Config} */
const { theme, typographyFontSize } = require("./styles/theme");

module.exports = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./app/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    // Single source: styles/theme.ts → typographyFontSize
    fontSize: { ...typographyFontSize },
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
      keyframes: {
        /**
         * Background-position drift for `@/components/ui/aurora-background`
         * (repeating gradients + mix-blend). Not the same motion as journal radials.
         */
        auroraBackgroundShift: {
          '0%': { backgroundPosition: '50% 50%, 50% 50%' },
          '33%': { backgroundPosition: '0% 0%, 40% 40%' },
          '66%': { backgroundPosition: '100% 100%, 60% 60%' },
          '100%': { backgroundPosition: '50% 50%, 50% 50%' },
        },
        /**
         * Radial “brown earth” aurora layers for `@/components/journal/AuroraBackground`.
         */
        auroraJournalRadials: {
          '0%': { transform: 'translate(0, 0) scale(1)', opacity: '0.3' },
          '50%': { transform: 'translate(2%, -3%) scale(1.1)', opacity: '0.4' },
          '100%': { transform: 'translate(-2%, 3%) scale(0.9)', opacity: '0.25' },
        },
      },
      animation: {
        'aurora-shift': 'auroraBackgroundShift 20s linear infinite',
        'aurora-journal': 'auroraJournalRadials 20s ease-in-out infinite alternate',
        'aurora-journal-reverse':
          'auroraJournalRadials 25s ease-in-out infinite alternate-reverse',
      },
    },
  },
  plugins: [],
}
