/**
 * Helpers compartidos para los specs E2E.
 *
 * - `resetStorage()` fuerza el theme a 'light' antes de cada test para que no
 *   haya flakiness entre corridas (Playwright persiste el perfil por default).
 * - `waitForSimulation()` espera a que el progreso llegue a 100% o el fan chart
 *   renderice, sin hardcodear sleeps.
 */
import { expect, type Page } from '@playwright/test';

export const THEME_KEY = 'mercantil-planner.theme';

/** Fuerza que el test arranque en light mode. Se llama antes de `page.goto()`. */
export async function setInitialTheme(page: Page, theme: 'light' | 'dark'): Promise<void> {
  await page.addInitScript((args) => {
    try {
      window.localStorage.setItem(args.key, args.theme);
    } catch {
      /* noop */
    }
  }, { key: THEME_KEY, theme });
}

/**
 * Espera a que una simulacion termine: el store pasa a 'done' y el FanChart
 * renderiza al menos un Area SVG. No usa sleep.
 */
export async function runSimulation(page: Page): Promise<void> {
  const simulate = page.getByRole('button', { name: /Simular/i }).first();
  await expect(simulate).toBeEnabled();
  await simulate.click();

  // El boton se deshabilita durante running y vuelve a habilitarse al done.
  // Esperamos que el texto "Ultima corrida" aparezca (status === 'done').
  await expect(page.getByText(/Última corrida/i)).toBeVisible({ timeout: 30_000 });
}

/** Retorna el contenido de localStorage para la key del tema. */
export async function readTheme(page: Page): Promise<string | null> {
  return page.evaluate((key) => window.localStorage.getItem(key), THEME_KEY);
}

/** Retorna si `<html>` tiene la clase `dark`. */
export async function isDark(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.classList.contains('dark'));
}
