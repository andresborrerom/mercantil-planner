#!/usr/bin/env node
/**
 * build-data.mjs — Mercantil Planner
 *
 * Lee los 3 CSVs de ../data/ (solo lectura), valida schema y
 * emite src/data/market.generated.ts con los datos inlineados como
 * Float32Array tipados estrechos.
 *
 * Idempotente: dos corridas consecutivas producen el mismo byte a byte.
 *
 * Convenciones:
 *   - DATES es la grilla maestra (del CSV de retornos, 244 meses).
 *   - YIELDS y RF_DECOMP se alinean a DATES con NaN-padding donde no hay dato.
 *   - Todo valor ausente se representa como NaN en el Float32Array.
 *
 * Referencias: INSTRUCCIONES-PLANNER.md §0 (deps externas) y §9 (este script).
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = resolve(__dirname, '..', 'data');
const OUT_FILE = resolve(__dirname, '..', 'src', 'data', 'market.generated.ts');

// --------------------------------------------------------------------------
// Constantes de validación (ver INSTRUCCIONES-PLANNER.md §8)
// --------------------------------------------------------------------------

const EXPECTED_TICKERS = [
  'BIL', 'SPTS', 'IEI', 'IEF', 'SPTL', 'IGOV', 'LQD', 'GHYG', 'EMB', 'CEMB',
  'AGG', 'ACWI', 'SPY', 'EZU', 'EWJ', 'URTH', 'EEM', 'ACWX', 'IJR', 'IWD',
  'IWF', 'IXN', 'IXG', 'RXI', 'EXI', 'IXJ', 'IXP', 'KXI', 'MXI', 'IXC',
  'RWO', 'JXI',
];

/** RF tickers tal como aparecen en mercantil_rf_decomposed.csv (orden sensible). */
const RF_TICKERS = [
  'BIL', 'SPTS', 'IEI', 'IEF', 'SPTL', 'IGOV', 'AGG', 'LQD', 'GHYG', 'EMB', 'CEMB',
];

const YIELD_COLS = ['IRX', 'FVX', 'TNX', 'TYX'];

const MIN_MONTHS = 240;

/**
 * Mapeo de proxies para imputar el prefijo NaN de ETFs lanzados después de
 * 2006-01. Decidido con el usuario (Head of Quant Research de Mercantil SFI)
 * el 2026-04-15. El proxy se copia mes a mes para el prefijo faltante.
 * Todos los proxies están completos en el histórico.
 *
 * Criterios:
 *   - Mismo bucket de asset class siempre que sea posible.
 *   - Para EM debt usamos LQD (IG credit) como mejor-disponible — imperfecto
 *     pero solo cubre 24 meses y el spec acepta la decisión.
 *   - Para SPTL (duración larga) usamos IEF (la treasury con historia más
 *     larga). Hay un gap de duration pero es la mejor aproximación.
 */
const NAN_PROXY_MAP = {
  BIL: 'SPTS', //   Cash / MM → short treasuries
  IEI: 'IEF', //    UST 3-7Y → UST 7-10Y
  SPTL: 'IEF', //   UST 10Y+ → UST 7-10Y
  GHYG: 'LQD', //   HY credit → IG credit
  EMB: 'LQD', //    EM sovereign → IG credit
  CEMB: 'LQD', //   EM corp → IG credit
  RXI: 'ACWI', //   Sector consumer disc → global equity
  EXI: 'ACWI', //   Sector industrials → global equity
  KXI: 'ACWI', //   Sector staples → global equity
  MXI: 'ACWI', //   Sector materials → global equity
  JXI: 'ACWI', //   Sector utilities → global equity
};

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function die(msg) {
  console.error(`[build-data] ✗ ${msg}`);
  process.exit(1);
}

function log(msg) {
  console.log(`[build-data] ${msg}`);
}

function parseCsv(path) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch (err) {
    die(`no pude leer ${path}: ${err.message}`);
  }
  // strip BOM si existe
  text = text.replace(/^\uFEFF/, '').trim();
  if (!text) die(`archivo vacío: ${path}`);
  const lines = text.split(/\r?\n/);
  const header = lines[0].split(',');
  const rows = lines.slice(1).map((line) => line.split(','));
  return { header, rows };
}

