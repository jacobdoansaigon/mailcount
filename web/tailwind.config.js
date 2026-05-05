import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    path.join(DIR, "index.html"),
    path.join(DIR, "src", "**", "*.{js,ts,tsx}"),
  ],
  theme: {
    extend: {
      colors: {
        ink: { 900: "#e8edf4", 950: "#0f1319" },
        panel: "#161c26",
        stroke: "#273142",
        muted: "#93a4bc",
        accent: "#46d4c1",
        accent2: "#7c9dff",
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "sans-serif",
        ],
      },
      boxShadow: {
        soft: "0 22px 56px rgba(0,0,0,.42)",
      },
    },
  },
  plugins: [],
};
