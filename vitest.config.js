import { defineConfig } from "vitest/config";

// Unit tests for the pure helpers (`src/lib`) and the zustand store (`src/store`). Browser-level
// behavior is covered by Playwright (`e2e/`, `playwright.config.js`).
export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{js,jsx}"],
    setupFiles: ["src/test/setup.js"],
    restoreMocks: true,
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.js", "src/store/**/*.js"],
      exclude: ["**/*.test.js"],
      reporter: ["text-summary", "text", "html", "json-summary"],
      thresholds: { lines: 80 },
    },
  },
});