function toFloat(s) {
  if (s === undefined || s === null) return NaN;
  const trimmed = s.trim();
  if (trimmed === '') return NaN;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : NaN;
}

/**
 * Valida que el array de fechas YYYY-MM es estrictamente monotónico creciente
 * y sin huecos (cada fecha es exactamente +1 mes respecto a la anterior).
 */
function validateMonotonicMonths(dates, label) {
  for (let i = 0; i < dates.length; i++) {
    if (!/^\d{4}-\d{2}$/.test(dates[i])) {
      die(`${label}: fecha mal formada en índice ${i}: "${dates[i]}" (se esperaba YYYY-MM)`);
    }
  }
  for (let i = 1; i < dates.length; i++) {
    const [yA, mA] = dates[i - 1].split('-').map(Number);
    const [yB, mB] = dates[i].split('-').map(Number);
    const diff = (yB - yA) * 12 + (mB - mA);
    if (diff !== 1) {
      die(`${label}: fechas no consecutivas entre ${dates[i - 1]} y ${dates[i]} (diff=${diff})`);
    }
  }
}

/**
 * Serializa un Float32Array como expresión literal JS.
 * Usa toString() nativo (shortest round-trip representation).
 * NaN se serializa como "NaN" explícito.
 */
function float32ArrayLiteral(arr) {
  const parts = new Array(arr.length);
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    parts[i] = Number.isFinite(v) ? v.toString() : 'NaN';
  }
  return `new Float32Array([${parts.join(',')}])`;
}

// --------------------------------------------------------------------------
// 1) Retornos (fuente de la grilla maestra DATES)
// --------------------------------------------------------------------------

log(`leyendo retornos de ${resolve(DATA_DIR, 'mercantil_retornos_backfilled.csv')}`);
const retornosCsv = parseCsv(resolve(DATA_DIR, 'mercantil_retornos_backfilled.csv'));

if (retornosCsv.header[0] !== 'Fecha') {
  die(`retornos: primera columna es "${retornosCsv.header[0]}", se esperaba "Fecha"`);
}
const retornosTickers = retornosCsv.header.slice(1);
if (retornosTickers.length !== EXPECTED_TICKERS.length) {
  die(
    `retornos tiene ${retornosTickers.length} tickers, se esperaban ${EXPECTED_TICKERS.length}`,
  );
}
for (let i = 0; i < EXPECTED_TICKERS.length; i++) {
  if (retornosTickers[i] !== EXPECTED_TICKERS[i]) {
    die(
      `retornos: ticker en posición ${i} es "${retornosTickers[i]}", se esperaba "${EXPECTED_TICKERS[i]}"`,
    );
  }
}

const DATES = retornosCsv.rows.map((r) => r[0]);
if (DATES.length < MIN_MONTHS) {
  die(`retornos tiene ${DATES.length} meses, mínimo requerido ${MIN_MONTHS}`);
}
validateMonotonicMonths(DATES, 'retornos');

const nMonths = DATES.length;
const nTickers = EXPECTED_TICKERS.length;
const RETURNS = new Float32Array(nMonths * nTickers);
for (let i = 0; i < nMonths; i++) {
  const row = retornosCsv.rows[i];
  if (row.length !== 1 + nTickers) {
    die(`retornos fila ${i} (${DATES[i]}) tiene ${row.length} campos, se esperaban ${1 + nTickers}`);
  }
  for (let j = 0; j < nTickers; j++) {
    RETURNS[i * nTickers + j] = toFloat(row[j + 1]);
  }
}

// Sanidad: cada ticker debe tener al menos un retorno válido
for (let j = 0; j < nTickers; j++) {
  let hasValue = false;
  for (let i = 0; i < nMonths; i++) {
    if (Number.isFinite(RETURNS[i * nTickers + j])) {
      hasValue = true;
      break;
    }
  }
  if (!hasValue) {
    die(`retornos: ticker ${EXPECTED_TICKERS[j]} no tiene ningún valor finito`);
  }
}

log(`✓ retornos: ${nMonths} meses × ${nTickers} tickers (${DATES[0]} → ${DATES[nMonths - 1]})`);

