import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

/**
 * End-to-end smoke tests (SPEC 12). They run against the production build served by `vite preview`.
 * The browser: `CHROMIUM_PATH` when set; otherwise the Chromium preinstalled in a cloud session
 * (`/opt/pw-browsers/chromium`, issue 35), so `pnpm e2e` runs there as it is; otherwise Playwright's
 * own (CI installs it with `playwright install chromium`).
 */
const SANDBOX_CHROMIUM = '/opt/pw-browsers/chromium';
const executablePath =
  process.env.CHROMIUM_PATH ?? (existsSync(SANDBOX_CHROMIUM) ? SANDBOX_CHROMIUM : undefined);

/** The port of the preview server: 4173, or `E2E_PORT` so that several checkouts can run the browser tests side by side. */
const PORT = process.env.E2E_PORT ?? '4173';

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: true,
  retries: 0,
  reporter: [['list']],
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1366, height: 768 },
    // Traces cost a third of a run's CPU; turn one on with `--trace on` to debug a failure.
    trace: 'off',
    launchOptions: executablePath === undefined ? {} : { executablePath },
  },
  webServer: {
    command: `pnpm build && pnpm exec vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
