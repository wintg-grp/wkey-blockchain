import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Brand
        wintg: {
          50:  "#FFF1E8",
          100: "#FFDDC3",
          200: "#FFB988",
          300: "#FF954D",
          400: "#FF7E2D",
          500: "#FF6A1A",   // primary
          600: "#E25410",
          700: "#B33F08",
          800: "#7F2C04",
          900: "#4A1801",
        },
        // Surfaces (dark dApp aesthetic)
        ink: {
          950: "#06070D",
          900: "#0A0B12",
          850: "#0F1018",
          800: "#13141D",
          700: "#1A1C26",
          600: "#252734",
          500: "#34374A",
          400: "#4D5162",
          300: "#7C8095",
          200: "#B5B9CB",
          100: "#E4E6F0",
          50:  "#F4F5FA",
        },
      },
      fontFamily: {
        sans: ['"Inter"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
      boxShadow: {
        glow: "0 0 32px rgba(255,106,26,0.35)",
        "glow-lg": "0 0 64px rgba(255,106,26,0.4)",
      },
      backgroundImage: {
        "wintg-gradient": "linear-gradient(135deg,#FF6A1A 0%,#E25410 100%)",
        "ink-fade": "linear-gradient(180deg,rgba(10,11,18,0) 0%,rgba(10,11,18,1) 100%)",
      },
      keyframes: {
        "fade-in-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        pulse: {
          "0%, 100%": { opacity: "0.5" },
          "50%": { opacity: "1" },
        },
      },
      animation: {
        "fade-in-up": "fade-in-up 0.5s ease-out",
        pulse: "pulse 2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
