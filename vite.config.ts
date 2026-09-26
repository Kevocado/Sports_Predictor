import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Dev/preview stand-in for the production Caddyfile: same paths, local ports.
// The explainer rewrite mirrors the Caddyfile exactly -- strip /api/explain,
// put back the service's own /explain -- so a path that works in dev works in
// production. EXPLAINER_TARGET overrides the port for a local service.
const explainerTarget = process.env.EXPLAINER_TARGET ?? "http://localhost:8090";

const apiProxy = {
  "/api/nfl": { target: "http://localhost:8001", changeOrigin: true, rewrite: (p: string) => p.replace(/^\/api\/nfl/, "/api") },
  "/api/cfb": { target: "http://localhost:8003", changeOrigin: true, rewrite: (p: string) => p.replace(/^\/api\/cfb/, "/api") },
  "/api/explain": { target: explainerTarget, changeOrigin: true, rewrite: (p: string) => p.replace(/^\/api\/explain/, "/explain") },
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