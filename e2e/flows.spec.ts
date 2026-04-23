/**
 * Spec 8 — Preset application: click "Jubilación" → modo cambia a 'real',
 * input de inflación visible/habilitado, aparece regla de retiro con signo
 * negativo (withdraw).
 *
 * La preset "jubilacion" de src/domain/presets.ts setea:
 *   - mode: 'real'
 *   - inflationPct: 2.5
 *   - una regla con sign='withdraw' label="Retiro mensual"
 */
import { expect, test } from '@playwright/test';
import { setInitialTheme } from './helpers';

test('preset Jubilación: modo real, inflación visible, regla withdraw presente', async ({ page }) => {
  await setInitialTheme(page, 'light');
  await page.goto('/');

  // Click el chip "Jubilación" en el FlowEditor.
  await page.getByRole('button', { name: /Jubilación/i }).click();

  // El selector de Modo debe quedar en 'real'.
  const modeSelect = page.getByLabel(/^Modo$/i).first();
  await expect(modeSelect).toHaveValue('real');

  // El input de inflación debe quedar habilitado (no disabled) y con algún
  // valor positivo. La preset setea 2.5 pero el usuario podría haber cambiado
  // antes — mientras no esté deshabilitado y sea > 0, ok.
  const inflation = page.getByLabel(/Inflación anual/i);
  await expect(inflation).toBeEnabled();
  const inflVal = await inflation.inputValue();
  expect(Number(inflVal)).toBeGreaterThan(0);

  // Al menos una regla de retiro debe existir (sign='withdraw' → el selector
  // muestra la opción "Retiro"). El label de la regla contiene "Retiro".
  await expect(page.getByText(/Retiro mensual/i).first()).toBeVisible();
});
