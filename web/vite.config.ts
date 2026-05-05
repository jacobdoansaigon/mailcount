import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const DIR = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: DIR,
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:3781",
    },
  },
});
