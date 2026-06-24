import { defineConfig } from "tsup";

export default defineConfig({
  // Two entries:
  //   - index.ts → main API (Editor, Timeline, types). Zero runtime deps.
  //   - lighting/index.ts → opt-in 3D picker. Bundles three.js.
  // Importing only `@aicut/core` leaves three.js completely out of the
  // consumer's bundle; `@aicut/core/lighting` opts in.
  entry: ["src/index.ts", "src/lighting/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  target: "es2022",
  treeshake: true,
  // three.js is a real dependency for the lighting entry — bundle it
  // so consumers don't have to install or configure it. tsup defaults
  // to externalising anything in `dependencies`; force-bundle three
  // by NOT marking it external.
  noExternal: ["three"],
});