// --------------------------------------------------------------------------
// 1b) Imputación de NaN en el prefijo histórico con proxies
// --------------------------------------------------------------------------

const tickerIdx = new Map();
EXPECTED_TICKERS.forEach((t, i) => tickerIdx.set(t, i));

/** Retorna el primer índice donde el ticker tiene un retorno finito, o -1 si nunca. */
function firstValidIdx(tickerJ) {
  for (let i = 0; i < nMonths; i++) {
    if (Number.isFinite(RETURNS[i * nTickers + tickerJ])) return i;
  }
  return -1;
}

const imputationReport = [];
for (const [target, proxy] of Object.entries(NAN_PROXY_MAP)) {
  const jTarget = tickerIdx.get(target);
  const jProxy = tickerIdx.get(proxy);
  if (jTarget === undefined) die(`imputación: ticker target "${target}" no existe en el universo`);
  if (jProxy === undefined) die(`imputación: ticker proxy "${proxy}" no existe en el universo`);

  const firstTarget = firstValidIdx(jTarget);
  if (firstTarget === -1) die(`imputación: target "${target}" no tiene ningún valor finito (nada que anclar)`);

  // Verifica que el proxy tenga dato en todo el prefijo que vamos a imputar
  for (let i = 0; i < firstTarget; i++) {
    if (!Number.isFinite(RETURNS[i * nTickers + jProxy])) {
      die(`imputación: proxy "${proxy}" tiene NaN en ${DATES[i]}, no puede cubrir prefijo de "${target}"`);
    }
  }

  // Copia el retorno del proxy al target para todo el prefijo
  let filled = 0;
  for (let i = 0; i < firstTarget; i++) {
    RETURNS[i * nTickers + jTarget] = RETURNS[i * nTickers + jProxy];
    filled++;
  }
  imputationReport.push({
    target,
    proxy,
    firstTargetDate: DATES[firstTarget],
    monthsFilled: filled,
  });
}

log(`✓ imputación con proxies aplicada:`);
for (const r of imputationReport) {
  log(`    ${r.target.padEnd(6)} ← ${r.proxy.padEnd(5)} (${r.monthsFilled} meses hasta ${r.firstTargetDate})`);
}

// Verificación final: ya no debe haber NaN en RETURNS para ningún ticker / mes
let nanCount = 0;
for (let i = 0; i < nMonths * nTickers; i++) {
  if (!Number.isFinite(RETURNS[i])) nanCount++;
}
if (nanCount > 0) {
  die(`post-imputación: RETURNS sigue con ${nanCount} NaN. Revisa NAN_PROXY_MAP — algún ticker no está cubierto.`);
}
log(`✓ RETURNS sin NaN (${nMonths * nTickers} celdas validadas)`);

// --------------------------------------------------------------------------
// 2) Yields
// --------------------------------------------------------------------------

log(`leyendo yields`);
const yieldsCsv = parseCsv(resolve(DATA_DIR, 'mercantil_yields_mensuales.csv'));

if (yieldsCsv.header[0] !== 'Fecha') {
  die(`yields: primera columna es "${yieldsCsv.header[0]}", se esperaba "Fecha"`);
}
for (let i = 0; i < YIELD_COLS.length; i++) {
  if (yieldsCsv.header[i + 1] !== YIELD_COLS[i]) {
    die(`yields: columna ${i + 1} es "${yieldsCsv.header[i + 1]}", se esperaba "${YIELD_COLS[i]}"`);
  }
}

// Mapeo fecha → fila
const yieldsByDate = new Map();
for (const row of yieldsCsv.rows) {
  yieldsByDate.set(row[0], row);
}

const YIELDS = {};
for (const c of YIELD_COLS) YIELDS[c] = new Float32Array(nMonths);

let yieldsAligned = 0;
for (let i = 0; i < nMonths; i++) {
  const row = yieldsByDate.get(DATES[i]);
  if (!row) {
    for (const c of YIELD_COLS) YIELDS[c][i] = NaN;
    continue;
  }
  YIELDS.IRX[i] = toFloat(row[1]);
  YIELDS.FVX[i] = toFloat(row[2]);
  YIELDS.TNX[i] = toFloat(row[3]);
  YIELDS.TYX[i] = toFloat(row[4]);
  yieldsAligned++;
}

