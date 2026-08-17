import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Dev-only: the `app` process itself owns APP_PORT via src/platform/config/app-env.ts.
const appPort = process.env.APP_PORT ?? "4000";

export default defineConfig({
  root: __dirname,
  plugins: [react()],
  build: {
    outDir: path.join(__dirname, "dist"),
    emptyOutDir: true,
  },
  server: {
    proxy: {
      "/api": `http://127.0.0.1:${appPort}`,
    },
  },
});
