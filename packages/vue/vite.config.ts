import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [vue()],
  build: {
    sourcemap: true,
    lib: {
      // Two entries: main (zero deps) + lighting (depends on three via
      // the core sub-entry, which we keep external so it isn't bundled).
      entry: {
        index: resolve(__dirname, "src/index.ts"),
        lighting: resolve(__dirname, "src/lighting.ts"),
      },
      formats: ["es", "cjs"],
      fileName: (format, entry) =>
        format === "es" ? `${entry}.js` : `${entry}.cjs`,
    },
    rollupOptions: {
      external: ["vue", "@aicut/core", "@aicut/core/lighting"],
      output: { globals: { vue: "Vue" } },
    },
    outDir: "dist",
    emptyOutDir: true,
  },
});