if (yieldsAligned !== nMonths) {
  die(`yields: solo ${yieldsAligned}/${nMonths} meses alineados con DATES`);
}
// Verifica que cada columna está completa sobre DATES
for (const c of YIELD_COLS) {
  for (let i = 0; i < nMonths; i++) {
    if (!Number.isFinite(YIELDS[c][i])) {
      die(`yields: ${c} tiene NaN en ${DATES[i]} (se esperaba serie completa)`);
    }
  }
}

log(`✓ yields: ${yieldsAligned} meses × ${YIELD_COLS.length} columnas alineados a DATES`);

// --------------------------------------------------------------------------
// 3) RF decomposed
// --------------------------------------------------------------------------

log(`leyendo rf_decomposed`);
const rfCsv = parseCsv(resolve(DATA_DIR, 'mercantil_rf_decomposed.csv'));

if (rfCsv.header[0] !== 'Fecha') {
  die(`rf_decomposed: primera columna es "${rfCsv.header[0]}", se esperaba "Fecha"`);
}
// Header esperado: Fecha, {ticker}_carry, {ticker}_price, {ticker}_dy, {ticker}_total × RF_TICKERS
const rfExpectedCols = ['Fecha'];
for (const t of RF_TICKERS) {
  rfExpectedCols.push(`${t}_carry`, `${t}_price`, `${t}_dy`, `${t}_total`);
}
if (rfCsv.header.length !== rfExpectedCols.length) {
  die(
    `rf_decomposed tiene ${rfCsv.header.length} columnas, se esperaban ${rfExpectedCols.length}`,
  );
}
for (let i = 0; i < rfExpectedCols.length; i++) {
  if (rfCsv.header[i] !== rfExpectedCols[i]) {
    die(`rf_decomposed: columna ${i} es "${rfCsv.header[i]}", se esperaba "${rfExpectedCols[i]}"`);
  }
}

const rfByDate = new Map();
for (const row of rfCsv.rows) rfByDate.set(row[0], row);

const RF_DECOMP = {};
for (const t of RF_TICKERS) {
  RF_DECOMP[t] = {
    carry: new Float32Array(nMonths),
    price: new Float32Array(nMonths),
    delta_yield: new Float32Array(nMonths),
    total: new Float32Array(nMonths),
  };
}

for (let i = 0; i < nMonths; i++) {
  const row = rfByDate.get(DATES[i]);
  for (let k = 0; k < RF_TICKERS.length; k++) {
    const t = RF_TICKERS[k];
    if (!row) {
      RF_DECOMP[t].carry[i] = NaN;
      RF_DECOMP[t].price[i] = NaN;
      RF_DECOMP[t].delta_yield[i] = NaN;
      RF_DECOMP[t].total[i] = NaN;
    } else {
      const base = 1 + k * 4;
      RF_DECOMP[t].carry[i] = toFloat(row[base]);
      RF_DECOMP[t].price[i] = toFloat(row[base + 1]);
      RF_DECOMP[t].delta_yield[i] = toFloat(row[base + 2]);
      RF_DECOMP[t].total[i] = toFloat(row[base + 3]);
    }
  }
}

// Sanidad: cada ticker RF debe tener al menos un mes completo
for (const t of RF_TICKERS) {
  let hasComplete = false;
  for (let i = 0; i < nMonths; i++) {
    if (
      Number.isFinite(RF_DECOMP[t].total[i]) &&
      Number.isFinite(RF_DECOMP[t].carry[i])
    ) {
      hasComplete = true;
      break;
    }
  }
  if (!hasComplete) {
    die(`rf_decomposed: ticker ${t} no tiene ningún mes con total+carry finitos`);
  }
}

log(`✓ rf_decomposed: ${RF_TICKERS.length} tickers RF × 4 componentes alineados a DATES`);

// --------------------------------------------------------------------------
// 4) Emisión del TypeScript
// --------------------------------------------------------------------------

const tickersLiteral = JSON.stringify(EXPECTED_TICKERS);
const rfTickersLiteral = JSON.stringify(RF_TICKERS);
const datesLiteral = JSON.stringify(DATES);

