/** @type {import('tailwindcss').Config} */
const { theme } = require("./styles/theme");

module.exports = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        brand: theme.colors.brand,
        accent: theme.colors.accent,
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
