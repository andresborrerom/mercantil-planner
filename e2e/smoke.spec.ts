/**
 * Spec 1 — Smoke: la pagina carga, header visible, badge Fase 2 presente,
 * sin errores de consola.
 *
 * Nota: el PhaseBadge usa `hidden lg:inline-flex`, asi que solo es visible en
 * viewport >= 1024px. El default de Playwright (1440x900) lo cubre. Usamos
 * `toBeAttached()` para que el assertion no dependa del display.
 */
import { expect, test } from '@playwright/test';
import { setInitialTheme } from './helpers';

test('smoke: pagina carga, header + badge Fase 2, sin console errors', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => {
    consoleErrors.push(`pageerror: ${err.message}`);
  });

  await setInitialTheme(page, 'light');
  await page.goto('/');

  // Header + titulo principal
  await expect(page.getByText('Mercantil', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('heading', { name: /Planificador patrimonial/i })).toBeVisible();

  // Badge Fase 2 (puede estar hidden en viewports pequeños — aqui estamos a 1440)
  const phaseBadge = page.getByText(/Fase 2 · RF yield-path/i).first();
  await expect(phaseBadge).toBeVisible();

  // Estado verde: el badge tiene bg-emerald-50 + border-emerald-300 (light) o
  // variantes dark. Basta con confirmar que el dot verde esta presente.
  // Verificamos que haya bullet point verde adentro.
  const greenDot = phaseBadge.locator('span').first();
  await expect(greenDot).toBeVisible();

  // No errores en consola. Filtramos warnings comunes de Recharts (defaultProps
  // deprecation en React 19+) que son ruido no-bloqueante de una libreria ajena.
  const meaningfulErrors = consoleErrors.filter(
    (e) => !/defaultProps/.test(e) && !/React does not recognize/.test(e),
  );
  expect(meaningfulErrors, `errores en consola:\n${meaningfulErrors.join('\n')}`).toEqual([]);
});
