import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/lighting.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "es2022",
  // `@aicut/core/lighting` is a sub-path of @aicut/core — list it too
  // so the React wrapper doesn't try to bundle the (large) lighting
  // module. Host bundlers resolve the sub-path via package.json exports.
  external: [
    "react",
    "react-dom",
    "@aicut/core",
    "@aicut/core/lighting",
  ],
});
