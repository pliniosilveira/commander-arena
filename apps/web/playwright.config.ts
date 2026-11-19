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

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: true,
  retries: 0,
  reporter: [['list']],
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:4173',
    viewport: { width: 1366, height: 768 },
    // Traces cost a third of a run's CPU; turn one on with `--trace on` to debug a failure.
    trace: 'off',
    launchOptions: executablePath === undefined ? {} : { executablePath },
  },
  webServer: {
    command: 'pnpm build && pnpm exec vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