const lines = [];
lines.push('/* eslint-disable */');
lines.push('// AUTO-GENERADO por scripts/build-data.mjs — NO EDITAR A MANO.');
lines.push('// Fuente: ../data/ (solo lectura).');
lines.push('// Regenerar con: `npm run build:data` (se corre también como prebuild).');
lines.push('');
lines.push(`export const N_MONTHS = ${nMonths} as const;`);
lines.push(`export const N_TICKERS = ${nTickers} as const;`);
lines.push('');
lines.push(`export const DATES: readonly string[] = ${datesLiteral};`);
lines.push('');
lines.push(`export const TICKERS = ${tickersLiteral} as const;`);
lines.push('export type Ticker = (typeof TICKERS)[number];');
lines.push('');
lines.push('/**');
lines.push(' * Retornos mensuales totales en formato flat row-major.');
lines.push(' * Acceso: RETURNS[monthIdx * N_TICKERS + tickerIdx].');
lines.push(' *');
lines.push(' * Imputación aplicada — el prefijo NaN de los ETFs lanzados después de');
lines.push(' * 2006-01 se llena con un proxy mes a mes (ver build-data.mjs NAN_PROXY_MAP):');
for (const r of imputationReport) {
  lines.push(`     *   - ${r.target.padEnd(5)} ← ${r.proxy.padEnd(5)} para los primeros ${r.monthsFilled} meses (hasta ${r.firstTargetDate})`);
}
lines.push(' *');
lines.push(' * Post-imputación: cero NaN en RETURNS.');
lines.push(' */');
lines.push(`export const RETURNS: Float32Array = ${float32ArrayLiteral(RETURNS)};`);
lines.push('');
lines.push('/** Niveles de yield (decimal) alineados a DATES. Sin NaN. */');
lines.push('export const YIELDS: Readonly<Record<"IRX" | "FVX" | "TNX" | "TYX", Float32Array>> = {');
for (const c of YIELD_COLS) {
  lines.push(`  ${c}: ${float32ArrayLiteral(YIELDS[c])},`);
}
lines.push('};');
lines.push('');
lines.push(`export const RF_TICKERS = ${rfTickersLiteral} as const;`);
lines.push('export type RfTicker = (typeof RF_TICKERS)[number];');
lines.push('');
lines.push('/**');
lines.push(' * Descomposición de retornos para los ETFs de renta fija, alineada a DATES.');
lines.push(' * - carry:       acumulación pasiva de yield (aprox constante por mes)');
lines.push(' * - price:       contribución total por cambio de precio (incluye duration + convexidad)');
lines.push(' * - delta_yield: componente aislada del cambio de yield aplicada vía duration·Δy + ½·conv·Δy²');
lines.push(' * - total:       retorno total realizado (= carry + price)');
lines.push(' * NaN en el primer mes (o donde no hay dato).');
lines.push(' */');
lines.push('export type RfSeries = {');
lines.push('  carry: Float32Array;');
lines.push('  price: Float32Array;');
lines.push('  delta_yield: Float32Array;');
lines.push('  total: Float32Array;');
lines.push('};');
lines.push('');
lines.push('export const RF_DECOMP: Readonly<Record<RfTicker, RfSeries>> = {');
for (const t of RF_TICKERS) {
  lines.push(`  ${t}: {`);
  lines.push(`    carry: ${float32ArrayLiteral(RF_DECOMP[t].carry)},`);
  lines.push(`    price: ${float32ArrayLiteral(RF_DECOMP[t].price)},`);
  lines.push(`    delta_yield: ${float32ArrayLiteral(RF_DECOMP[t].delta_yield)},`);
  lines.push(`    total: ${float32ArrayLiteral(RF_DECOMP[t].total)},`);
  lines.push('  },');
}
lines.push('};');
lines.push('');

const ts = lines.join('\n');

mkdirSync(dirname(OUT_FILE), { recursive: true });
writeFileSync(OUT_FILE, ts, 'utf8');

const sizeKb = (Buffer.byteLength(ts, 'utf8') / 1024).toFixed(1);
log(`✓ emitido ${OUT_FILE}`);
log(`  ${nMonths} meses × ${nTickers} tickers + ${RF_TICKERS.length} RF series (${sizeKb} KB)`);
