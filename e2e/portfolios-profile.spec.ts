/**
 * Spec 2 — Portfolio selection: elegir A=Conservador + B=Crecimiento muestra
 * ProfilePreview con VOLATILIDAD MEDIA (A) y VOLATILIDAD ALTA (B) antes de
 * simular.
 *
 * Los defaults del store son Conservador/Balanceado → este spec cambia B a
 * Crecimiento via click en el chip correspondiente dentro del Portfolio B.
 */
import { expect, test } from '@playwright/test';
import { setInitialTheme } from './helpers';

test('portfolios: Conservador vs Crecimiento muestra badges Media / Alta', async ({ page }) => {
  await setInitialTheme(page, 'light');
  await page.goto('/');

  // El default ya es Conservador en A — confirmar que el chip esta marcado
  // como active en el card A. Usamos el card ancestor para scoping.
  const cardA = page.locator('.mp-card').filter({ has: page.getByText('Portafolio A') });
  const cardB = page.locator('.mp-card').filter({ has: page.getByText('Portafolio B') });

  // A: Conservador ya esta seleccionado; si no, lo clickeamos.
  await cardA.getByRole('button', { name: 'Conservador' }).click();

  // B: default es Balanceado → click en Crecimiento
  await cardB.getByRole('button', { name: 'Crecimiento' }).click();

  // Profile badges: ProfilePreview debe mostrar "Volatilidad Media" para A
  // (Conservador ~ 7% vol) y "Volatilidad Alta" para B (Crecimiento ~ 14% vol).
  // El texto puede venir capitalizado. Los badges estan dentro de ProfileBadge.
  const profileCard = page.locator('.mp-card').filter({
    has: page.getByText(/Perfil del cliente y escenario posible/i),
  });

  const badgeA = profileCard.locator('div').filter({ hasText: /^Portafolio A/ }).first();
  const badgeB = profileCard.locator('div').filter({ hasText: /^Portafolio B/ }).first();

  await expect(badgeA.getByText(/Volatilidad Media/i)).toBeVisible();
  await expect(badgeB.getByText(/Volatilidad Alta/i)).toBeVisible();
});
