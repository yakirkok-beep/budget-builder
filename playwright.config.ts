import { defineConfig, devices } from '@playwright/test';

const DEV = 5181; // dev server: fast, for most tests
const PROD = 5182; // production build + preview: for the offline (PWA) test

export default defineConfig({
  testDir: 'tests/e2e',
  reporter: 'list',
  use: {
    locale: 'he-IL',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: `npx vite --port ${DEV} --strictPort`,
      url: `http://localhost:${DEV}`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: `npm run build && npx vite preview --port ${PROD} --strictPort`,
      url: `http://localhost:${PROD}`,
      reuseExistingServer: !process.env.CI,
      timeout: 240_000,
    },
  ],
  projects: [
    { name: 'chromium', testIgnore: /pwa\.spec\.ts/, use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${DEV}` } },
    { name: 'pwa', testMatch: /pwa\.spec\.ts/, use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${PROD}`, serviceWorkers: 'allow' } },
  ],
});
