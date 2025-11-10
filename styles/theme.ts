// ============================================================================
// Fine Diet Design Tokens
// ----------------------------------------------------------------------------
// Centralized design system for colors, typography, spacing, shadows, and radii
// Used across web and future mobile applications for brand consistency
// ============================================================================

export const theme = {
  colors: {
    brand: {
      50: "#f3f3ea",
      100: "#b1aca3",
      200: "#7d766c",
      300: "#534c43",
      400: "#302a21",
      500: "#4f4234",
      600: "#473c30",
      700: "#3f362b",
      800: "#383026",
      900: "#302a21",
    },
    accent: {
      100: "#cecab9",
      300: "#b0aa92",
      500: "#948e70",
      700: "#7c7654",
      900: "#66613a",
    },
    dark_accent: {
      100: "#d7e3dc",
      300: "#bdd5d0",
      500: "#a2c8c4",
      700: "#87bcb8",
      900: "#6ab1ae",
    },
    neutral: {
      0: "#f3f3ea",
      50: "#d2cfc6",
      100: "#b7b3a9",
      200: "#9f998f",
      300: "#888177",
      400: "#736c62",
      500: "#60594f",
      600: "#4f483f",
      700: "#3f3930",
      800: "#302a21",
      900: "#252018"
    },
    semantic: {
      success: "#6FA44A",
      warning: "#FFB347",
      error: "#E04E39",
      info: "#4E8BE0",
    },
    core_data: {
      metabolic_rhythm: "#daa547",
      emotional_regulation: "#6ab1ae",
      physiological_feedback: "#bd7985",
      nutrient_density: "#899f60",
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
