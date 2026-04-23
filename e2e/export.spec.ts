/**
 * Spec 9 — Export Excel:
 *   - Click "📊 Excel (.xlsx)" después de simular → dispara download.
 *   - El suggestedFilename termina en .xlsx.
 *   - El chunk xlsx-*.js se carga de forma lazy (request aparece sólo al click).
 */
import { expect, test } from '@playwright/test';
import { runSimulation, setInitialTheme } from './helpers';

test('export Excel: download .xlsx + xlsx chunk lazy-loaded', async ({ page }) => {
  await setInitialTheme(page, 'light');

  // Track requests al chunk xlsx. Debe ser 0 antes de clickear el botón.
  const xlsxRequestsBeforeClick: string[] = [];
  const xlsxRequestsAfterClick: string[] = [];
  let clickFired = false;
  page.on('request', (req) => {
    const url = req.url();
    if (/xlsx-[^/]+\.js/.test(url)) {
      if (clickFired) xlsxRequestsAfterClick.push(url);
      else xlsxRequestsBeforeClick.push(url);
    }
  });

  await page.goto('/');

  // Antes de simular, el botón está deshabilitado (no hay datos).
  const excelBtn = page.getByRole('button', { name: /Excel/i });
  await expect(excelBtn).toBeDisabled();

  // Simular para habilitar el export.
  await runSimulation(page);
  await expect(excelBtn).toBeEnabled();

  // Sanity: el chunk xlsx NO debería haber sido pedido hasta ahora (es lazy).
  expect(xlsxRequestsBeforeClick, 'xlsx chunk solicitado antes de click').toEqual([]);

  // Click + capturar el download.
  const downloadPromise = page.waitForEvent('download', { timeout: 15_000 });
  clickFired = true;
  await excelBtn.click();
  const download = await downloadPromise;

  const name = download.suggestedFilename();
  expect(name).toMatch(/\.xlsx$/i);

  // Post-click: el chunk xlsx tiene que haber sido pedido al menos una vez.
  // (Si el navegador cacheó de una corrida anterior puede no dispararlo, pero
  // como Playwright usa contexto fresh por test, debe pedirlo.)
  expect(xlsxRequestsAfterClick.length).toBeGreaterThan(0);
});
