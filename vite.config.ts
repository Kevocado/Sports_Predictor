import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({ plugins: [react(), tailwindcss()], server: { port: 5174, host: true }, test: { environment: "jsdom", globals: true, setupFiles: "./src/test-setup.ts" } });
