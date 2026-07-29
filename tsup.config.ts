import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    view: "src/view/index.ts",
  },
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  minify: true,
});
