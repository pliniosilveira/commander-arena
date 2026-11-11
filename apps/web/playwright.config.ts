import { defineConfig } from '@playwright/test';

/**
 * End-to-end smoke tests (SPEC 12). They run against the production build served by `vite preview`.
 * CI installs Chromium with `playwright install chromium`; in the cloud sandbox set
 * `CHROMIUM_PATH=/opt/pw-browsers/chromium` to use the preinstalled browser.
 */
const executablePath = process.env.CHROMIUM_PATH;

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
    launchOptions: executablePath === undefined ? {} : { executablePath },
  },
  webServer: {
    command: 'pnpm build && pnpm exec vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
