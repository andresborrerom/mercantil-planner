/**
 * Specs 4 + 5 — RangeSlider sincronizado + window chips.
 *
 * Spec 4: mover un thumb en uno de los sliders (via keyboard, mas fiable que
 *   pointer) actualiza ambos sliders (comparten state en Zustand store).
 *
 * Spec 5: click en chip "5a" → ambos sliders de ambos cards snapean a [1, 60].
 */
import { expect, test } from '@playwright/test';
import { runSimulation, setInitialTheme } from './helpers';

test.describe('window sync', () => {
  test.beforeEach(async ({ page }) => {
    await setInitialTheme(page, 'light');
    await page.goto('/');
    // Necesitamos una simulacion para que aparezca el slider del ProfilePreview
    // (solo renderiza cuando hay sim, segun el componente).
    await runSimulation(page);
  });

  test('chip "5a" snapea ambos sliders a [1, 60]', async ({ page }) => {
    await page.getByRole('button', { name: '5a', exact: true }).click();

    // Esperamos a que el label de ventana refleje el nuevo rango.
    await expect(page.getByText(/Meses 1.*–.*60/i).first()).toBeVisible();

    // Los 4 thumbs (2 sliders × 2 thumbs) tienen role='slider'. El aria-valuenow
    // del thumb "start" debe ser 1 y el del thumb "end" 60.
    const starts = page.locator('[role="slider"][aria-label*="Inicio"]');
    const ends = page.locator('[role="slider"][aria-label*="Fin"]');

    await expect(starts).toHaveCount(2);
    await expect(ends).toHaveCount(2);

    for (let i = 0; i < 2; i++) {
      await expect(starts.nth(i)).toHaveAttribute('aria-valuenow', '1');
      await expect(ends.nth(i)).toHaveAttribute('aria-valuenow', '60');
    }
  });

  test('mover thumb end en un slider sincroniza el otro', async ({ page }) => {
    // Arrancar de un rango conocido (clickeamos "3a" = [1, 36]).
    await page.getByRole('button', { name: '3a', exact: true }).click();
    await expect(page.getByText(/Meses 1.*–.*36/i).first()).toBeVisible();

    // Tomamos el primer thumb "Fin de la ventana" (FanChart) y disparamos
    // keyboard ArrowRight (+1 mes). Se va de 36 → 37. El segundo slider
    // (ProfilePreview) debe reflejarlo tambien.
    const endA = page.locator('[role="slider"][aria-label*="Fin de la ventana"]').first();
    await endA.focus();
    await endA.press('ArrowRight');

    // Comprobamos ambos thumbs "Fin" estan en 37.
    const ends = page.locator('[role="slider"][aria-label*="Fin"]');
    await expect(ends.nth(0)).toHaveAttribute('aria-valuenow', '37');
    await expect(ends.nth(1)).toHaveAttribute('aria-valuenow', '37');
  });
});
