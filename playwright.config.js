/**
 * End-to-end tests run against the production build served by `vite preview`, so they exercise
 * the same sub-path (`/datablocks/`) and code splitting as GitHub Pages.
 *
 * Specs tagged `@perf` measure the large benchmark flow; CI skips them (`--grep-invert @perf`)
 * because shared runners are too noisy for timing budgets. Run them locally with
 * `npm run e2e -- --grep @perf`.
 */
import { defineConfig, devices } from "@playwright/test";

const PORT = 4173;
const CI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  workers: CI ? 2 : undefined,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}/datablocks/`,
    acceptDownloads: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1600, height: 1000 } },
    },
  ],
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/datablocks/`,
    reuseExistingServer: !CI,
    timeout: 180_000,
  },
});
