import { defineConfig } from "vitest/config";

export default defineConfig({
  root: "web",
  // The sample model (samples/*.glb) is imported as a file address, so it is treated as an asset.
  assetsInclude: ["**/*.glb"],
  build: {
    outDir: "../build/web",
    emptyOutDir: true,
    target: "es2022",
  },
  test: { include: ["src/**/*.test.ts"], environment: "node" },
  worker: { format: "es" },
});
