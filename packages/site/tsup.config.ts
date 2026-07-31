import { defineConfig } from "tsup";

export default defineConfig({
  entry: { index: "src/index.ts", dev: "src/dev.ts" },
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  minify: true,
  external: ["hono"],
});
