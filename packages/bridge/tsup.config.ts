import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["esm"],
  target: "node22",
  platform: "node",
  clean: true,
  banner: { js: "#!/usr/bin/env node" },
  // Shared types and helpers are bundled; the published package has no workspace dependency.
  noExternal: ["@oneswarm/shared"],
});
