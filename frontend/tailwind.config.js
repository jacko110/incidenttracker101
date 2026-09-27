/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#15171B",
        panel: "#1C1E23",
        panel2: "#22242B",
        line: "#2C2E36",
        linestrong: "#383B45",
        muted: "#8B8981",
        faint: "#5C5A54",
        paper: "#EAE6DE",
        amber: "#D9A244",
        thread: "#C1443A",
        cyan: "#4A93A8",
        moss: "#5C9068",
      },
      fontFamily: {
        display: ["'Barlow Semi Condensed'", "sans-serif"],
        body: ["'Source Sans 3'", "sans-serif"],
        mono: ["'IBM Plex Mono'", "ui-monospace", "monospace"],
        stamp: ["'Special Elite'", "monospace"],
      },
    },
  },
  plugins: [],
};
