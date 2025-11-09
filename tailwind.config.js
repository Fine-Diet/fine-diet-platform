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
          primary: "#123456",
          secondary: "#654321",
        },
      },
      fontFamily: {
        sans: ["Eina03-Light", "Eina03-SemiBold", "sans-serif"],
      },
    },
  },
  plugins: [],
}
