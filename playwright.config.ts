/**
 * Playwright config para los tests E2E del planner.
 *
 * Decisiones:
 *   - testDir ./e2e separado de Vitest (src/**\/*.test.ts).
 *   - Se corre contra el build de producción (`vite preview`) en port 4173,
 *     no contra dev, para evitar HMR + tiempos de compilación del worker.
 *   - Un solo proyecto (chromium) con viewport 1440x900 como default.
 *     Tests específicos overridden localmente cuando necesitan 1280x800.
 *   - reuseExistingServer local para iterar rápido; en CI lanza server propio.
 */
import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false, // El worker de bootstrap en una sola tab es mas estable serial.
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'list' : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    viewport: { width: 1440, height: 900 },
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: {
    command: `npm run preview -- --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
