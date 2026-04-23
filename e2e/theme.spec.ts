/**
 * Specs 6 + 7 — Dark mode toggle + persistencia.
 *
 * Spec 6: click sol/luna en header → <html> gana clase `.dark`, chart stroke
 *   A cambia de #213A7D (light) a #92A6DE (dark).
 *
 * Spec 7: reload preserva el tema (localStorage `mercantil-planner.theme`).
 */
import { expect, test } from '@playwright/test';
import { isDark, readTheme, runSimulation, setInitialTheme, THEME_KEY } from './helpers';

test('toggle dark mode: html.dark + chart stroke cambia', async ({ page }) => {
  await setInitialTheme(page, 'light');
  await page.goto('/');

  // Simular para que aparezcan las lineas del chart (chart solo renderiza
  // con datos — sin eso no hay stroke que comparar).
  await runSimulation(page);

  // Sanity light: html no tiene 'dark'.
  expect(await isDark(page)).toBe(false);

  // Linea A de mediana en light: stroke es '#213A7D' (mercantil navy).
  const medianA = page.locator('svg .recharts-line path.recharts-curve').first();
  const lightStroke = await medianA.getAttribute('stroke');
  expect(lightStroke?.toLowerCase()).toContain('#213a7d');

  // Click toggle — el boton tiene aria-label dinamico.
  const toggle = page.getByRole('button', { name: /Cambiar a modo oscuro/i });
  await toggle.click();

  await expect.poll(() => isDark(page)).toBe(true);
  // Tras el toggle el aria-label cambia a "Cambiar a modo claro".
  await expect(page.getByRole('button', { name: /Cambiar a modo claro/i })).toBeVisible();

  // Linea A en dark: stroke #92A6DE (navy dark-tinted).
  // Recharts re-renderiza el svg — volvemos a tomar el elemento.
  await expect.poll(async () => {
    const el = page.locator('svg .recharts-line path.recharts-curve').first();
    const s = await el.getAttribute('stroke');
    return s?.toLowerCase() ?? '';
  }).toContain('#92a6de');
});

test('persistencia dark: recargar preserva la clase dark y localStorage', async ({ page }) => {
  await setInitialTheme(page, 'dark');
  await page.goto('/');

  // Sanity: html.dark aplicado por el FOUC script inline.
  await expect.poll(() => isDark(page)).toBe(true);
  expect(await readTheme(page)).toBe('dark');

  await page.reload();

  // Tras reload: sigue dark.
  await expect.poll(() => isDark(page)).toBe(true);
  const stored = await page.evaluate((k) => window.localStorage.getItem(k), THEME_KEY);
  expect(stored).toBe('dark');
});
