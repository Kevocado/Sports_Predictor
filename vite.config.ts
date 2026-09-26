import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Dev/preview stand-in for the production Caddyfile: same paths, local ports.
const apiProxy = {
  "/api/nfl": { target: "http://localhost:8001", changeOrigin: true, rewrite: (p: string) => p.replace(/^\/api\/nfl/, "/api") },
  "/api/cfb": { target: "http://localhost:8003", changeOrigin: true, rewrite: (p: string) => p.replace(/^\/api\/cfb/, "/api") },
};

export default defineConfig({
  plugins: [
    react(),
    tailwindcss() as any, // Cast to 'any' to resolve Vitest plugin type mismatch
  ],
  server: {
    port: 5174,
    host: true,
    proxy: apiProxy,
  },
  preview: {
    proxy: apiProxy,
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test-setup.ts",
    // Outside UTC, so a timestamp read in the wrong zone fails a test.
    env: { TZ: "America/Chicago" },
  },
});