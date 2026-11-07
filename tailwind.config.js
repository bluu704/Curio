/** @type {import('tailwindcss').Config} */
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: ["class"],
  // status colors are chosen by the user at runtime (`tone-${color}`), so keep every tone class
  safelist: ["slate", "blue", "green", "amber", "red", "violet", "pink", "teal"].map((t) => `tone-${t}`).concat(["tone-bg", "tone-text"]),
  theme: {
    extend: {
      colors: {
        bg: v("bg"),
        surface: v("surface"),
        elevated: v("elevated"),
        line: v("line"),
        fg: v("fg"),
        muted: v("muted"),
        subtle: v("subtle"),
        accent: v("accent"),
        "accent-fg": v("accent-fg"),
        danger: v("danger"),
      },
      fontFamily: {
        // --font is set from Settings → 글자 (see store/theme.ts)
        sans: ["var(--font)"],
      },
      borderRadius: { xl: "0.875rem" },
      boxShadow: {
        card: "0 1px 2px rgb(0 0 0 / 0.06), 0 1px 1px rgb(0 0 0 / 0.04)",
        pop: "0 12px 32px -8px rgb(0 0 0 / 0.25)",
      },
    },
  },
  plugins: [],
};
