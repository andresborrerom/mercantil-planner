/**
 * Spec 10 — Responsive 1280×800: body no overflow en light + dark.
 *
 * El spec §7 del INSTRUCCIONES-PLANNER.md exige que la app funcione sin
 * recortes a 1280×800 mínimo. Validamos que document.body.scrollWidth ≤ 1280
 * en ambos modos.
 */
import { expect, test } from '@playwright/test';
import { setInitialTheme } from './helpers';

test.use({ viewport: { width: 1280, height: 800 } });

test('responsive 1280×800 light: body.scrollWidth ≤ 1280', async ({ page }) => {
  await setInitialTheme(page, 'light');
  await page.goto('/');
  // Esperamos al render inicial (hero + primer card visible).
  await expect(page.getByRole('heading', { name: /Planificador patrimonial/i })).toBeVisible();

  const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
  expect(scrollWidth, `body.scrollWidth=${scrollWidth}`).toBeLessThanOrEqual(1280);
});

test('responsive 1280×800 dark: body.scrollWidth ≤ 1280', async ({ page }) => {
  await setInitialTheme(page, 'dark');
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /Planificador patrimonial/i })).toBeVisible();

  // Sanity: estamos en dark.
  const dark = await page.evaluate(() => document.documentElement.classList.contains('dark'));
  expect(dark).toBe(true);

  const scrollWidth = await page.evaluate(() => document.body.scrollWidth);
  expect(scrollWidth, `body.scrollWidth=${scrollWidth}`).toBeLessThanOrEqual(1280);
});
