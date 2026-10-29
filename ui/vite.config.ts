import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const target = "http://localhost:8787";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: { outDir: "dist" },
  server: {
    proxy: {
      "/scout": target,
      "/health": target,
      "/agents": { target, ws: true },
    },
  },
  test: {
    environment: "jsdom",
    include: ["test/**/*.test.{ts,tsx}"],
    globals: false,
  },
});
