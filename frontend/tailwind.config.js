/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "rgb(var(--ink) / <alpha-value>)",
        panel: "rgb(var(--panel) / <alpha-value>)",
        panel2: "rgb(var(--panel2) / <alpha-value>)",
        line: "rgb(var(--line) / <alpha-value>)",
        linestrong: "rgb(var(--linestrong) / <alpha-value>)",
        muted: "rgb(var(--muted) / <alpha-value>)",
        faint: "rgb(var(--faint) / <alpha-value>)",
        paper: "rgb(var(--paper) / <alpha-value>)",
        amber: "rgb(var(--amber) / <alpha-value>)",
        thread: "rgb(var(--thread) / <alpha-value>)",
        cyan: "rgb(var(--cyan) / <alpha-value>)",
        moss: "rgb(var(--moss) / <alpha-value>)",
        onaccent: "rgb(var(--onaccent) / <alpha-value>)",
      },
      fontFamily: {
        display: ["Manrope", "ui-sans-serif", "system-ui", "sans-serif"],
        body: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["'IBM Plex Mono'", "ui-monospace", "monospace"],
        stamp: ["Inter", "ui-sans-serif", "sans-serif"],
      },
    },
  },
  plugins: [],
};
