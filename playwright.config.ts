import { defineConfig, devices } from "@playwright/test";

const SERVER_PORT = 4100;
const WEB_PORT = 3100;

/**
 * End-to-end tests run the built server (in-memory Postgres via PGlite), the
 * built web app, and a real bridge process with the mock ACP agent.
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: "retain-on-failure",
    viewport: { width: 1280, height: 800 },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: [
    {
      command: "rm -rf .e2e && mkdir -p .e2e && node apps/server/dist/index.js",
      url: `http://localhost:${SERVER_PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        DATABASE_URL: "pglite://memory",
        SERVER_PORT: String(SERVER_PORT),
        PUBLIC_WS_URL: `ws://localhost:${SERVER_PORT}/ws`,
        PUBLIC_SERVER_URL: `http://localhost:${SERVER_PORT}`,
        PUBLIC_APP_URL: `http://localhost:${WEB_PORT}`,
        STORAGE_DIR: ".e2e/files",
        AUTH_RATE_LIMIT_PER_MIN: "100",
        NODE_ENV: "test",
      },
    },
    {
      command: `pnpm --filter @oneswarm/web exec next start -p ${WEB_PORT}`,
      url: `http://localhost:${WEB_PORT}/login`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { SERVER_URL: `http://localhost:${SERVER_PORT}` },
    },
  ],
});
