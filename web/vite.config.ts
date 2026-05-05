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
      "/api": {
        target: "http://127.0.0.1:3781",
        changeOrigin: true,
        /** Gửi nhiều mail + delay giữa mỗi mail có thể > 2 phút — tránh proxy Vite cắt sớm */
        timeout: 900_000,
        proxyTimeout: 900_000,
      },
    },
  },
});
