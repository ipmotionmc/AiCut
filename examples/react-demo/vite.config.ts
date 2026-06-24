import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: "127.0.0.1",
    strictPort: true,
  },
  preview: {
    port: 5173,
    host: "127.0.0.1",
    strictPort: true,
  },
  // Workspace packages mutate during development — exclude them from
  // Vite's esbuild pre-bundle so the demo always picks up the latest
  // `pnpm build` of `@aicut/core` / `@aicut/react` on page reload
  // instead of serving a frozen cached chunk.
  optimizeDeps: {
    exclude: [
      "@aicut/core",
      "@aicut/core/lighting",
      "@aicut/react",
      "@aicut/react/lighting",
    ],
  },
});
