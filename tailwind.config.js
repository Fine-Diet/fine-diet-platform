/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#F4F7F2",
          100: "#E8F3E3",
          200: "#CDE2B9",
          300: "#A8C686",
          400: "#84AD5E",
          500: "#6FA44A",
          600: "#528036",
          700: "#2F6121",
          800: "#1C3E11",
          900: "#0C2305",
        },
        accent: {
          100: "#FFF4E5",
          300: "#FFD28C",
          500: "#FFB347",
          700: "#E88C1B",
          900: "#B36100",
        },
        neutral: {
          0: "#FFFFFF",
          50: "#FAFAFA",
          100: "#F4F4F4",
          200: "#EAE9E4",
          300: "#DAD8D2",
          400: "#BEBEBE",
          500: "#8C8C8C",
          600: "#6B6B6B",
          700: "#404040",
          800: "#20201E",
          900: "#111111",
        },
        semantic: {
          success: "#6FA44A",
          warning: "#FFB347",
          error: "#E04E39",
          info: "#4E8BE0",
        },
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
