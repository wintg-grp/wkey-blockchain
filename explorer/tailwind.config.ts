import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        // Semantic tokens — driven by CSS variables in globals.css
        bg:           "rgb(var(--color-bg) / <alpha-value>)",
        surface:      "rgb(var(--color-surface) / <alpha-value>)",
        "surface-2":  "rgb(var(--color-surface-2) / <alpha-value>)",
        "surface-3":  "rgb(var(--color-surface-3) / <alpha-value>)",
        text:         "rgb(var(--color-text) / <alpha-value>)",
        "text-muted": "rgb(var(--color-text-muted) / <alpha-value>)",
        "text-faint": "rgb(var(--color-text-faint) / <alpha-value>)",
        border:       "rgb(var(--color-border) / <alpha-value>)",
        accent:       "rgb(var(--color-accent) / <alpha-value>)",
        "accent-fg":  "rgb(var(--color-accent-fg) / <alpha-value>)",
        inverse:      "rgb(var(--color-inverse) / <alpha-value>)",
        "inverse-fg": "rgb(var(--color-inverse-fg) / <alpha-value>)",

        // Brand palette (always usable)
        wintg: {
          50:  "#FFF1E8",
          100: "#FFDDC3",
          200: "#FFB988",
          300: "#FF954D",
          400: "#FF7E2D",
          500: "#FF6A1A",
          600: "#E25410",
          700: "#B33F08",
          800: "#7F2C04",
          900: "#4A1801",
        },
        cream: {
          50:  "#FFF8F1",
          100: "#FFF1E8",
          200: "#FFE5D0",
          300: "#FFD4AE",
          400: "#FFC089",
          500: "#FFA862",
        },
        ink: {
          50:  "#F4F5FA",
          100: "#E4E6F0",
          200: "#B5B9CB",
          300: "#7C8095",
          400: "#4D5162",
          500: "#34374A",
          600: "#252734",
          700: "#1A1C26",
          800: "#13141D",
          900: "#0A0B12",
          950: "#06070D",
        },
      },
      fontFamily: {
        sans:    ['"Inter"', "system-ui", "sans-serif"],
        display: ['"Anton"', '"Inter"', "system-ui", "sans-serif"],
        mono:    ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
      letterSpacing: {
        "tight-display": "-0.02em",
      },
      boxShadow: {
        glow: "0 0 32px rgba(255,106,26,0.32)",
        "glow-lg": "0 0 64px rgba(255,106,26,0.4)",
        flat: "0 8px 24px rgba(0,0,0,0.06)",
      },
      backgroundImage: {
        "wintg-gradient": "linear-gradient(135deg,#FF6A1A 0%,#E25410 100%)",
      },
      keyframes: {
        "fade-in-up": {
          "0%":   { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "soft-pulse": {
          "0%, 100%": { opacity: "0.5" },
          "50%":      { opacity: "1" },
        },
        "marquee": {
          "0%":   { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
      },
      animation: {
        "fade-in-up": "fade-in-up 0.5s ease-out",
        "soft-pulse": "soft-pulse 2s ease-in-out infinite",
        "marquee":    "marquee 40s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
