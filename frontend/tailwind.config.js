/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#16171B",
        panel: "#1E2025",
        panel2: "#26282F",
        line: "#30323A",
        linestrong: "#454852",
        muted: "#A4A9B5",
        faint: "#858C9A",
        paper: "#E7E9EE",
        amber: "#D8B574",
        thread: "#E58C91",
        cyan: "#A5B4FC",
        moss: "#89B8A0",
      },
      fontFamily: {
        display: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        body: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["'IBM Plex Mono'", "ui-monospace", "monospace"],
        stamp: ["Inter", "ui-sans-serif", "sans-serif"],
      },
    },
  },
  plugins: [],
};
