/**
 * Spec 3 — Full simulation path:
 *   - Click Simular
 *   - Progreso 0% → 100%
 *   - Fan chart renderiza con 2 bandas (A navy + B orange)
 *   - Stats panel muestra 9 filas de metricas (A / B / Δ)
 */
import { expect, test } from '@playwright/test';
import { setInitialTheme } from './helpers';

test('simulate: progress 0→100, fan chart render, 9 metric rows', async ({ page }) => {
  await setInitialTheme(page, 'light');
  await page.goto('/');

  // Dispara la simulacion via el SimulateButton dentro del FanChart card.
  const simulate = page.getByRole('button', { name: /Simular/i }).first();
  await expect(simulate).toBeEnabled();
  await simulate.click();

  // Durante running, el boton muestra "N%" (ej. "45%"). Esperamos que el porcentaje
  // >= 0 aparezca brevemente. Luego esperamos a que desaparezca (status done).
  // Mas robusto: esperamos a que "Última corrida" sea visible.
  await expect(page.getByText(/Última corrida/i)).toBeVisible({ timeout: 30_000 });

  // Fan chart: en el SVG debe haber elementos Area (recharts-area-area) — son
  // las bandas A y B. Recharts anada clases `.recharts-area`. Dos areas.
  const areas = page.locator('svg .recharts-area');
  await expect(areas).toHaveCount(2);

  // Stats panel: tabla con 9 filas (9 metricas del spec §6). Scope al card.
  const statsCard = page.locator('.mp-card').filter({
    has: page.getByText(/Estadísticas A vs B/i),
  });
  await expect(statsCard.locator('tbody tr')).toHaveCount(9);

  // Smoke check de las columnas: A, B, Δ visibles en el header.
  await expect(statsCard.getByRole('columnheader', { name: 'A' })).toBeVisible();
  await expect(statsCard.getByRole('columnheader', { name: 'B' })).toBeVisible();
  await expect(statsCard.getByRole('columnheader', { name: /Δ.*B.*−.*A/i })).toBeVisible();

  // Bug 1 regression (2026-04-17): el fan chart NO debe tener ningún punto con
  // Y < 0. Validamos inspeccionando los ticks del YAxis de Recharts — si
  // hubiera valores negativos, el YAxis auto-escala para incluirlos y veríamos
  // ticks con signo negativo (el formatter muestra "-$100K", etc.).
  const yTicks = page.locator('svg .recharts-yAxis .recharts-cartesian-axis-tick-value tspan');
  const tickTexts = await yTicks.allTextContents();
  // Al menos un tick debe haber (sanity).
  expect(tickTexts.length).toBeGreaterThan(0);
  for (const t of tickTexts) {
    expect(t.trim(), `YAxis tick negativo detectado: "${t}"`).not.toMatch(/^-/);
  }
});
