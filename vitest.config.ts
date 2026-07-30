import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    exclude: ["view/**", "**/node_modules/**", "**/dist/**"],
    restoreMocks: true,
  },
});
