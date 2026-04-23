/**
 * XIRR cross-check vs Excel — §11 paso 5.
 *
 * Caso de prueba documentado:
 *   - Capital inicial: $100,000
 *   - Portafolio: 100% SPY (USA.Eq)
 *   - Aporte mensual: $1,000 (meses 1 al 120)
 *   - Horizonte: 120 meses (10 años)
 *   - Retornos: constantes 0.8%/mes (para que el resultado sea analíticamente verificable)
 *   - Seed: 42 (no relevante con retornos constantes)
 *
 * El script calcula los cashflows explícitos del cliente y la XIRR usando
 * el motor interno. Luego imprime los cashflows en formato CSV para que
 * el usuario los pegue en Excel y compare con =XIRR().
 *
 * Resultado esperado:
 *   XIRR anual = (1 + 0.008)^12 − 1 = 10.034% (exacto para retornos constantes)
 *   porque cuando los retornos son constantes, XIRR = TWR independientemente
 *   de los flujos.
 */

import { applyFlows } from '../src/domain/flows';
import { computeMetrics, type Window } from '../src/domain/metrics';
import type { FlowRule, PlanSpec } from '../src/domain/types';

// --- Caso de prueba ---
const MONTHLY_RETURN = 0.008; // 0.8% mensual
const INITIAL_CAPITAL = 100_000;
const MONTHLY_DEPOSIT = 1_000;
const HORIZON = 120;

const plan: PlanSpec = {
  initialCapital: INITIAL_CAPITAL,
  horizonMonths: HORIZON,
  mode: 'nominal',
  inflationPct: 0,
  rules: [
    {
      id: 'dep',
      label: 'Aporte mensual',
      sign: 'deposit',
      amount: MONTHLY_DEPOSIT,
      frequency: 'monthly',
      startMonth: 1,
      endMonth: HORIZON,
      growthPct: 0,
    },
  ],
};

// Retornos constantes (1 path)
const returns = new Float32Array(HORIZON);
returns.fill(MONTHLY_RETURN);

// --- Correr simulación ---
const sim = applyFlows({ plan, portfolioReturns: returns, nPaths: 1 });
const window: Window = { startMonth: 1, endMonth: HORIZON };

const metrics = computeMetrics({
  simulation: sim,
  portfolioReturns: returns,
  nPaths: 1,
  horizonMonths: HORIZON,
  window,
});

// --- Resultados ---
const twrExpected = Math.pow(1 + MONTHLY_RETURN, 12) - 1;
const twrActual = metrics.twrAnnualized.p50;
const xirrActual = metrics.xirrAnnualized.p50;
const finalValue = sim.values[HORIZON];

console.log('================================================================');
console.log(' XIRR Cross-Check vs Excel — §11 paso 5');
console.log('================================================================');
console.log('');
console.log('Caso de prueba:');
console.log(`  Capital inicial:  $${INITIAL_CAPITAL.toLocaleString()}`);
console.log(`  Aporte mensual:   $${MONTHLY_DEPOSIT.toLocaleString()}`);
console.log(`  Horizonte:        ${HORIZON} meses (${HORIZON / 12} años)`);
console.log(`  Retorno mensual:  ${(MONTHLY_RETURN * 100).toFixed(3)}% (constante)`);
console.log('');
console.log('Resultados del motor:');
console.log(`  TWR anualizado:   ${(twrActual * 100).toFixed(6)}%`);
console.log(`  TWR esperado:     ${(twrExpected * 100).toFixed(6)}%`);
console.log(`  TWR diff:         ${(Math.abs(twrActual - twrExpected) * 100).toFixed(9)}%`);
console.log('');
console.log(`  XIRR anualizado:  ${(xirrActual * 100).toFixed(6)}%`);
console.log(`  XIRR esperado:    ${(twrExpected * 100).toFixed(6)}% (= TWR cuando retornos son constantes)`);
console.log(`  XIRR diff vs TWR: ${(Math.abs(xirrActual - twrExpected) * 100).toFixed(6)}%`);
console.log('');
console.log(`  Valor final:      $${finalValue.toFixed(2)}`);
console.log(`  Ruina:            ${metrics.ruinProbability * 100}%`);
console.log(`  XIRR válidos:     ${metrics.nValidXirr} de 1`);
console.log('');

// --- Generar CSV para Excel ---
// Formato: Fecha (ficticia), Cashflow
// La fecha real no importa si los intervalos son regulares — Excel XIRR usa
// las fechas para ponderar. Usamos 1ero de cada mes desde 2020-01-01.
console.log('================================================================');
console.log(' CSV para pegar en Excel (columnas: Fecha, Cashflow)');
console.log(' Pegar en Excel → seleccionar las dos columnas → =XIRR(B:B, A:A)');
console.log('================================================================');
console.log('');
console.log('Fecha,Cashflow');

// t=0: inversión inicial (negativa desde perspectiva del inversor)
const startDate = new Date(2020, 0, 1);
console.log(`${fmtDate(startDate)},${-INITIAL_CAPITAL}`);

// t=1..120: aportes mensuales (negativos desde perspectiva del inversor)
for (let t = 1; t <= HORIZON; t++) {
  const d = new Date(2020, t, 1);
  console.log(`${fmtDate(d)},${-MONTHLY_DEPOSIT}`);
}

// t=120: valor final (positivo, como si liquidara)
// Ya sumado en el último mes, así que combinamos: deposit + final value
const lastDate = new Date(2020, HORIZON, 1);
// Restar el deposit ya contado y sumar el final value
// Ojo: el último cashflow ya incluye el deposit. Mejor separar:
// El cashflow del mes 120 es: -1000 (deposit) + finalValue (liquidación)
// Pero arriba ya imprimimos el deposit. Necesito ajustar:
// Elimino el último deposit y lo reemplazo por el neto.
// Rewind: ya imprimí 120 líneas de -1000. La última ya está. Mejor
// imprimir una línea EXTRA al final con el valor final.
console.log(`${fmtDate(lastDate)},${finalValue.toFixed(2)}`);
console.log('');
console.log('NOTA: La última línea del CSV duplica la fecha del mes 120.');
console.log('En Excel, el cashflow del último mes tiene dos entradas:');
console.log('  -1000 (aporte) y +finalValue (liquidación).');
console.log('Excel XIRR maneja múltiples cashflows en la misma fecha sin problema.');
console.log('');

// --- Verificación de 4 decimales ---
const matchesFourDecimals = Math.abs(xirrActual - twrExpected) < 0.00005;
console.log('================================================================');
console.log(` ${matchesFourDecimals ? '✓' : '✗'} XIRR coincide con valor esperado a 4 decimales`);
console.log(`   Motor:    ${(xirrActual * 100).toFixed(4)}%`);
console.log(`   Esperado: ${(twrExpected * 100).toFixed(4)}%`);
console.log(`   |diff|:   ${(Math.abs(xirrActual - twrExpected) * 1e6).toFixed(1)} × 10⁻⁶`);
console.log('================================================================');

process.exit(matchesFourDecimals ? 0 : 1);

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
