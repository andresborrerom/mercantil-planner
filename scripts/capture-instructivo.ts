/**
 * capture-instructivo.ts — captura automatizada de los assets visuales del
 * instructivo del asesor usando Playwright.
 *
 * Aprovecha el botón "Pegar config JSON" del ExportBar para hidratar el estado
 * del planner en una sola operación, evitando simular 7 clicks/inputs distintos.
 * Después corre Simular y captura cada zona como PNG zoneado.
 *
 * Output: instructivo/assets/parte-N-MM-descripcion.png
 *
 * Uso:
 *   npm run preview                              # en una terminal aparte (port 4173)
 *   npx tsx scripts/capture-instructivo.ts       # corre la captura
 *
 * Headed mode (browser visible para debug):
 *   $env:HEADED='1'; npx tsx scripts/capture-instructivo.ts   (PowerShell)
 *   HEADED=1 npx tsx scripts/capture-instructivo.ts            (bash)
 */
import { chromium, type Locator, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const ASSETS_DIR = path.resolve('instructivo', 'assets');
const BASE_URL = 'http://localhost:4173/mercantil-planner/';
const HEADED = process.env.HEADED === '1';
const VIEWPORT = { width: 1440, height: 900 };

// ---------------------------------------------------------------------------
// Configs por caso — el state que se hidrata via "Pegar config JSON".
// ---------------------------------------------------------------------------

/** Caso default — el mismo que usan los samples del PDF (consistencia visual). */
const SAMPLE_CONFIG = {
  version: 1,
  portfolioA: { kind: 'signature', id: 'Balanceado' },
  portfolioB: { kind: 'signature', id: 'Crecimiento' },
  plan: {
    initialCapital: 1_500_000,
    horizonMonths: 240,
    mode: 'real',
    inflationPct: 2.5,
    rules: [
      {
        id: 'r1',
        label: 'Aporte mensual',
        sign: 'deposit',
        amount: 5000,
        frequency: 'monthly',
        startMonth: 1,
        endMonth: null,
        growthPct: 3,
      },
    ],
  },
  bootstrap: {
    seed: 42,
    nPaths: 5000,
    blockSize: 12,
    fixed6Annual: 0.06,
    fixed9Annual: 0.09,
  },
};

/** Caso Pablo — acumulación 25 años, 100k inicial, aporte 2k+3% mensual. */
const PABLO_CONFIG = {
  ...SAMPLE_CONFIG,
  plan: {
    initialCapital: 100_000,
    horizonMonths: 300,
    mode: 'real',
    inflationPct: 2.5,
    rules: [
      {
        id: 'r1',
        label: 'Aporte mensual',
        sign: 'deposit',
        amount: 2000,
        frequency: 'monthly',
        startMonth: 1,
        endMonth: null,
        growthPct: 3,
      },
    ],
  },
};

/** Caso Marta — decumulación 25 años, 500k inicial, retiro 4k mensual real. */
const MARTA_CONFIG = {
  ...SAMPLE_CONFIG,
  portfolioA: { kind: 'signature', id: 'Conservador' },
  portfolioB: { kind: 'signature', id: 'Balanceado' },
  plan: {
    initialCapital: 500_000,
    horizonMonths: 300,
    mode: 'real',
    inflationPct: 2.5,
    rules: [
      {
        id: 'r1',
        label: 'Retiro mensual',
        sign: 'withdraw',
        amount: 4000,
        frequency: 'monthly',
        startMonth: 1,
        endMonth: null,
        growthPct: 0,
      },
    ],
  },
};

/** Caso Marta seguimiento — 5 años después: capital remanente, horizonte recortado. */
const MARTA_SEGUIMIENTO_CONFIG = {
  ...MARTA_CONFIG,
  plan: {
    ...MARTA_CONFIG.plan,
    initialCapital: 380_000,
    horizonMonths: 240,
  },
};

/** Caso Diana — CDT renovador, 200k inicial, 15 años buy-and-hold. */
const DIANA_CONFIG = {
  ...SAMPLE_CONFIG,
  portfolioA: {
    kind: 'custom' as const,
    label: 'CDT-Proxy',
    weights: { CashST: 50, GlFI: 50 },
  },
  portfolioB: { kind: 'signature' as const, id: 'Crecimiento' },
  plan: {
    initialCapital: 200_000,
    horizonMonths: 180,
    mode: 'real' as const,
    inflationPct: 2.5,
    rules: [],
  },
};

/** Caso Carlos — HNW 30 años, transferencia única al hijo en mes 120. */
const CARLOS_CONFIG = {
  ...SAMPLE_CONFIG,
  portfolioA: {
    kind: 'custom' as const,
    label: 'Equity-tilted',
    weights: { 'USA.Eq': 70, 'GlSec.Eq': 20, GlFI: 10 },
  },
  portfolioB: { kind: 'signature' as const, id: 'Balanceado' },
  plan: {
    initialCapital: 2_000_000,
    horizonMonths: 360,
    mode: 'nominal' as const,
    inflationPct: 2.5,
    rules: [
      {
        id: 'r1',
        label: 'Transferencia al hijo',
        sign: 'withdraw' as const,
        amount: 500_000,
        frequency: 'monthly' as const,
        startMonth: 120,
        endMonth: 120,
        growthPct: 0,
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function applyConfig(page: Page, config: typeof SAMPLE_CONFIG): Promise<void> {
  // Reset completo del UI (cards colapsados, tabs en default, etc.) antes de
  // aplicar la config nueva. addInitScript se ejecuta de nuevo en cada goto.
  await page.goto(BASE_URL);

  // Neutralizar el header sticky para que no aparezca encima de cards altos
  // cuando Playwright scrollea para capturarlos. El header se renderiza en su
  // posición original al inicio del documento; los screenshots zoneados de
  // cards no lo incluyen.
  await page.addStyleTag({
    content: 'header { position: static !important; }',
  });

  const textarea = page.locator('textarea[placeholder*="version"]').first();
  await textarea.scrollIntoViewIfNeeded();
  await textarea.fill(JSON.stringify(config));
  await page.getByRole('button', { name: /^Aplicar$/i }).click();
  await page.waitForTimeout(500);

  // Volver al top antes de simular para que la barra de progreso del simular sea visible.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);

  const simulate = page.getByRole('button', { name: /Simular/i }).first();
  await simulate.waitFor({ state: 'visible' });
  await simulate.click();
  await page.getByText(/Última corrida/i).waitFor({ timeout: 30_000 });
  await page.waitForTimeout(800);
}

async function setupBrowser(page: Page): Promise<void> {
  // Forzar tema light antes del primer render. addInitScript se aplica a
  // todos los page.goto subsecuentes — incluidos los que hace applyConfig.
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('mercantil-planner.theme', 'light');
    } catch {
      /* noop */
    }
  });
}

async function captureCard(page: Page, titlePattern: RegExp, filename: string): Promise<void> {
  const card = page.locator('.mp-card').filter({ hasText: titlePattern }).first();
  await card.scrollIntoViewIfNeeded();
  // Mover el mouse a (0, 0) para evitar tooltips de Recharts u otros hovers.
  await page.mouse.move(0, 0);
  await page.waitForTimeout(200);
  await card.screenshot({ path: path.join(ASSETS_DIR, filename) });
  console.log(`  ✓ ${filename}`);
}

async function captureRegion(
  page: Page,
  locators: Locator[],
  filename: string,
  padding = 8,
): Promise<void> {
  await locators[0].scrollIntoViewIfNeeded();
  await page.mouse.move(0, 0);
  await page.waitForTimeout(200);

  const boxes = await Promise.all(locators.map((l) => l.boundingBox()));
  const valid = boxes.filter((b): b is NonNullable<typeof b> => b !== null);
  if (valid.length === 0) {
    throw new Error(`captureRegion: ningún locator tiene bounding box visible (${filename})`);
  }
  const xs = valid.map((b) => b.x);
  const ys = valid.map((b) => b.y);
  const rights = valid.map((b) => b.x + b.width);
  const bottoms = valid.map((b) => b.y + b.height);

  const x = Math.max(0, Math.min(...xs) - padding);
  const y = Math.max(0, Math.min(...ys) - padding);
  const width = Math.max(...rights) - x + padding;
  const height = Math.max(...bottoms) - y + padding;

  await page.screenshot({
    path: path.join(ASSETS_DIR, filename),
    clip: { x, y, width, height },
  });
  console.log(`  ✓ ${filename}`);
}

async function captureFullPage(page: Page, filename: string): Promise<void> {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
  await page.screenshot({
    path: path.join(ASSETS_DIR, filename),
    fullPage: true,
  });
  console.log(`  ✓ ${filename} (full page)`);
}

/** Expande un card colapsable haciendo click en su header (chevron). */
async function expandCard(page: Page, titlePattern: RegExp): Promise<Locator> {
  const card = page.locator('.mp-card').filter({ hasText: titlePattern }).first();
  await card.getByRole('button', { name: titlePattern }).first().click();
  await page.waitForTimeout(300);
  return card;
}

// ---------------------------------------------------------------------------
// Bloques de captura por parte
// ---------------------------------------------------------------------------

async function captureParte2(page: Page): Promise<void> {
  console.log('\nCapturando assets de Parte 2 (caso sample)...');
  await applyConfig(page, SAMPLE_CONFIG);

  await captureFullPage(page, 'parte-2-00-overview.png');

  const header = page.locator('header').first();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
  await header.screenshot({ path: path.join(ASSETS_DIR, 'parte-2-01-header.png') });
  console.log('  ✓ parte-2-01-header.png');

  const cardA = page.locator('.mp-card').filter({ hasText: /Portafolio A/ }).first();
  const cardB = page.locator('.mp-card').filter({ hasText: /Portafolio B/ }).first();
  const toggleWrapper = page
    .locator('label')
    .filter({ hasText: /Mostrar AMCs propuestos/ })
    .first();
  await captureRegion(page, [cardA, cardB, toggleWrapper], 'parte-2-02-selector-portafolios.png');

  await captureCard(page, /Perfil del cliente y escenario posible/, 'parte-2-04-perfil-y-sample.png');
  await captureCard(page, /Flujos y parámetros del plan/, 'parte-2-06-flujos.png');
  await captureCard(page, /Proyección patrimonial/, 'parte-2-07-fan-chart.png');
  await captureCard(page, /Estadísticas A vs B/, 'parte-2-09-stats.png');

  // Views — expandir + tab Presets.
  const viewsCard = await expandCard(page, /Views — análisis condicional/);
  await viewsCard.getByRole('button', { name: /Presets/ }).click();
  await page.waitForTimeout(300);
  await captureCard(page, /Views — análisis condicional/, 'parte-2-10-views.png');

  // Regímenes — expandir.
  await expandCard(page, /Regímenes históricos/);
  await captureCard(page, /Regímenes históricos/, 'parte-2-12-regimenes.png');

  await captureCard(page, /Exportar y compartir/, 'parte-2-13-exportar.png');
}

async function captureParte3(page: Page): Promise<void> {
  console.log('\nCapturando assets de Parte 3...');

  // 3.09 — Caso Pablo: fan chart + stats. Capturados como dos archivos separados
  // (los dos cards juntos exceden el viewport vertical; en el HTML responsive
  // los mostramos uno debajo del otro de forma natural).
  await applyConfig(page, PABLO_CONFIG);
  await captureCard(page, /Proyección patrimonial/, 'parte-3-09a-pablo-fan-chart.png');
  await captureCard(page, /Estadísticas A vs B/, 'parte-3-09b-pablo-stats.png');

  // 3.10 — Caso sample con preset Tasas suben +100 pbs activo + análisis asimétrico.
  await applyConfig(page, SAMPLE_CONFIG);
  const viewsCard = await expandCard(page, /Views — análisis condicional/);
  await viewsCard.getByRole('button', { name: /Presets/ }).click();
  await page.waitForTimeout(300);
  await viewsCard.getByRole('button', { name: /Tasas suben 100 pbs/ }).click();
  await page.waitForTimeout(800); // esperar a que análisis asimétrico se compute.
  await captureCard(page, /Views — análisis condicional/, 'parte-3-10-views-asimetrico.png');
}

async function captureParte4b(page: Page): Promise<void> {
  console.log('\nCapturando assets de Parte 4b...');

  // 4b.01 — Marta original: stats panel.
  await applyConfig(page, MARTA_CONFIG);
  await captureCard(page, /Estadísticas A vs B/, 'parte-4b-01-marta-original.png');

  // 4b.02 — Marta seguimiento: stats panel con capital remanente y horizonte recortado.
  await applyConfig(page, MARTA_SEGUIMIENTO_CONFIG);
  await captureCard(page, /Estadísticas A vs B/, 'parte-4b-02-marta-seguimiento.png');

  // 4b.03 — Modal PDF en seguimiento.
  await applyConfig(page, SAMPLE_CONFIG);
  await page
    .getByRole('button', { name: /Generar plan personal de inversión/ })
    .click();
  await page.waitForTimeout(500);

  // Llenar el form con datos de seguimiento. Los inputs de cliente/asesor son <input>
  // sin label semántico explícito — los localizamos por placeholder.
  const modal = page.locator('form').filter({ hasText: /Generar plan personal de inversión/ });
  await modal.locator('input[placeholder*="Pocho"]').fill('Pocho Borrero');
  await modal.locator('input[placeholder*="Andrés"]').fill('Andrés Borrero');
  // Bucket Longevidad ya es default. Versión Completa default. Idioma ES default.
  // Carta personalizada con texto de seguimiento.
  await modal
    .locator('textarea[placeholder*="Mensaje"]')
    .fill(
      'Pocho — adjunto el seguimiento del plan inicial al cumplir 12 meses. ' +
        'Su capital se mantiene dentro de la banda P10–P90 proyectada. ' +
        'Próxima revisión en 12 meses.',
    );
  await page.waitForTimeout(400);

  // Capturar el modal completo (el form).
  await modal.screenshot({ path: path.join(ASSETS_DIR, 'parte-4b-03-modal-seguimiento.png') });
  console.log('  ✓ parte-4b-03-modal-seguimiento.png');

  // Cerrar el modal.
  await modal.getByRole('button', { name: /Cancelar/ }).click();
  await page.waitForTimeout(300);
}

async function captureParte5(page: Page): Promise<void> {
  console.log('\nCapturando assets de Parte 5 (4 casos cliente)...');

  // Caso Pablo — acumulación 25 años.
  await applyConfig(page, PABLO_CONFIG);
  await captureCard(page, /Estadísticas A vs B/, 'parte-5-pablo-stats.png');

  // Caso Diana — CDT renovador. Habilitar AMCs propuestos primero (CashST).
  await page.goto(BASE_URL);
  await page.addStyleTag({ content: 'header { position: static !important; }' });
  await page
    .locator('label')
    .filter({ hasText: /Mostrar AMCs propuestos/ })
    .locator('input[type="checkbox"]')
    .check();
  await page.waitForTimeout(200);
  // Aplicar Diana (sin reload — el goto ya lo hizo).
  const textareaDiana = page.locator('textarea[placeholder*="version"]').first();
  await textareaDiana.scrollIntoViewIfNeeded();
  await textareaDiana.fill(JSON.stringify(DIANA_CONFIG));
  await page.getByRole('button', { name: /^Aplicar$/i }).click();
  await page.waitForTimeout(500);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
  const simulateDiana = page.getByRole('button', { name: /Simular/i }).first();
  await simulateDiana.click();
  await page.getByText(/Última corrida/i).waitFor({ timeout: 30_000 });
  await page.waitForTimeout(800);
  await captureCard(page, /Estadísticas A vs B/, 'parte-5-diana-stats.png');

  // Caso Marta — decumulación 25 años.
  await applyConfig(page, MARTA_CONFIG);
  await captureCard(page, /Estadísticas A vs B/, 'parte-5-marta-stats.png');

  // Caso Carlos — HNW 30 años con transferencia única.
  await applyConfig(page, CARLOS_CONFIG);
  await captureCard(page, /Estadísticas A vs B/, 'parte-5-carlos-stats.png');
}

async function captureParte4c(page: Page): Promise<void> {
  console.log('\nCapturando assets de Parte 4c...');

  // 4c.01 — Tab Escenario combinado con combinator Sincronizado activo.
  await applyConfig(page, SAMPLE_CONFIG);
  const viewsCard = await expandCard(page, /Views — análisis condicional/);
  await viewsCard.getByRole('button', { name: /Escenario combinado/ }).click();
  await page.waitForTimeout(300);
  await viewsCard.getByRole('button', { name: /Sincronizado.*mes/ }).click();
  await page.waitForTimeout(300);
  await captureCard(page, /Views — análisis condicional/, 'parte-4c-01-sync-builder.png');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  await mkdir(ASSETS_DIR, { recursive: true });

  console.log(
    `Capture-instructivo — viewport ${VIEWPORT.width}×${VIEWPORT.height}, ${HEADED ? 'headed' : 'headless'}`,
  );
  console.log(`Output: ${ASSETS_DIR}\n`);

  const browser = await chromium.launch({ headless: !HEADED });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  try {
    await setupBrowser(page);

    await captureParte2(page);
    await captureParte3(page);
    await captureParte4b(page);
    await captureParte4c(page);
    await captureParte5(page);

    console.log('\n✓ Captura completa.');
    console.log('\nGIFs (parte-2-03/05/08/11/14, parte-3-3.1/3.4, parte-4b-4b.1, parte-5-cierre-pablo) — pendientes en iteración 2.');
    console.log('Sección E del PDF (parte-4-anexo-cvar.png) — pendiente: requiere extracción desde PDF, no captura UI.');
  } catch (err) {
    console.error('\n✗ Falló:', err);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main();
