import { defineConfig } from "vitest/config";

export default defineConfig({
  root: "web",
  build: {
    outDir: "../build/web",
    emptyOutDir: true,
    target: "es2022",
  },
  test: { include: ["src/**/*.test.ts"], environment: "node" },
  worker: { format: "es" },
});
