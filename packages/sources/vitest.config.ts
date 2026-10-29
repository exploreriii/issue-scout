import { defineConfig } from "vitest/config";

export default defineConfig({
  // Resolve zod once from this package so core (a workspace source package)
  // and sources share one instance.
  resolve: { dedupe: ["zod"] },
  test: { include: ["test/**/*.test.ts"], environment: "node" },
});
