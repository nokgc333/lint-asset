import { defineConfig } from "vite";

export default defineConfig({
  root: "web",
  build: {
    outDir: "../build/web",
    emptyOutDir: true,
    target: "es2022",
  },
  worker: { format: "es" },
});
