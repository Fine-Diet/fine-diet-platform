// ============================================================================
// Fine Diet Design Tokens
// ----------------------------------------------------------------------------
// Centralized design system for colors, typography, spacing, shadows, and radii
// Used across web and future mobile applications for brand consistency
// ============================================================================

/**
 * Canonical web type scale: [fontSize, { lineHeight }].
 *
 * This object is the single source of truth for Tailwind `theme.fontSize`
 * (`tailwind.config.js`) and for `theme.typography.sizes` (rem-only map below).
 * Values are intentionally ~85% of common Tailwind defaults for Fine Diet’s
 * dense UI — do not duplicate this matrix elsewhere.
 */
export const typographyFontSize = {
  xs: ['0.65rem', { lineHeight: '0.85rem' }],
  sm: ['0.8rem', { lineHeight: '1.0625rem' }],
  base: ['0.9rem', { lineHeight: '1.275rem' }],
  lg: ['0.95625rem', { lineHeight: '1.4875rem' }],
  xl: ['1.0625rem', { lineHeight: '1.4875rem' }],
  '2xl': ['1.275rem', { lineHeight: '1.7rem' }],
  '3xl': ['1.8rem', { lineHeight: '1.9125rem' }],
  '4xl': ['1.9125rem', { lineHeight: '2.125rem' }],
  '5xl': ['2.55rem', { lineHeight: '1' }],
  '6xl': ['3.25rem', { lineHeight: '1' }],
  '7xl': ['3.825rem', { lineHeight: '1' }],
  '8xl': ['5.1rem', { lineHeight: '1' }],
  '9xl': ['6.8rem', { lineHeight: '1' }],
  'hero-mobile': ['2.3375rem', { lineHeight: '1' }],
} as const;

/** Rem-only map for inline styles, D3, and the typography style guide. */
export const typographySizeRem: Record<keyof typeof typographyFontSize, string> = {
  xs: typographyFontSize.xs[0],
  sm: typographyFontSize.sm[0],
  base: typographyFontSize.base[0],
  lg: typographyFontSize.lg[0],
  xl: typographyFontSize.xl[0],
  '2xl': typographyFontSize['2xl'][0],
  '3xl': typographyFontSize['3xl'][0],
  '4xl': typographyFontSize['4xl'][0],
  '5xl': typographyFontSize['5xl'][0],
  '6xl': typographyFontSize['6xl'][0],
  '7xl': typographyFontSize['7xl'][0],
  '8xl': typographyFontSize['8xl'][0],
  '9xl': typographyFontSize['9xl'][0],
  'hero-mobile': typographyFontSize['hero-mobile'][0],
};

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
    denim: {
      100: "#A7BDCA",
      300: "#B4C7D4",
      500: "#C0D0DC",
      700: "#CDDAE5",
      900: "#DAE4EE",
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
    sizes: typographySizeRem,
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
