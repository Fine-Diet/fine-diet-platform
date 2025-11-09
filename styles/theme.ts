// ============================================================================
// Fine Diet Design Tokens
// ----------------------------------------------------------------------------
// Centralized design system for colors, typography, spacing, shadows, and radii
// Used across web and future mobile applications for brand consistency
// ============================================================================

export const theme = {
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
    overlay: {
      light: "rgba(255, 255, 255, 0.75)",
      medium: "rgba(0, 0, 0, 0.25)",
      dark: "rgba(0, 0, 0, 0.6)",
    },
  },

  typography: {
    fonts: {
      sans: ["Eina03", "sans-serif"],
      serif: ["Playfair Display", "serif"],
      mono: ["Menlo", "monospace"],
    },
    sizes: {
      xs: "0.75rem",
      sm: "0.875rem",
      base: "1rem",
      lg: "1.125rem",
      xl: "1.25rem",
      "2xl": "1.5rem",
      "3xl": "1.875rem",
      "4xl": "2.25rem",
      "5xl": "3rem",
      "6xl": "3.75rem",
    },
    weights: {
      light: 300,
      regular: 400,
      semibold: 600,
      bold: 700,
    },
    lineHeights: {
      tight: 1.1,
      snug: 1.3,
      normal: 1.5,
      relaxed: 1.7,
      loose: 1.9,
    },
    letterSpacing: {
      tight: "-0.02em",
      normal: "0em",
      wide: "0.02em",
    },
  },

  spacing: {
    px: "1px",
    0: "0",
    1: "0.25rem",
    2: "0.5rem",
    3: "0.75rem",
    4: "1rem",
    5: "1.25rem",
    6: "1.5rem",
    8: "2rem",
    10: "2.5rem",
    12: "3rem",
    16: "4rem",
    20: "5rem",
    24: "6rem",
  },

  shadows: {
    none: "none",
    soft: "0 2px 10px rgba(0, 0, 0, 0.04)",
    medium: "0 4px 16px rgba(0, 0, 0, 0.08)",
    large: "0 8px 24px rgba(0, 0, 0, 0.12)",
  },

  radii: {
    none: "0",
    sm: "0.25rem",
    md: "0.5rem",
    lg: "0.75rem",
    xl: "1rem",
    "2xl": "1.5rem",
    full: "9999px",
  },
};
