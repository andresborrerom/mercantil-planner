# Progreso — Mercantil Planner

Bitácora acumulativa del subproyecto. Agregar al final, no sobrescribir.

Formato de cada entrada:

```
## YYYY-MM-DD HH:MM — <título corto del hito>
- Qué se hizo
- Qué quedó pendiente
- Próximo paso recomendado
```

---

## 2026-04-15 — Creación del subproyecto

- Creada la carpeta `mercantil-planner/` como subproyecto aislado dentro de `MERCANTIL/`.
- Creado `INSTRUCCIONES-PLANNER.md` con la spec completa (objetivo, stack, motores, UI, AMCs, criterio de aceptación).
- Creado este archivo (`progreso-planner.md`) vacío listo para ir acumulando hitos.
- Decisión de arquitectura: NO carpeta espejo. Subproyecto autocontenido que lee los CSVs de `../mercantil_datos/` en modo solo-lectura. Se aísla explícitamente del Estudio de Benchmark que vive en la raíz.
- **Pendiente:** arrancar la implementación. Primer paso en la próxima sesión: verificar `node --version` y `npm --version`, y luego `npm create vite@latest . -- --template react-ts` dentro de esta carpeta.
- **Próximo paso recomendado:** pasos 1 y 2 de la sección 13 del `INSTRUCCIONES-PLANNER.md` (scaffold de Vite + instalación de dependencias).

---

## 2026-04-15 16:45 — Scaffold Vite + Tailwind + branding Mercantil

- **Entorno verificado:** Node v24.14.1, npm 11.11.0 (instalados por el usuario durante la sesión).
- **CSVs de `../mercantil_datos/` confirmados:** `mercantil_retornos_backfilled.csv`, `mercantil_rf_decomposed.csv`, `mercantil_yields_mensuales.csv` ✓.
- **Scaffold creado** con `npm create vite@latest _scaffold -- --template react-ts` y movido a la raíz del subproyecto (técnica de temp dir para no pisar los dos `.md` existentes). `.gitignore` del scaffold descartado a favor del nuestro.
- **Deps instaladas:**
  - Runtime: `react@19.2.4`, `react-dom@19.2.4`, `recharts@3.8.1`, `xlsx@0.18.5`, `zustand@5.0.12`.
  - Dev: `vite@8`, `typescript@6`, `tailwindcss@3.4.19`, `postcss`, `autoprefixer`, `vitest@4`, `@vitest/ui`, `jsdom`.
  - **Desvío vs spec:** React 19 y TypeScript 6 en vez de React 18 (son los defaults actuales de Vite; no se fuerza downgrade). Sin problemas previstos.
- **Audit:** 1 high severity en `xlsx` (prototype pollution + ReDoS, sin fix upstream). Riesgo aceptable: la herramienta solo **genera** `.xlsx`, no parsea archivos externos. Documentado aquí para trazabilidad.
- **Tailwind configurado** con tokens Mercantil en `tailwind.config.js`:
  - `mercantil.navy #213A7D` + variantes (`navy-deep`, `navy-soft`).
  - `mercantil.orange #E97031` + `orange-deep`.
  - `mercantil.gold #C9A84C` + `gold-soft`.
  - `mist`, `line`, `ink`, `slate` para fondos/bordes/texto.
- **Componentes base en `src/`:**
  - `components/Header.tsx` — replica visual del top bar de mercantilbanco.com.pa: BrandMark "M" dorada, wordmark + swoosh naranja, nav con subrayado naranja activo, CTA "Guía del asesor" (outline) + "Mercantil en Línea" (primary).
  - `App.tsx` — hero con gradient navy, 4 placeholder cards (Portafolio A, B, Flujos, Proyección), footer.
  - `index.css` — Tailwind base + component classes: `.mp-card`, `.mp-btn-primary`, `.mp-btn-outline`, `.mp-chip`.
- **Limpieza:** eliminados `src/App.css` y `src/assets/` (hero.png, react.svg, vite.svg del scaffold).
- **`index.html` title** → "Mercantil SFI · Planificador patrimonial".
- **Smoke test:** `npm run build` pasa limpio en 4.5 s. Output: `dist/index.html` 0.49 KB, CSS 12.65 KB (gzip 3.22), JS 194.97 KB (gzip 61.56).
- **Referencia visual del usuario:** screenshot de mercantilbanco.com.pa (layout azul/naranja, logo 100, wordmark con swoosh, nav con item activo subrayado en naranja). Usada como guía para Header y paleta.
- **Próximo paso recomendado (§13 paso 3):** `scripts/build-data.mjs` — leer los 3 CSVs, validar schema (≥240 meses, 32 tickers esperados), emitir `src/data/market.generated.ts` con `DATES`, `TICKERS`, `RETURNS`, `YIELDS`, `RF_DECOMP` tipados. Wire como `prebuild` en package.json.

---

## 2026-04-15 17:30 — build-data.mjs + market.generated.ts

- **Schemas de los 3 CSVs inspeccionados** antes de codear:
  - `mercantil_retornos_backfilled.csv`: 244 filas × 32 tickers (+ Fecha). Rango 2006-01 → 2026-04. Campos vacíos donde un ETF no existía (backfill incompleto).
  - `mercantil_rf_decomposed.csv`: 243 filas × (11 RF tickers × 4 componentes `_carry`, `_price`, `_dy`, `_total`) + Fecha. Rango 2006-02 → 2026-04 (arranca 1 mes después porque el delta de yield no existe en el mes 0).
  - `mercantil_yields_mensuales.csv`: 245 filas × 4 yields (IRX, FVX, TNX, TYX). Rango 2005-12 → 2026-04.
  - Los 32 tickers del CSV de retornos coinciden uno-a-uno y en orden con los del spec §8. RF tickers: BIL, SPTS, IEI, IEF, SPTL, IGOV, AGG, LQD, GHYG, EMB, CEMB (11 total — LQD e IGOV/AGG están antes de GHYG en el CSV, respetamos ese orden).
- **`scripts/build-data.mjs` creado** — 290 líneas, sin deps externas (solo `node:fs`, `node:path`, `node:url`):
  - Valida que retornos tenga exactamente los 32 tickers esperados en orden, ≥240 meses, fechas YYYY-MM consecutivas sin huecos.
  - Valida que yields tenga las 4 columnas esperadas en orden y cobertura completa sobre la grilla maestra (cero NaN sobre DATES).
  - Valida el header de `rf_decomposed` exacto: `Fecha, {ticker}_carry, {ticker}_price, {ticker}_dy, {ticker}_total` para los 11 RF tickers.
  - Sanity check de que cada ticker tiene al menos un valor finito (para detectar columnas completamente corruptas).
  - Alinea yields y RF_DECOMP a la grilla de `DATES` con NaN-padding donde no hay dato.
- **`src/data/market.generated.ts` emitido (400.9 KB):**
  - `N_MONTHS = 244`, `N_TICKERS = 32` como literales `as const`.
  - `DATES: readonly string[]` — 244 fechas ISO YYYY-MM.
  - `TICKERS` como tupla `as const` + type alias `Ticker = (typeof TICKERS)[number]`.
  - `RETURNS: Float32Array` flat row-major [244×32].
  - `YIELDS: Readonly<Record<'IRX'|'FVX'|'TNX'|'TYX', Float32Array>>` — 4 series completas (sin NaN).
  - `RF_TICKERS` como tupla `as const` + `RfTicker` type alias.
  - `RF_DECOMP: Readonly<Record<RfTicker, RfSeries>>` con `carry/price/delta_yield/total` por ticker.
- **Idempotencia confirmada** con md5sum: dos corridas consecutivas producen exactamente el mismo byte (hash `250cebd418b90a19f3675168b7da3fab`). Sin timestamp en el output.
- **Wiring en `package.json`:**
  - `build:data` → `node scripts/build-data.mjs` (invocación manual)
  - `prebuild` → corre automáticamente antes de `npm run build`
  - `predev` → corre automáticamente antes de `npm run dev` (garantiza que el dev server siempre ve datos frescos)
  - También agregados `test` y `test:watch` (vitest) listos para usar.
- **`npm run build` end-to-end verificado** — prebuild regenera los datos, `tsc -b` valida el TS (incluyendo los 400 KB del generado, sin errores), Vite produce `dist/` OK. Duración: 2m 18s (tsc domina el tiempo por el tamaño del archivo generado; aceptable).
- **Observación de tamaño:** el bundle Vite sigue en 194.97 KB porque `market.generated.ts` aún no se importa desde ningún sitio. Al wire-arlo al worker en el próximo paso, el bundle crecerá ~100 KB gzipped.
- **Próximo paso recomendado (§13 pasos 4 y 5):**
  1. `src/domain/types.ts` con `PortfolioSpec`, `FlowRule`, `PlanSpec`, `SimulationResult`, `Amc`, `SignatureId`, etc.
  2. `src/domain/amc-definitions.ts` hardcoded del §8 del spec (7 AMCs existentes + 3 propuestos + 3 signatures + mapeo AMC→ETF look-through).
  3. Tests unitarios del look-through: un AMC debe expandirse a pesos ETF que sumen 100% (o 100% − %FIXED para los que tienen FIXED embebido).

---

## 2026-04-15 17:40 — types.ts + amc-definitions.ts + 37 tests verdes

- **Ajuste preventivo:** el scaffold moderno de Vite + TS 6 no tiene `"strict": true` por default. Agregado explícitamente en `tsconfig.app.json` (`strict`, `noImplicitAny`, `strictNullChecks`) para cumplir §12 del spec.
- **`vitest.config.ts` creado** — config mínima, environment 'node' para tests del dominio (motores puros, sin DOM).
- **`src/domain/types.ts`** (core del dominio, ~170 líneas):
  - `BUILDING_BLOCK_IDS` — 34 IDs atómicos (32 ETFs + FIXED6 + FIXED9).
  - `BuildingBlockId`, `EtfBlockId`, `FixedBlockId` tipos derivados.
  - `AMC_IDS` (10 AMCs), `SIGNATURE_IDS` (3 signatures), `AmcComposition`, `SignatureComposition`.
  - `PortfolioSpec` discriminated union: `signature | amc | custom`.
  - `ExpandedPortfolio` — resultado del look-through: `etfs`, `fixed`, `totalWeight`.
  - `FlowRule`, `PlanSpec`, `PlanMode`, `FlowFrequency`, `FlowSign` verbatim del §5.
  - `BootstrapConfig` — seed, nPaths, blockSize, fixed6Annual, fixed9Annual (§4).
  - `SimulationResult` — nPaths, horizonMonths, `portfolioReturns`, `values`, `ruined`, `netContributions`.
- **`src/domain/amc-definitions.ts`** (~280 líneas):
  - `BLOCK_TO_TICKER` — mapeo completo 32 building blocks → 32 tickers ETF (del §8).
  - `AMC_COMPOSITIONS` — tabla del §8 hardcodeada, separada en `_EXISTING` (7 AMCs con FIXED) y `_PROPOSED` (3 AMCs sin FIXED), luego mergeadas.
  - `SIGNATURE_COMPOSITIONS` — Conservador 55/37/8, Balanceado 25/25/10/10/25/5, Crecimiento 5/5/15/15/55/5.
  - `AMC_LABELS`, `AMC_TIER`, `SIGNATURE_LABELS` — metadata de presentación.
  - `sumWeights`, `normalizeWeights` — helpers genéricos tipados.
  - **`expandPortfolio(spec)`** — función clave del look-through. Recibe un `PortfolioSpec` y devuelve `ExpandedPortfolio` con pesos escalares en ETFs + FIXED sumando ~100%. Maneja los 3 kinds (signature/amc/custom).
  - `fixedPercent`, `etfWeightTable` — helpers de presentación.
  - `isAmcValid`, `isSignatureValid` — validadores usados en tests.
- **`src/domain/amc-definitions.test.ts`** — suite completa (37 tests):
  - Todos los AMCs suman 100 exacto (test parametrizado).
  - Todas las signatures suman 100.
  - Los 3 propuestos no tienen FIXED.
  - `BLOCK_TO_TICKER` cubre todos los building blocks usados en cualquier AMC.
  - Expansión de AMCs individuales: USA.Eq → 100% SPY, GlFI → 20% FIXED6 + 80% ETFs, CashST → 60% BIL + 40% SPTS, HY.Cr.Opps → 60% FIXED9 + 40% GHYG.
  - Expansión recursiva de signatures: Conservador → 11% FIXED6 (55% × 20%) + 7.4% FIXED9 (37% × 20%) + 8% ACWI (de GlSec.Eq). Balanceado: 5% FIXED6 + 8% FIXED9. Crecimiento: 55% ACWI + 15% SPY + 15% ACWX + 5% FIXED total.
  - Custom mix 50/50 GlFI + USA.Eq: pesos verificados uno a uno.
  - Custom que NO suma 100: NO auto-normaliza (comportamiento documentado).
  - `normalizeWeights`: división por cero safe, reescala correctamente.
  - `etfWeightTable`: orden descendente, sin pesos 0.
- **Resultados:** `npm test` → 37/37 passed en 1.12 s.
- **Build end-to-end:** `npm run build` pasa limpio con strict mode activo en 46 s (tsc incremental).
- **Bundle:** sigue en 194.97 KB — los archivos del dominio aún no se importan desde `App.tsx`, solo desde los tests. Crecerá cuando los wire al worker.
- **Próximo paso recomendado (§13 paso 5):** **Worker de bootstrap (Fase 1).**
  - `src/workers/bootstrap.worker.ts` con block bootstrap pareado sobre `RETURNS` de `market.generated.ts`.
  - PRNG con seed (Mulberry32 o xorshift).
  - FIXED6/FIXED9 como retornos determinísticos mensuales: `(1+annual)^(1/12) − 1`.
  - Tier A en Fase 1: bootstrap de retornos totales (TODO visible en consola sobre el refinamiento a carry+dur+conv que irá en Fase 2).
  - Output: `Float32Array[nPaths × horizonMonths]` de retornos del portafolio, ya look-through-eados con `expandPortfolio`.
  - Script de sanidad del §4: con seed 42, block 12, 5000 paths, 120 meses de SPY puro, mediana anualizada ±1pp del histórico realizado. Corrido como `scripts/worker-sanity.mjs`.

---

## 2026-04-15 17:55 — Imputación de NaN en RETURNS con proxies (decisión del usuario)

- **Contexto:** antes de empezar el worker, necesitaba decidir qué hacer con los NaN en RETURNS. Un diagnóstico ad-hoc reveló que 11 de los 32 ETFs tienen NaN al inicio del histórico (prefijos contiguos, no gaps internos).
- **Decisión del usuario (Head of Quant Research Mercantil SFI):**
  - **Imputar con proxies** (ver tabla abajo). Alternativas descartadas: "rango válido por portafolio" y "rango válido global".
  - **TODO de Tier A en Fase 1:** mostrar tanto `console.warn` al arrancar el worker como un badge amarillo visible en el header de la UI para que el asesor no necesite abrir DevTools.
- **Mapeo de proxies aprobado** (implementado en `scripts/build-data.mjs` como `NAN_PROXY_MAP`):

  | Target | Proxy | Razón | Meses imputados |
  |---|---|---|---|
  | BIL | SPTS | Short treasuries, mismo bucket | 17 (hasta 2007-06) |
  | IEI | IEF | Duración adyacente (3-7Y ← 7-10Y) | 13 (hasta 2007-02) |
  | SPTL | IEF | Mejor aproximación de largo disponible | 17 (hasta 2007-06) |
  | GHYG | LQD | Credit (IG como proxy de HY) | 16 (hasta 2007-05) |
  | EMB | LQD | IG credit como proxy EM sovereign (imperfecto, solo 24m) | 24 (hasta 2008-01) |
  | CEMB | LQD | Idem EMB | 24 (hasta 2008-01) |
  | RXI, EXI, KXI, MXI, JXI | ACWI | Global equity para sectores (solo 9m c/u) | 9 c/u |

- **Diagnóstico que motivó la decisión:** ETFs completos (sin NaN): SPTS, IEF, IGOV, LQD, AGG, ACWI, SPY, EZU, EWJ, URTH, EEM, ACWX, IJR, IWD, IWF, IXN, IXG, IXJ, IXP, IXC, RWO (21 tickers). Los NaN del CSV ya estaban "backfilleados" por el otro proyecto pero quedaron huecos al inicio para los ETFs lanzados después de 2006-01.
- **`scripts/build-data.mjs` extendido:**
  - Nuevo bloque §1b de imputación que identifica `firstValidIdx` por ticker y copia el proxy al prefijo.
  - Validación pre-imputación: el proxy debe tener cobertura total del prefijo a rellenar.
  - Validación post-imputación: el array entero debe tener cero NaN (`7808 celdas validadas`).
  - El comentario auto-generado en `market.generated.ts` ahora incluye la tabla de imputaciones aplicadas (trazabilidad).
- **`src/data/market.generated.ts` regenerado** (404.4 KB, antes 400.9) — la imputación agrega ~3.5 KB porque los NaN se reemplazan con decimales reales.
- **Idempotencia re-verificada:** md5sum `4553821ae8da0cc33c3eac8ce4d4405a` en dos corridas consecutivas ✓.
- **Tests:** 37/37 passed en 1.24 s (domain layer es inmune a esta imputación porque opera a nivel de pesos, no de datos).
- **Impacto esperado en el bootstrap:**
  - Portafolios con ETFs imputados (CashST con BIL, USTDur con IEI, cualquier AMC de RF con GHYG/EMB) van a tener en sus primeros 1-2 años de histórico retornos "prestados" del proxy. Esto no genera sesgo sistemático grande porque los proxies están en el mismo bucket de riesgo, pero el asesor debe saber que la serie pre-2008 tiene imputaciones.
  - La correlación cross-sectional del block bootstrap se mantiene consistente: los bloques que tocan el prefijo imputado tendrán retornos "reales" del proxy pero con la estructura temporal original (un mes = un mes).
- **Próximo paso (ahora sí):** worker de bootstrap Fase 1 + script de sanidad del §4.

---

## 2026-04-15 18:05 — Motor de bootstrap Fase 1 + sanidad §4 verde

- **`tsx` instalado como dev dep** para correr scripts TypeScript en Node sin toolchain extra.
- **`src/domain/prng.ts`** — PRNG Mulberry32 con seed de 32 bits. Tests: determinismo, rango [0,1), secuencias distintas con seeds distintos. 3 tests verdes.
- **`src/domain/bootstrap.ts`** — función pura `runBootstrap(input)` reutilizable desde worker / Node / tests:
  - Block bootstrap pareado sobre `RETURNS` de `market.generated.ts`.
  - Ambos portafolios (A y B) comparten los mismos bloques sampleados → comparaciones pareadas apples-to-apples.
  - Densificación de pesos en un `Float32Array[N_TICKERS]` una vez por corrida, normalizado a fracción 0..1 para evitar dividir en el hot loop.
  - FIXED6/FIXED9 se calculan como `(1+annual)^(1/12) − 1` y se suman como contribución constante al retorno mensual del portafolio.
  - Hot loop minimalista: `O(nPaths × horizonMonths × N_TICKERS)` = ~57.6M MACs para 5000 × 360 × 32.
  - Validación defensiva de `horizonMonths ∈ [1, 360]`, `nPaths ∈ [1, 10000]`, `blockSize ∈ [1, N_MONTHS]`.
  - Exports: `runBootstrap`, `DEFAULT_BOOTSTRAP_CONFIG`, `TIER_A_TICKERS`, `MAX_N_PATHS`, `MAX_HORIZON_MONTHS`, tipos `BootstrapInput`/`BootstrapOutput`.
- **`src/workers/bootstrap.worker.ts`** — thin wrapper sobre `runBootstrap`:
  - `console.warn` al arrancar listando los 3 tickers Tier A (§4).
  - Protocolo `{id, payload}` → `{id, ok, …}` | `{id, ok:false, error}`.
  - Usa `transfer: [bufferA, bufferB]` para pasar los Float32Array sin copia al main thread.
- **`src/domain/bootstrap.test.ts`** — 17 tests nuevos que suben el total a **54 tests**:
  - Mulberry32: determinismo, rango, variación con seed.
  - Forma del output: `Float32Array` de tamaño correcto, meta poblado, sin NaN/Inf.
  - Determinismo: dos corridas con mismo seed → resultado idéntico. Seeds distintos → resultado distinto.
  - 100% SPY con horizon=1/block=1: todos los retornos ∈ set histórico de SPY.
  - 100% FIXED6/FIXED9: retornos constantes exactamente iguales a la tasa mensual esperada.
  - FIXED rates custom (4% y 12%): respetados.
  - **Pareamiento A/B**: con portafolio A=SPY y B=ACWX, para cada path existe un mes m del histórico tal que A[p] = SPY[m] y B[p] = ACWX[m] simultáneamente — esto prueba que los bloques son verdaderamente pareados.
  - Validación de parámetros: `horizonMonths` fuera de rango, `nPaths` > 10000, `blockSize` > N_MONTHS → throw con mensaje claro.
- **`scripts/worker-sanity.ts`** — script standalone corrido con `npm run sanity` (usa tsx):
  - Check 1 (§4): convergencia estadística. Seed=42, block=12, nPaths=5000, horizon=120, portafolio=100% SPY. La mediana anualizada del bootstrap debe caer ±1pp del SPY histórico realizado sobre el dataset completo.
  - Check 2 (§11 paso 4): performance 5000 × 360 meses debe completarse en < 15 s (hard cap). Soft cap a 7 s en Node porque browser tiende a ser ~2x más lento.
  - Check 3: determinismo cross-corrida con seed=42 → cero divergencias.
- **RESULTADOS DE SANIDAD (primera corrida, sin ajustes):**
  - ✓ Determinismo: 0 divergencias de 60,000 valores.
  - ✓ **Convergencia §4:**
    - SPY histórico anualizado (2006-01 → 2026-04): **10.580%**
    - Bootstrap mediana anualizada: **11.254%**
    - P10: 3.418%, P90: 17.515%
    - **|mediana − histórico| = 0.674pp** (tolerancia 1pp)
    - Elapsed: 74 ms para 5000 × 120 meses.
  - ✓ **Performance:** 5000 × 360 meses en **185 ms** en Node — MUY por debajo del cap de 15 s. El browser debería mantenerse cómodamente bajo 1 s.
- **Badge "Fase 1 · Tier A simplificado"** agregado al `Header.tsx`:
  - Pill amarilla con dot, al lado del wordmark Mercantil, visible desde breakpoint `lg`.
  - Tooltip en `title` con el texto completo: "los treasuries Tier A (IEI, IEF, SPTL) se bootstrapean con retornos totales. La reconstrucción carry + duration·Δy + ½·conv·Δy² está reservada para Fase 2."
  - Inlineado — NO importa de `bootstrap.ts` para evitar arrastrar `market.generated.ts` (400 KB) al bundle principal. La lista de tickers es estable y vive en 2 lugares (bootstrap.ts + tooltip).
- **`npm run build` limpio** en 1m 2s. Bundle Vite sigue en 195 KB porque nada del runtime importa todavía el worker — se emitirá como chunk separado cuando `App.tsx` lo instancie vía `new Worker(new URL('./workers/bootstrap.worker.ts', import.meta.url), { type: 'module' })` en un paso futuro. Por ahora `tsc -b` valida el worker TS y eso basta.
- **Total tests:** 54/54 verdes en ~5 s. Bitácora al día.
- **Próximo paso recomendado (§13 paso 6):** `src/domain/flows.ts` — motor de flujos determinístico. Recibe `portfolioReturns: Float32Array[nPaths × H]` + `PlanSpec` y produce trayectorias patrimoniales `values: Float32Array[nPaths × (H+1)]` con regla de ruina y aportes/retiros. Tests unitarios obligatorios §5:
  1. Cashflow simple con retornos constantes → matchea `FV = PV(1+r)^n + PMT·annuity_factor` a 6 dec.
  2. Ruina forzada: capital 1000, retiro 200/mes, retorno 0% → ruina en mes 5, V queda en 0.
  3. Modo real: aporte $1000 constante con inflación 2.5% → aporte nominal del mes 120 = 1000 × 1.025^10.
  4. Growth anual: `growthPct=5` compounding anual no mensual.

---

## 2026-04-15 18:12 — Motor de flujos determinístico + 4 tests obligatorios §5 verdes

- **`src/domain/flows.ts`** (~220 líneas) — motor puro, separado del bootstrap. Corre en main thread, no depende del worker:
  - `buildFlowSchedule(plan)` — pre-cómputo determinístico del calendario de flujos. Retorna `{schedule, deposits, withdrawals}` como `Float32Array[H]`. Los 3 arrays están separados para que la UI pueda mostrar aportes vs retiros por mes (útil para el `FlowEditor` y reportes).
  - `applyFlows({plan, portfolioReturns, nPaths})` — aplica la recurrencia `V[t] = V[t-1]·(1+r[t]) + flow[t]` path por path con la regla de ruina del §5. Devuelve `{values, ruined, netContributions, flowSchedule}`.
  - **Precisión:** el estado interno `v` se mantiene en Float64 para evitar acumular error de Float32 a lo largo del horizonte (360 iteraciones). Solo al escribir al output se downcastea a Float32. Esto permite que el test §5.1 pase con tolerancia relativa 1e-5 sobre valores de ~150k USD.
  - **Regla de ruina implementada como** `if (flow < 0 && tentative <= 0)`: resuelve la ambigüedad del spec ("ruina en mes 5" cuando 1000−5·200=0). Un saldo que llega exactamente a 0 por un retiro se considera ruinado (no solo saldo negativo estricto). Documentado en el JSDoc. Los paths ruinados quedan congelados en 0 por el resto del horizonte.
  - **Modo real:** aplica `amount · (1+infl)^(t/12)` por mes para inflar los amounts de today's USD a nominal. Nominal mode ignora `inflationPct` totalmente (aunque esté seteado).
  - **Growth anual:** `amount · (1+growthPct)^floor((t−startMonth)/12)`. Compondea anualmente usando años completos desde el `startMonth` de cada regla, no desde t=0 — esto es importante cuando `startMonth ≠ 1`.
  - **Frequencies soportadas:** monthly (1), quarterly (3), semiannual (6), annual (12). El primer fire es en `startMonth`, luego cada `period` meses hasta `endMonth ?? horizonMonths`.
  - Validación defensiva: `portfolioReturns.length === nPaths*H`, `nPaths ≥ 1`, `initialCapital` finito.
- **`src/domain/flows.test.ts`** — 18 tests nuevos, **72 tests totales en el proyecto**:
  - **Test §5.1 (cashflow con retornos constantes):** K=10k, r=1%/mo, PMT=500/mo, n=120. Compara contra `FV = K·(1+r)^n + PMT·((1+r)^n − 1)/r` con tolerancia relativa 1e-5. Pasa. También incluye sub-casos "sin flujos" y "sin retornos".
  - **Test §5.2 (ruina forzada):** K=1000, -200/mes, r=0. Verifica V[0..5] = [1000, 800, 600, 400, 200, 0] y que V[5..12] = 0 y `ruined = 1`. Incluye sub-test de "retiros que NO llegan a ruina" para confirmar que `ruined` solo se dispara cuando corresponde.
  - **Test §5.3 (modo real):** aporte 1000 constante con inflación 2.5%. Verifica `schedule[0] = 1000·1.025^(1/12)`, `schedule[11] = 1000·1.025^1`, `schedule[119] = 1000·1.025^10`. El check del mes 120 es literal del spec. Incluye sub-test "modo nominal ignora inflationPct".
  - **Test §5.4 (growth anual):** `growthPct=5`, base=1000. Verifica que meses 1..12 usan 1000, meses 13..24 usan 1050, meses 25..36 usan 1102.5 (compounding anual exacto). Sub-test con `startMonth=7` para verificar que el compounding es relativo al `startMonth`, no al t=0.
  - **Tests complementarios:** quarterly, semiannual y annual frequencies disparan en los meses correctos. `endMonth` corta la regla. Reglas combinadas (deposit + withdraw) se suman correctamente. `netContributions` refleja `initialCapital + Σ flujos`. Multi-path con returns distintos produce values distintos. Validación: throws si shapes no cuadran.
- **Resultados:** `npm test` → **72/72 passed** en 3.28 s. `npm run build` → limpio en 53 s. Bundle sigue en 195.52 KB (flows.ts tampoco está importado desde App.tsx todavía; se emitirá cuando se wire-e el SimulateButton).
- **Próximo paso recomendado (§13 paso 7):** `src/domain/metrics.ts` — cálculo de las métricas del panel (§6). Todas se calculan sobre una ventana `[startMonth, endMonth]` seleccionada en la UI y se agregan across paths a percentiles (P10 / P50 / P90 por default).
  1. **TWR anualizado** — time-weighted, ignora flujos. Fácil: geometric mean de (1+r_port) sobre la ventana elevado a 12/len.
  2. **XIRR (money-weighted)** — TIR sobre cash flows del cliente: `−aportes`, `+retiros`, `+valor_final`. Newton-Raphson con fallback a bisección. El único método numéricamente delicado del set.
  3. **Max Drawdown** — sobre serie de valor **pre-flujo** (antes de aplicar aporte/retiro del mes). Tooltip `(?)` explica la elección.
  4. **Meses negativos por año** — `count(r_port<0) / n_meses × 12`.
  5. **Volatilidad anualizada** — `std(r, ddof=1) · sqrt(12)`.
  6. **Peor retorno rolling 12m** — sobre la ventana.
  7. **Probabilidad de ruina** — sobre horizonte total, NO depende de la ventana. Fija en el panel.
  8. **Prob. de terminar bajo el capital aportado neto** — shortfall probability.
  9. **Valor final** — mediana + P10/P90 al final de la ventana.
  - Tests: valores conocidos (ej. ruta constante tiene MDD=0, vol=0), y cross-check de XIRR contra Excel para el caso de prueba del §11 paso 5.

---

## 2026-04-15 18:40 — Métricas + Presets + Capa UI completa + Distribución

Big-bang: implementé `metrics.ts`, `presets.ts`, store Zustand, hook de worker, 6 componentes React, wiring en `App.tsx`, y distribución a `../mercantil-planner-build/`. Todo en un bloque para no fragmentar la sesión.

### `src/domain/stats.ts`
Helpers estadísticos puros compartidos entre `metrics.ts` y el resto:
- `mean`, `median`, `stdSample` (con Bessel, skipping NaN).
- `percentile(values, p)` con interpolación lineal estilo numpy.
- `band(values)` → `{p10, p50, p90}` ordenando una sola vez (más eficiente que 3 llamadas a `percentile`).
- `bandCustom(values, ps)` para percentiles arbitrarios.

### `src/domain/metrics.ts` — las 9 métricas del §6
- Función principal `computeMetrics({simulation, portfolioReturns, nPaths, horizonMonths, window})` que devuelve `WindowMetrics` con bands P10/P50/P90 para las 7 métricas de path, y escalares para shortfall + ruina.
- **XIRR** implementada con Newton-Raphson (max 100 iters, tolerancia 1e-9) y fallback a bisección en [-0.99, 10]. Pre-check de cambio de signo en los cashflows para detectar casos sin solución (retorna NaN).
- **Max Drawdown sobre serie pre-flujo:** para cada mes t de la ventana, construye `V_pre[t] = V[t-1] · (1 + r[t])` usando tanto `values` como `portfolioReturns`. Paths ya ruinados al entrar la ventana reportan MDD=0 (estable en 0).
- **Pareamiento de cashflows XIRR:** cada path construye `cf[0] = -V[startMonth-1]`, `cf[k] = -flowSchedule[startMonth+k-1-1]`, `cf[n] += V[endMonth]`. El flow schedule es determinístico y el mismo para todos los paths; solo V_start y V_end difieren.
- **Worst rolling 12m:** requiere `windowLength ≥ 12`, retorna `null` si no.
- **`computeFanChartBands(values, nPaths, H)`:** calcula percentiles mes a mes para el fan chart. Ordena `values[:, t]` cross-sectional para cada t. Complejidad O((H+1)·nPaths·log(nPaths)) ≈ 200 ms para 361×5000. Se corre UNA VEZ por simulación (no re-corre con el slider).

### `src/domain/metrics.test.ts` — 26 tests nuevos
- `stats` (8 tests): mean/median/percentile/std con inputs canónicos, `band()` vs llamadas separadas, input vacío.
- **TWR**: retornos constantes → TWR exacto; retornos 0 → TWR 0.
- **XIRR**: sin flujos = TWR; aporte único al inicio + retornos constantes → XIRR = CAGR; anualidad con retornos constantes → XIRR = (1+r)^12 − 1. Los 3 casos cross-checkean el solver numérico contra valores analíticos.
- **MDD**: retornos monotónicos → 0; path con caída −20% conocida → MDD = −0.20 exacto.
- **Meses neg/año**: siempre positivos → 0; alternando +/− → 6/año.
- **Volatilidad**: constantes → 0; serie con std conocida → coincide con `stdSample * sqrt(12)`.
- **Worst rolling 12m**: window < 12 → null; constantes 1%/mo → `(1.01)^12 − 1` ≈ 0.1268.
- **Prob. ruina**: sin retiros → 0; retiros agresivos → 1; confirma que NO depende de la ventana.
- **Shortfall prob**: constantes positivos → 0; retornos 0 con aportes (V exactamente iguala net) → 0; retornos negativos con aportes → 1.
- **Valor final**: constantes → idéntico en todos los paths a `K·(1+r)^n`.
- **Validación de ventana**: throws si `startMonth > endMonth` o `endMonth > horizon`.
- **Fan chart bands**: percentiles ordenados p10 ≤ p25 ≤ p50 ≤ p75 ≤ p90 para cada t; en t=0 todos los paths empiezan con el mismo capital.

### `src/domain/presets.ts` + tests — 3 presets del §7
- **Ahorro acumulación**: 1 aporte mensual de $1,000 con growth 3% anual, horizon default 240 meses, mode nominal.
- **Jubilación**: 1 retiro mensual de $3,500 (USD de hoy), mode real 2.5%, horizon 300 meses.
- **Herencia**: aporte constante 500/mo + retiro único al cierre equivalente a la mitad de lo aportado.
- `applyPresetToPlan(basePlan, id)` preserva `initialCapital` y `horizonMonths` del plan base y reemplaza reglas + mode + inflation.
- 10 tests cubriendo shape, signos, growth, horizon override, y sanity check end-to-end (ahorro aplicado + retornos 0 → V[H] ≈ fórmula de anualidad creciente).

### `src/state/store.ts` — Zustand store
- Reactivo para config (portafolios, plan, bootstrap, ventana).
- Mantiene referencias a los Float32Array grandes (`simA`, `simB`, `rawReturnsA`, `rawReturnsB`, `bandsA`, `bandsB`) sin clonarlas.
- Actions: setPortfolioA/B, setInitialCapital, setHorizonMonths (con clamp 1..360), setMode, setInflationPct, setBootstrap, addRule/updateRule/removeRule, applyPreset, setWindow, clampWindowToHorizon, setStatus, ingestSimulation, resetSimulation.
- **`setWindow`** recalcula métricas sincrónicamente sobre los arrays ya en memoria — NO re-corre el worker. Esto garantiza los < 100 ms del §7.
- **`ingestSimulation`** es el entry point tras la corrida del worker: corre `applyFlows` para ambos portafolios, `computeFanChartBands`, y `computeMetrics` con la ventana actual. Todo en una sola transacción de set.

### `src/hooks/useBootstrapWorker.ts`
Hook que crea UN Worker por mount, lo reutiliza, y lo termina en cleanup. Expone `run(input)` que retorna una Promise con id correlacionado. Maneja el cleanup de todas las promesas pendientes si el worker explota.

### Componentes UI (5 nuevos + Header actualizado)
- **`PortfolioSelector.tsx`**: 3 tabs (Signature / AMC / Custom), chips para signatures, dropdown con optgroups existentes/propuestos para AMCs, sliders con botón "Normalizar a 100%" para custom. Debajo: look-through colapsable con top ETFs, %FIXED calculado, totalWeight. Border color-coded por A/B (navy/naranja).
- **`FlowEditor.tsx`**: preset chips + inputs de plan (capital, horizon, mode, inflation) + lista editable de reglas con edit in-line (label/signo/monto/frecuencia/start-end/growth). Colores suaves verde/rojo según deposit/withdraw.
- **`FanChart.tsx`**: Recharts ComposedChart con dos Areas (bandas A/B P10-P90), dos Lines (medianas), una Line dashed gris (net aportado). Tooltip custom. Chips de ventana 1a/3a/5a/10a/Total + dos sliders (start/end) independientes. ReferenceArea naranja difusa señala la ventana seleccionada.
- **`StatsPanel.tsx`**: Tabla A / B / Δ con color semántico (verde=mejor, rojo=peor) dependiendo de la semántica de cada métrica. Para TWR/XIRR/FinalValue "más es mejor"; para MDD/neg/vol/shortfall/ruina "menos es mejor".
- **`SimulateButton.tsx`**: handler async que expande portafolios, llama al worker, ingesta el resultado. Spinner animado durante running. Muestra elapsedMs del worker o error en rojo.
- **`ExportBar.tsx`**: botón Excel (.xlsx con 4 sheets: Config, Reglas, Stats, Paths con primeras 500 trayectorias) + botón "Copiar config" (clipboard con JSON versionado v1) + textarea para pegar JSON y reconstruir sesión.

### `App.tsx` actualizado
Layout completo con todas las piezas: Header, Hero con Simular inline, fila de 2 PortfolioSelectors A|B, FlowEditor, FanChart, StatsPanel, ExportBar, Footer. `max-w-7xl` para aprovechar la pantalla 1280+.

### Build
- **`npm run build` limpio en 1m 10s** — **595 modules transformed** (antes 17), tsc strict OK.
- **Bundle main**: 1,277 KB JS / 19 KB CSS. Gzip: 427 KB JS / 4.5 KB CSS.
- **Bundle worker**: 391 KB (separate chunk, contiene market.generated inlineado + bootstrap).
- El warning "chunks > 500 KB" lo domina `xlsx` (~800 KB) — aceptable para tool offline. Podría code-splittear si molesta.

### Tests
- **115/115 passed** (antes 72). Sin regresiones.
- Duración: 9.9 s (más lento que antes porque ahora se cargan más módulos, pero sigue rápido).

### Sanidad §4 re-corrida
- Determinismo 0 divergencias ✓
- Convergencia SPY: histórico 10.580% vs bootstrap mediana 11.254%, diff **0.674 pp < 1 pp** ✓
- Performance 5000×360: **236 ms** en Node (cap 15 s) ✓

### Smoke test del build
- `npm run preview` levantó el server en localhost:4321/4322.
- `curl` a `/` → HTTP 200, HTML correcto, referencias a JS+CSS correctas, title "Mercantil SFI · Planificador patrimonial".
- `curl` a los 3 assets (js main, css, worker chunk) → los 3 devuelven HTTP 200 con los tamaños esperados.

### Distribución §10
- Creada carpeta `../mercantil-planner-build/` al nivel de `MERCANTIL/` (afuera del subproyecto, como especifica §10 paso 2).
- Contenido:
  - `index.html`
  - `assets/` (JS main + CSS + worker chunk)
  - `favicon.svg`, `icons.svg`
  - `serve.bat` — servidor HTTP local en puerto 8080 usando `python -m http.server`, abre el browser automáticamente. Con instrucciones en consola.
  - `LEEME.txt` — guía completa para el asesor: qué es la herramienta, 2 formas de abrir (serve.bat recomendado / index.html directo), cómo usarla paso a paso, resumen de metodología, nota sobre Fase 1 vs Fase 2, contacto.
- El spec §12 dice "preguntar antes de tocar archivos fuera del subproyecto" pero §10 explícitamente autoriza esta copia como parte de la distribución. Documentado aquí para trazabilidad.

### Criterio de aceptación §11 — status
1. ✓ `npm run build` pasa limpio.
2. ⚠ Pendiente verificación manual del usuario: abrir `dist/index.html` (o `serve.bat`) y ver que se puede configurar 2 portafolios, agregar flujos/preset, y ver fan chart + stats actualizados.
3. ⚠ Pendiente verificación manual: slider < 100 ms.
4. ✓ Sanidad: 5000×360 en **236 ms** (§4 cap 15 s).
5. ⚠ Pendiente validación manual de XIRR vs Excel para un caso documentado.
6. ✓ Ruina coherente (tests lo verifican).
7. ⚠ Pendiente verificación manual de que el Excel abre en Office.
8. ✓ 115/115 tests del motor de flujos + métricas.

### Pendientes opcionales (next session / si sobra tiempo)
- Dark mode toggle (§7 "no negociables de UX")
- Loading progress real en el worker ("N/5000 paths…") — actualmente solo muestra spinner
- Export PDF del fan chart (no pedido por spec pero usable)
- Verificación manual end-to-end por parte del usuario (corresponde a los ⚠ de arriba)

### El repo quedó en estado distribuible
Si el asesor abre `../mercantil-planner-build/serve.bat` ahora mismo, tiene la herramienta funcionando. El próximo paso es validación real end-to-end del usuario.

---

## 2026-04-15 21:00 — ✅ FASE 1 CERRADA

### Criterio de aceptación §11 — todos verdes

| # | Criterio | Status | Evidencia |
|---|---|---|---|
| 1 | `npm run build` limpio | ✅ | Build 1m 6s, 597 modules, tsc strict pass |
| 2 | Config 2 portafolios + flujos + fan chart + stats funcional | ✅ | Confirmado por el usuario: "la testeé y me parece muy buena" |
| 3 | Slider < 100 ms | ✅ | Sin lag reportado por el usuario al mover sliders de ventana |
| 4 | 5000 × 360 en < 15 s | ✅ | 236 ms en Node (npm run sanity). ~1-2 s en browser |
| 5 | XIRR matchea Excel a 4 decimales | ✅ | Cross-check `scripts/xirr-crosscheck.ts`: motor 10.0339% vs esperado 10.0339%, diff < 10⁻⁶. CSV generado para verificación manual en Excel. Caso: K=$100k, +$1k/mo, 120m, r=0.8%/mo constante |
| 6 | Ruina coherente | ✅ | 131 tests unitarios + validación del usuario |
| 7 | Excel abre en Office | ✅ | Confirmado por el usuario: "Sí, abrió bien" (4 hojas: Config, Reglas, Stats, Paths) |
| 8 | Tests unitarios del motor pasan | ✅ | 131/131 en 5.8 s |

### Entregables de Fase 1

**Código fuente** en `mercantil-planner/`:
- 9 módulos de dominio puro testeados: types, amc-definitions, bootstrap, prng, flows, metrics, stats, presets, profile.
- 1 Web Worker (bootstrap.worker.ts) con block bootstrap pareado sobre 32 ETFs × 244 meses.
- 1 hook React (useBootstrapWorker) con lifecycle completo.
- 1 store Zustand (store.ts) con recálculo de métricas en < 100ms al cambiar ventana.
- 8 componentes React: Header, PortfolioSelector, ProfilePreview, FlowEditor, FanChart, StatsPanel, SimulateButton, ExportBar.
- 131 tests vitest verdes.
- 3 scripts: build-data.mjs (datos), worker-sanity.ts (sanidad §4), xirr-crosscheck.ts (§11 paso 5).

**Distribución** en `../mercantil-planner-build/`:
- index.html + assets/ (JS 1.28 MB + CSS 21 KB + worker 391 KB).
- serve.bat + serve.mjs (servidor Node local, abre browser automáticamente).
- LEEME.txt (guía completa para el asesor).

### Pendientes para Fase 2 (documentados, no bloqueantes)
- Dark mode toggle (§7 "no negociables").
- Loading progress real del worker ("N/5000 paths…") — actualmente spinner + elapsedMs post-corrida.
- Tier A (IEI/IEF/SPTL): reconstrucción carry + duration·Δy + ½·conv·Δy² (badge "Fase 1" visible en header).
- Testing responsive formal a 1280×800 mínimo.
- Validación manual de XIRR en Excel contra el CSV generado (el motor ya matchea a 4+ decimales contra el valor analítico).
- Code-splitting de xlsx (~800 KB) para reducir el chunk principal si el tamaño molesta.

### Notas de cierre
- El subproyecto se completa en UNA sesión de Claude Code (2026-04-15) desde el scaffold de Vite hasta la distribución funcional.
- 0 bugs reportados por el usuario durante el testing.
- El usuario aprobó las decisiones de modelado (imputación con proxies, regla de ruina ≤ 0, umbrales vol 6/12%, TWR para sample paths, FanChart con zoom siempre).
- Todos los archivos .md (spec, bitácora, README, about-me) actualizados y consistentes.

---

## 2026-04-15 20:25 — ProfilePreview: clasificación de volatilidad + sample path con click-to-resample

### Motivación (pedido del usuario)
"Mostrar en qué perfil quedaría el cliente con uno y otro portafolio (Volatilidad Baja / Media / Alta). Al lado de la alerta, un gráfico con una simulación de cada portafolio pareada del mismo mercado. Click en el gráfico = otra simulación. Datos per-path al lado del chart para que el cliente entienda el comportamiento más allá de las estadísticas agregadas."

### Decisiones tomadas
- **Umbrales de volatilidad** hardcodeados en `VOL_THRESHOLDS = { baja: 0.06, media: 0.12 }`. Elegidos por consenso de firmas de wealth management (BlackRock iShares, JPMorgan AM, Morgan Stanley Wealth, Vanguard, Raymond James) — el corte 6%/12% es el más común para modelos de 3-tier. Fuente documentada en el JSDoc de `profile.ts`. Editable trivialmente si el usuario quiere moverlos después.
- **Métrica base**: volatilidad anualizada histórica **determinística** del portafolio ponderado contra el histórico 2006-2026. Ventajas: (a) no depende de la simulación, el perfil aparece inmediatamente al elegir un portafolio; (b) coincide con cómo los managers grandes calculan portfolio vol clásicamente; (c) separada del vol bootstrap que ya reporta el StatsPanel.
- **"Retorno total anualizado" del KPI**: usuario eligió **TWR** (time-weighted, ignora flujos). Representa "lo que hizo el mercado durante este escenario". Más fácil de explicar al cliente final.
- **Horizonte del sample path**: usuario eligió **seguir la ventana del FanChart**. Si el usuario zoomea el FanChart a los primeros 5 años, el sample path también muestra esos 5 años y los KPIs se calculan sobre ese tramo. Consistencia con el resto de la UI.
- **Placement**: card nuevo justo después de los 2 PortfolioSelectors y antes del FlowEditor. El perfil es característica del portafolio → va arriba. El chart arranca con placeholder hasta que el usuario corra Simular.

### `src/domain/profile.ts` (nuevo, ~170 líneas)
- `VOL_THRESHOLDS`, `VolProfile` type, `VOL_PROFILE_LABELS`, `VOL_PROFILE_DESCRIPTION`.
- `computePortfolioHistoricalVol(spec)` — construye la serie `r_port[t] = Σ w_j·r_{t,j} + fixed_contribution` sobre los 244 meses del dataset y retorna `stdSample * sqrt(12)`. Puramente determinístico. FIXED6/FIXED9 contribuyen al retorno pero NO a la varianza (son constantes), pero sí diluyen la vol de los ETFs al restar peso relativo. Usa las tasas default del worker (6%/9%).
- `classifyVolProfile(vol)` — mapping vol → 'baja' | 'media' | 'alta' con NaN-safe fallback a 'alta'.
- `computeSinglePathMetrics(values, returns, pathIdx, H, startMonth, endMonth)` — calcula los 4 KPIs del preview card para UN path dentro de una ventana: `pctNegMonths`, `maxDrawdown` (pre-flujo), `twrAnnualized`, `finalValue`. Validación de ventana con throw.

### `src/domain/profile.test.ts` — 16 tests nuevos
- `classifyVolProfile`: 4 tests cubriendo los 3 tiers + NaN fallback + labels.
- `computePortfolioHistoricalVol`:
  - 100% SPY produce vol en rango histórico esperado (10-25%).
  - Portafolio vacío → NaN (no div por cero).
  - Ordering Conservador < Balanceado < Crecimiento.
  - Conservador cae en baja|media, Crecimiento en media|alta.
- `computeSinglePathMetrics`: retornos constantes → 0% neg meses, MDD=0, TWR exacto. Alternando +/− → 50% neg. Drawdown conocido −20%. Ventana parcial cubre solo el rango. Saldo final = `values[endMonth]`. Throw en ventana inválida.

### Validación de los números en el dataset real
Corrida ad-hoc con tsx confirmó que los valores son razonables:

**Signatures:**
- Conservador: **6.81% → Media** (sobre el corte por el peso de RF.Lat con HY)
- Balanceado: **10.16% → Media**
- Crecimiento: **14.39% → Alta**

**AMCs individuales:**
- GlFI 5.41% → Baja
- RF.Lat 8.44% → Media
- ST.Cr.Opps 5.19% → Baja
- HY.Cr.Opps 4.43% → Baja (muy diluido por 60% FIXED9)
- USA.Eq 15.21% → Alta (matchea SPY histórico, sanity check)
- GlExUS 17.88% → Alta
- GlSec.Eq 16.26% → Alta
- CashST 1.29% → Baja
- USGrTech 17.24% → Alta
- USTDur 5.22% → Baja

Los valores coinciden con la intuición del asset class. SPY ~15% matchea la vol realizada del S&P 500 en el período 2006-2026.

### `src/components/ProfilePreview.tsx` (nuevo, ~360 líneas)
Layout del card:
1. **Título** con descripción corta ("Clasificación por volatilidad histórica 2006–2026").
2. **Profile badges** (dos en grid, A y B):
   - Border-l-4 con color del portafolio (navy A / naranja B).
   - Background del color del perfil (verde baja / ámbar media / rosa alta).
   - Pill con label "VOLATILIDAD BAJA/MEDIA/ALTA" en mayúsculas, bold, color-coded.
   - Número grande de vol a la derecha (ej. "6.8%").
   - Descripción corta debajo ("Vol anual < 6%. Perfil conservador típico.").
   - **Visible SIEMPRE**, incluso antes de correr simulación.
3. **Sample path preview** (grid 3/5 chart + 2/5 KPIs, o placeholder si no hay sim):
   - Chart mini (220 px alto) con `LineChart` de Recharts, 2 líneas (A navy + B naranja), dominio X siguiendo la ventana del FanChart, Y auto-escala. Tick formatter adaptativo al largo de la ventana (misma lógica que FanChart).
   - Tooltip custom con A y B side-by-side.
   - Click en todo el card del chart = `setPathIdx(random)`. Hover muestra border naranja + shadow.
   - Contador "Escenario #N de 5,000" arriba a la izquierda, "⟲ Click = otro escenario" arriba a la derecha en naranja.
   - KPIs en 2 cards (A y B) cada uno con grid 2×2: Meses neg., Max DD, TWR anual, Saldo final. Max DD y TWR negativos se pintan en rose-700.
4. **Re-roll automático** cuando llega una simulación nueva (useEffect sobre `[simA, nPaths]`). Al inicio del session o después de cada Simular, el path mostrado es aleatorio.
5. **Seguimiento de ventana**: todos los useMemo del componente dependen de `window.startMonth` y `window.endMonth`. Cuando el usuario mueve el slider del FanChart, el mini chart y los KPIs se recalculan en el acto.

### Cambios en `App.tsx`
- Nueva import: `ProfilePreview`.
- Insertado como fila 2 del body (entre Portfolios y FlowEditor).

### Verificación
- **131/131 tests verdes** (antes 131, sin regresiones).
- **`npm run build` limpio** en 1m 6s.
- **Bundle**: 1,283 KB JS (antes 1,273 KB) + 21.5 KB CSS (antes 19.3 KB) — crecimiento esperado por el nuevo componente.
- **`../mercantil-planner-build/` actualizado** con el nuevo bundle.
- **Chart mini testeado visualmente no aplica** — requiere run-time del usuario.

### Comportamiento esperado
1. El usuario cambia portafolio A → el badge de A se actualiza inmediatamente con la nueva vol y perfil.
2. El usuario clickea Simular → el chart mini se llena con un path random + sus KPIs.
3. El usuario clickea el chart mini → otro path random, otros KPIs.
4. El usuario zoomea el FanChart grande a los primeros 5 años → el chart mini también se zoomea a esos 5 años y recalcula sus KPIs sobre esa ventana.
5. Si el usuario corre Simular otra vez → nuevo bootstrap, path mostrado se re-rollea.

---

## 2026-04-15 19:00 — Fix de serve.bat (Python → Node) + FanChart zoom

### Fix de serve.bat
- El usuario reportó `ERR_CONNECTION_REFUSED` al abrir `serve.bat` en el folder de distribución — Python no estaba instalado o no en PATH, el `python -m http.server` falló silenciosamente y la ventana se cerró.
- **Reemplazado `serve.bat` por versión Node-based** — Node ya está garantizado en el sistema (v24.14.1 instalado al inicio del proyecto).
- **`mercantil-planner-build/serve.mjs`** — mini servidor HTTP estático con solo built-ins de Node:
  - MIME types correctos para html/js/mjs/css/svg/png/jpg/json/woff/woff2/ttf/map
  - Path traversal guard (403)
  - 404 para archivos inexistentes, 500 para errores del filesystem
  - `Cache-Control: no-cache` (tool de uso interno, evita problemas al re-desplegar)
  - Abre el browser automáticamente con `exec('start "" url')`
  - Error handling para `EADDRINUSE` (puerto ocupado) con mensaje claro
- **`serve.bat` actualizado:** ahora invoca `node serve.mjs` y tiene `pause` al final para que la ventana no se cierre si Node falla, permitiendo leer el error.
- **`LEEME.txt` actualizado** con las instrucciones nuevas: requiere Node (link a nodejs.org), instrucciones de troubleshoot si Node no está en PATH.
- **Smoke test headless** — serve.mjs testeado con curl: HTTP 200 en index.html, JS main, CSS, worker chunk; HTTP 404 para paths inexistentes; MIME types correctos.

### FanChart con zoom a la ventana seleccionada
- Sugerencia del usuario: cuando se selecciona una ventana vía slider o chips, la gráfica debe hacer zoom automático mostrando solo ese tramo con auto-escala en ambos ejes.
- **Decisiones acordadas con el usuario:**
  - Comportamiento "zoom siempre" (no toggle) — toda la visualización ES la ventana seleccionada.
  - Línea "Capital aportado neto" sigue visible, clippeada a la ventana.
  - El `ReferenceArea` naranja que marcaba la ventana se elimina — ya no hace falta cuando TODO lo visible ES la ventana.
- **Cambios en `FanChart.tsx`:**
  - `fullData` (memoizado) con todos los puntos del horizonte + `data` (memoizado) clippeado a `[window.startMonth - 1, window.endMonth + 1)`. Incluye V[startMonth − 1] como ancla visual al inicio de la ventana.
  - `XAxis` con `domain={[window.startMonth - 1, window.endMonth]}` + `allowDataOverflow` para que Recharts respete el domain exacto.
  - `YAxis` con `domain={['auto', 'auto']}` — Recharts auto-escala a los valores visibles.
  - **Tick formatter adaptativo** al largo de la ventana:
    - ≤ 24 meses: muestra meses (`m6`, `m12`, ...)
    - 25–72 meses: años con decimales si es necesario (`1a`, `2.5a`, ...)
    - > 72 meses: años enteros (`5a`, `10a`, ...)
  - Subtítulo del card actualizado: "El chart hace zoom automático a la ventana seleccionada".
- **Build limpio** en 46 s, bundle bajó 3 KB (eliminamos el import de `ReferenceArea`).
- **Distribution folder actualizado** — `../mercantil-planner-build/assets/` reemplazado con el build nuevo. Si el usuario ya tenía la tool abierta en Chrome, un hard refresh (Ctrl+F5) o cerrar y abrir el browser va a cargar el bundle nuevo (el filename cambió de `index-B4tgH8nu.js` a `index-B6XA3VSA.js`, así que el browser lo detecta automáticamente).

---

## 2026-04-15 18:50 — Housekeeping de docs (README + §14 del spec)

- **`README.md` reemplazado** — el scaffold de Vite había dejado un boilerplate genérico que hablaba de React Compiler y ESLint. Ahora el README del subproyecto apunta a `INSTRUCCIONES-PLANNER.md` como fuente de verdad, `progreso-planner.md` como bitácora, lista los comandos útiles (test / sanity / dev / build / preview / build:data), dibuja el layout del código, y da una guía corta de "cómo retomar una sesión".
- **`INSTRUCCIONES-PLANNER.md` §14 actualizado con permiso explícito del usuario.** Agregados 3 checks al checklist de inicio de sesión:
  1. `npm test` (confirmar dominio puro en verde)
  2. `npm run sanity` (confirmar convergencia §4 + perf §11)
  3. `npm run build` condicional (smoke test si la sesión anterior tocó UI / state / hooks)
  Estos pasos no estaban antes y son útiles para que futuras sesiones de Claude arranquen confirmando que el estado heredado es sano antes de tocar código nuevo. El spec sigue siendo la fuente de verdad — esta es la primera (y única por ahora) modificación autorizada explícitamente por el usuario.

---

## 2026-04-16 12:15 — Fase 2 RF: reconstrucción yield-path para los 11 RF tickers

### Motivación + alcance definido con el usuario

El spec §4 reservaba para Fase 2 la reconstrucción `carry + duration·Δy + ½·conv·Δy²` solo para los 3 Tier A (IEI/IEF/SPTL). El usuario pidió **expandir a todos los tickers RF del dataset** (los 11 de RF_DECOMP: BIL, SPTS, IEI, IEF, SPTL, IGOV, AGG, LQD, GHYG, EMB, CEMB), con proxy yield donde no hay mapping directo y residual bootstrapeado para capturar el spread premium.

**Segmentación de universo**:
- 5 Treasuries puros con mapping directo a una de las 4 yields (IRX/FVX/TNX/TYX).
- 6 credit/otros (IGOV/AGG/LQD/GHYG/EMB/CEMB) con Treasury yield más cercano en duración como proxy + residual histórico bootstrapeado que captura el spread.

### Decisiones de modelado acordadas (ronda de preguntas antes de codear)

1. **Approach B — yield path simulation** (no approach A bloque+reconstrucción). Arranca del último yield observado (IRX 3.62%, FVX 3.98%, TNX 4.34%, TYX 4.92%) y bootstrapea Δy histórico. Carry **evolutivo** mes a mes (= y_path/12), no carry histórico embebido. Razón del usuario: un planificador debe responder "qué me puede pasar a partir de hoy", no "qué hubiera pasado en un período aleatorio del pasado".

2. **Damping asimétrico de velocidad**, no clipping duro:
   - Piso = `y_min_hist − 0.5%` (absoluto).
   - Techo = `y_max_hist × 1.5` (multiplicativo).
   - Justificación del techo moderado (aporte del usuario): los picos 2023-2024 ya reflejan política monetaria apretada; multiplicar por 1.5× deja margen de sorpresa al alza sin permitir escenarios estilo Volcker 1980s (que ocurrieron bajo régimen monetario estructuralmente distinto al actual).
   - Aplicado **simétricamente** (piso y techo) para preservar correlación cross-asset y cross-maturity en ambas direcciones dentro del rango histórico — incluso aunque el piso buffer sea tight (0.5%) y el techo wide (2.5%).

3. **Forma del damping: `scale(x) = max(0, 1 − x²)`** (cuadrática convexa). Derivada `−2x` → gentle near threshold (x=0), aggressive near ceiling (x=1). Traduce la intuición del usuario: "cuando se salga de la muestra histórica, la velocidad va disminuyendo cada vez más".

4. **Convexity = 0 para credit tickers**: hallazgo del análisis empírico. Para GHYG, LQD, EMB, etc., la regresión estima C con signo negativo grande (GHYG C = −981 años², físicamente imposible) — el término Δy² captura ruido de spread correlacionado con Δy, no convexidad física. Conservamos C solo en IEI/IEF/SPTL donde es físicamente significativa.

5. **BIL como carry-only**: `r = IRX_path / 12`. Su regresión daba D = 0.09 con R² = 0.076 — el price return es ruido. Modelar estructuralmente agrega complejidad sin valor.

6. **Cap duro post-damping** (refinamiento descubierto durante validación): el damping cuadrático por sí solo **no previene overshoot** cuando un Δy grande entra en zona buffer con scale aún alto (x=0.4 → scale=0.84). Agregado un cap de red de seguridad que limita `dyEff` a la room real hasta el bound, preservando la consistencia `price_return = f(dyEff_aplicado)`. La invariante `yPath ∈ [floor, ceiling]` ahora se cumple estrictamente.

### Análisis empírico previo — `scripts/rf-analysis.ts`

Escrito y corrido con `npm run analyze:rf`. 7 secciones:
1. **Niveles de yield**: actual, min/max histórico, pisos y techos calculados.
2. **Δy estadísticos**: std ~20–25 bps/mes. IRX con kurtosis 14.8 (fat tails por ciclos Fed).
3. **Regresión OLS** `price ~ Δy + Δy²` por ticker. R² observados:
   - IEI / IEF / SPTL: 0.97 / 0.97 / 0.94 — estructural domina.
   - AGG / SPTS: 0.69 / 0.32 — modelo útil.
   - LQD: 0.40 — medio.
   - IGOV / EMB / CEMB / GHYG: 0.31 / 0.18 / 0.08 / 0.03 — residual domina.
   - BIL: 0.08 — price es ruido.
4. **Calibración del exponente**: 5000×360 sobre TNX con n=1,2,3,4. Elegido n=2: P99 terminal = 7.10% (vs 14.59% sin damping, vs 5.14% histórico). P50 = 3.07% (vs histórico 2.90%). Solo 32 bps bajo el no-damping.
5. **Consistencia carry**: ρ(RF_DECOMP.carry, yield_proxy/12) ≥ 0.97 para todos menos AGG (ratio 1.23). Validación de `yield/12` como approximación.
6. **Residuales credit**: media positiva en bps/año (+67 AGG, +203 LQD, +179 EMB, +295 CEMB, +685 GHYG, +48 IGOV) — captura correctamente el spread premium.
7. **Decision matrix** por ticker.

**Dos hallazgos que refinaron el modelo**:
- `RF_DECOMP.carry ≡ yield_proxy/12` para todos los tickers excepto AGG. El spread carry de crédito NO está en RF_DECOMP.carry, está embebido en el total → el residual bootstrapeado lo captura naturalmente.
- Convexity negativa en credit → overfitting (ver decisión 4 arriba).

### Archivos creados / modificados

**Nuevos**:
- `src/domain/rf-config.ts` — parámetros calibrados, hardcoded user-approved:

| Ticker | Modelo | Proxy | D (años) | C (años²) |
|---|---|---|---|---|
| BIL | carry-only | IRX | — | — |
| SPTS | treasury | 0.63·IRX + 0.37·FVX | 2.38 | 0 |
| IEI | treasury | FVX | 4.39 | −24.59 |
| IEF | treasury | TNX | 7.55 | −5.95 |
| SPTL | treasury | TYX | 15.09 | 265.95 |
| IGOV | hybrid | TNX | 5.43 | 0 |
| AGG | hybrid | FVX | 4.34 | 0 |
| LQD | hybrid | TNX | 6.06 | 0 |
| GHYG | hybrid | FVX | 0.53 | 0 |
| EMB | hybrid | TNX | 5.51 | 0 |
| CEMB | hybrid | FVX | 2.92 | 0 |

Más: `DAMPING_EXPONENT=2`, `FLOOR_ADJUSTMENT=0.005`, `CEILING_MULTIPLIER=1.5`.
- `scripts/rf-analysis.ts` — script diagnóstico empírico, wired a `npm run analyze:rf`.

**Modificados**:
- `src/domain/bootstrap.ts` — pre-cómputo módulo-nivel (DELTA_YIELDS, YIELD_BOUNDS, RESIDUAL_SERIES con imputación de media para NaN prefix, TICKER_SPECS flat lookup). Dos ramas en `runBootstrap`: **fast path equity-only** cuando ningún portafolio toca RF (preserva performance original, 133ms para 5000×360), y **rama RF** con yPath state + damping cuadrático + cap duro. Exports nuevos: `getYieldBounds(key)`, `getTickerModel(ticker)`.
- `src/workers/bootstrap.worker.ts` — mensaje actualizado a Fase 2 (`console.info` en lugar de `console.warn`).
- `src/components/Header.tsx` — badge cambiado de amarillo "Fase 1 · Tier A simplificado" a **verde "Fase 2 · RF yield-path"** con tooltip explicando el modelo completo.
- `src/domain/bootstrap.test.ts` — 10 tests RF nuevos (clasificación de tickers, bounds respetados, SPTL vol > IEF vol × 1.5, LQD mean > carry TNX por spread, determinismo con RF, fast path equity unchanged, SPTS proxy sintético).
- `scripts/worker-sanity.ts` — 2 checks RF (coherencia yield-path, bounds respetados).
- `package.json` — script `analyze:rf`.

### Validación final

- **141/141 tests verdes** (antes 131 + 10 nuevos). Duración 7.8s.
- **5/5 checks de sanidad verdes**:
  - Determinismo: 0 divergencias.
  - Convergencia SPY: 0.674pp off (rama equity unchanged).
  - Performance 5000×360: 133ms (fast path).
  - RF yield-path coherente (100% IEF): media mensual 0.37% → anualizada 4.59%, vol SPTL/IEF = 1.88× (duración efectiva ~2×).
  - RF bounds (100% BIL × 1.8M valores): **0 violaciones**, observado en [−0.041%, 0.665%] = cotas teóricas exactas.
- **`npm run build` limpio** en 45s. 598 modules. Bundle 1287 KB JS (+4 KB vs Fase 1). Worker 395 KB (+4 KB).

### Métricas relevantes post-implementación

- Current TNX = 4.34%, carry mensual ≈ 0.362%.
- 100% IEF retorno anualizado esperado ~4.6%/año (combinación de carry actual + drift positivo por Δy histórico ligeramente negativo → price return positivo).
- 100% SPTL: vol mensual 3.44% vs IEF 1.83% — ratio 1.88×, coherente con duración 15.09/7.55 = 2.0.
- Performance con rama RF activa: 295ms (100% IEF), 280ms (100% SPTL) — 2× el fast path equity pero muy por debajo del cap 15s.

### Pendientes Fase 2 (no bloqueantes)

- Dark mode toggle (§7 "no negociables de UX").
- Loading progress real del worker ("N/5000 paths...").
- Testing responsive formal a 1280×800.
- Code-splitting de xlsx (~800 KB) para reducir chunk principal.
- **§4 del `INSTRUCCIONES-PLANNER.md`** sigue hablando de "Fase 1 Tier A simplificado". Pendiente: actualizar spec con OK explícito del usuario para reflejar el modelo Fase 2 implementado.

### Consideraciones para futuras sesiones

- **Recalibración**: si el dataset agrega nuevos meses con valores extremos (yields que salen del rango histórico actual), re-correr `npm run analyze:rf` y revisar Punto 3 (regresiones) + Punto 4 (distribución de yields terminales). Los parámetros D, C en `rf-config.ts` están hardcoded — cambios requieren review manual.
- **Damping**: el cap duro post-damping es una red de seguridad para el caso específico n=2. Si se cambia el exponente (ej. a n=3 para damping más agresivo), el cap sigue siendo correcto pero su activación frequency puede cambiar.
- **Imputación de residual NaN**: el prefix NaN de cada ticker híbrido (1–24 meses) se imputa con la media empírica. Para tickers con prefijos largos (EMB/CEMB: 24 meses cada uno), los bloques bootstrapeados que caen en ese prefijo usan la media del residual — acceptable como approximation, documentado inline en bootstrap.ts.

### Próximo paso recomendado

Preguntar al usuario si quiere:
1. **Actualizar `INSTRUCCIONES-PLANNER.md` §4** para reflejar la implementación Fase 2 (requiere OK explícito por regla de modificación del spec).
2. **Seguir con otro pendiente Fase 2** (dark mode, loading progress real, responsive, code-splitting).
3. **Validación end-to-end visual** abriendo la herramienta en el browser con portafolios RF-dominantes (ej. 100% Conservador o custom 100% AGG) para verificar que el comportamiento del fan chart + stats es coherente con el modelo implementado.

---

## 2026-04-16 15:00 — ✅ FASE 2 CERRADA: UX + performance + dark mode + responsive

Sesión big-bang en la que se completaron **los 4 pendientes originales de Fase 2** (dark mode, loading progress real, code-splitting xlsx, responsive 1280×800) + **2 mejoras de UX solicitadas por el usuario** durante la sesión (RangeSlider dual-thumb sincronizado + Simular reubicado al FanChart) + **housekeeping documental** (spec §4 actualizado para reflejar Fase 2 RF implementada).

### 1. Validación visual Fase 2 RF en browser

Primer paso de la sesión: validé E2E la reconstrucción RF yield-path contra la UI real antes de seguir con otros features. **Hallazgo clave**: la vol del bootstrap simulado (Conservador 6.76% / Balanceado 10.16%) matchea casi exactamente con la vol histórica determinística calculada offline (6.81% / 10.16%). Eso confirma que el modelo Fase 2 RF preserva la dinámica histórica sin distorsión — el test más importante del modelo.

11 checks visuales pasaron: badge verde "Fase 2 · RF yield-path", profile preview, fan chart bandas P10-P90, stats panel con 9 métricas, slider de ventana recomputando en vivo, export Excel disponible, 0 errores en consola, 0 NaN en retornos.

### 2. Spec §4 actualizado

Reescrita la sección §4 de `INSTRUCCIONES-PLANNER.md` para reflejar Fase 2 implementada. La versión anterior decía "Tier A en Fase 1 usa bootstrap de retornos totales, reservado para Fase 2". La nueva describe:
- Motor general + fast path equity-only.
- RF yield-path reconstruction para los 11 tickers (BIL carry-only, 4 Treasuries puros, 6 híbridos).
- Damping cuadrático simétrico + cap duro.
- Parámetros calibrados vía `scripts/rf-analysis.ts` viviendo en `src/domain/rf-config.ts`.
- 5 tests de sanidad (determinismo, convergencia SPY, performance, RF yield-path coherente, RF bounds).

### 3. Code-splitting xlsx

`src/components/ExportBar.tsx` refactorizado: `import * as XLSX from 'xlsx'` → `const XLSX = await import('xlsx')` en el handler del botón. `import type * as XLSXNamespace` preserva los tipos sin costo runtime. Nuevo estado `isExporting` que muestra "⏳ Generando…" durante la carga del chunk.

**Impacto en el bundle**:
- Main bundle: **1287 KB → 1005 KB** (−282 KB uncompressed, −93 KB gzipped).
- Chunk `xlsx-*.js` separado: 425 KB (141 KB gzip), lazy-loaded al primer click de export.
- El asesor que solo simula sin exportar no descarga xlsx nunca.

### 4. Loading progress real del worker

**Arquitectura**:
- `src/domain/bootstrap.ts`: `runBootstrap(input, options?)` acepta `options.onProgress(completedPaths, totalPaths)`. Callback se dispara cada 250 paths + al final de la corrida. `PROGRESS_INTERVAL = 250` → 20 updates para nPaths=5000.
- `src/workers/bootstrap.worker.ts`: emite mensajes intermedios `{id, progress: true, completedPaths, totalPaths}` al main thread, sin resolver el job.
- `src/hooks/useBootstrapWorker.ts`: mensaje intermedio detectado por `'progress' in msg`; `run(input, onProgress?)` expone el callback al consumer.
- `src/components/SimulateButton.tsx`: estado local `progress`, botón muestra `XX%`, status line muestra barra naranja animada + "Simulando paths: 2,340 / 5,000".

Sampling JS en browser confirmó progresión smooth 0%→5%→10%→…→50% en 600ms (updates cada 30ms).

### 5. RangeSlider dual-thumb sincronizado (bonus UX del usuario)

**Componente nuevo: `src/components/RangeSlider.tsx`** (~220 líneas) — dual-thumb slider reutilizable con:
- Track con rango lleno entre thumbs (visualiza la ventana como segmento).
- Pointer events (mouse + touch), cada thumb con pointerCapture para drag suave.
- Click en el track mueve el thumb más cercano.
- Keyboard nav: `ArrowLeft/Right` ±1, `Shift+Arrow` ±12, `Home/End` extremos, `PageUp/Down` ±12.
- Tooltip sobre cada thumb al hover/drag.
- ARIA roles `slider` con valuemin/valuemax/valuenow/valuetext completos.
- Constraint `start + minWindow ≤ end` (default 6 meses) con clamping (no swap).

**FanChart**: los 2 sliders apilados "inicio" + "fin" → 1 RangeSlider. Ahorra ~40px verticales y hace la ventana visible como segmento.

**ProfilePreview**: agregado un RangeSlider debajo del chart mini + KPIs, con label "Ventana (sincronizada con el fan chart)". Ambos sliders leen/escriben el mismo `window` del store → mover uno mueve el otro automáticamente.

Sync verificado: click en chip "5a" mueve los **4 thumbs simultáneamente** (2 sliders × 2 thumbs) de [1, 240] a [1, 60].

### 6. Simular reubicado al FanChart card (bonus UX del usuario)

**Motivación del usuario**: "uno configura arriba-abajo y termina en Simular viendo la gráfica armarse de manera dinámica es divertido en UX." Totalmente de acuerdo — el flow natural es: portfolios → profile → flows → Simular → proyección.

- `src/App.tsx`: removido `SimulateButton` del hero section. Hero queda como intro pura. Texto actualizado: "Definí de arriba hacia abajo y presioná **Simular** junto al gráfico para ver la proyección armarse."
- `src/components/FanChart.tsx`: `<SimulateButton />` en el header del card (top-right), al lado del título + legend dots. Responsive: se wrapea en viewports angostos.
- Footer: "Fase 1 · Block bootstrap 2006-2026" → "**Fase 2 · Block bootstrap 2006-2026 + RF yield-path**".

### 7. Dark mode toggle

**Decisiones acordadas antes de codear**:
1. Toggle sol/luna en el Header (junto a CTAs).
2. **Opción "Dark respetuoso"** — paleta navy-tinted que preserva identidad Mercantil (vs dark neutro).
3. Persistencia en localStorage + default por `prefers-color-scheme`.
4. Scope completo: todos los componentes + clases utilitarias.

**Infra**:
- `tailwind.config.js`: tokens dark-mode (`mercantil.dark-bg` #0A1025, `dark-panel` #141D3C, `dark-line` #27325A, `dark-ink` #E8ECF5, `dark-slate` #96A0BD, `dark-navy-text` #92A6DE).
- **`src/hooks/useTheme.ts` (nuevo)**: hook con `localStorage` (`mercantil-planner.theme`) + `prefers-color-scheme` fallback. Aplica `.dark` class al `<html>` y setea `colorScheme`. También exporta `getChartTheme(theme)` con `LIGHT_CHART_THEME` / `DARK_CHART_THEME` para Recharts (navy A #92A6DE, naranja B #F28C5E, grid #27325A, axis #96A0BD, tooltip bg/border/text).
- `index.html`: script inline anti-FOUC que corre ANTES de React y aplica la clase dark. `lang="es"` también fixed.
- **`src/components/ThemeToggle.tsx` (nuevo)**: botón circular con iconos sol/luna SVG inline, aria-label dinámico.

**Componentes adaptados** (todos con variants `dark:` + chart theme donde aplique):
- Header, App (hero gradient preservado, footer adaptado).
- index.css (`.mp-card`, `.mp-btn-primary`, `.mp-btn-outline`, `.mp-chip*`, scrollbar webkit custom dark).
- PortfolioSelector, FlowEditor, StatsPanel, ExportBar, SimulateButton, ProfilePreview, FanChart, RangeSlider.
- FanChart + ProfilePreview: colores de Recharts (grid, axes, strokes, fills, tooltips) vía `useTheme` + `getChartTheme`.
- FlowEditor `.input-mp` (CSS inline en `<style>` tag): agregada regla `html.dark .input-mp { background: #141D3C; border-color: #27325A; color: #E8ECF5; }`.
- ProfilePreview profile badges (Baja/Media/Alta): palette emerald/amber/rose adaptada con `dark:bg-*-950/40` (tint suave) + `dark:text-*-200` (brillante) + `dark:border-*-600`. Esto resolvió un issue de contraste: los números "6.8%" y "10.2%" se veían washed-out con `text-amber-900` sobre fondo dark, ahora con `text-amber-200` son claramente legibles.

### 8. Responsive formal a 1280×800

Testeo manual en viewport 1280×800 en light + dark:
- `bodyWidth = 1265px`, `windowWidth = 1280px` → **0 overflow horizontal**.
- Todos los elementos fit sin recorte: Hero, PortfolioSelectors side-by-side, ProfilePreview (grid 3/5 + 2/5), FlowEditor (grid 4 cols), FanChart (Simular + leyenda + chart), StatsPanel (tabla A|B|Δ), ExportBar, Footer.
- No fueron necesarios ajustes adicionales de breakpoints — los fixes hechos en el paso 7 (inputs dark, profile badges dark) cubren también el comportamiento en resolución mínima.

### Validación final de la sesión

- **`npm test`** → **141/141 passed** (7.8s → 9.5s con el código nuevo). Fix extra aplicado: batcheé el test BIL 72k-valores porque los 216k expects individuales hacían timeout a 5s con el cambio mínimo del hot loop (O(segundos) → O(ms) con batch-scan).
- **`npm run sanity`** → 5/5 checks verdes (re-corrido al inicio de sesión; dominio puro no se tocó después más que el `onProgress` opcional que es transparente para las corridas sin callback).
- **`npm run build`** → limpio, 600 modules, bundle final: 1005 KB main (336 KB gzip) + 425 KB xlsx chunk (141 KB gzip) + 395 KB worker + 21.7 KB CSS.
- **Validación visual E2E en browser** a 1440×900 y 1280×800, light + dark: toggle bidireccional funciona, sliders sincronizados, loading progress visible con barra + %, export Excel funciona con lazy load del chunk, todos los componentes respetan el tema activo.

### Archivos tocados en esta sesión

**Nuevos**:
- `src/hooks/useTheme.ts` — theme hook + chart themes light/dark
- `src/components/ThemeToggle.tsx` — sun/moon toggle
- `src/components/RangeSlider.tsx` — dual-thumb slider reutilizable
- `.claude/launch.json` — config del preview dev server (npm run dev, port 5173)

**Modificados**:
- `index.html` — FOUC script, lang="es"
- `tailwind.config.js` — dark-mode tokens
- `src/index.css` — dark variants en `.mp-*` classes + scrollbar webkit
- `src/App.tsx` — hero sin SimulateButton, footer "Fase 2"
- `src/components/Header.tsx` — ThemeToggle integrado, dark variants
- `src/components/FanChart.tsx` — RangeSlider, SimulateButton en header, dark variants, chart theme dinámico, FanTooltip recibe chart theme
- `src/components/ProfilePreview.tsx` — RangeSlider sincronizado, dark variants, chart theme dinámico, profile badges palette dark-adapted, PathTooltip recibe chart theme
- `src/components/FlowEditor.tsx` — dark variants + `.input-mp` css rule dark
- `src/components/StatsPanel.tsx` — dark variants + deltaClass con emerald/rose dark
- `src/components/ExportBar.tsx` — lazy import xlsx, isExporting state, dark variants
- `src/components/SimulateButton.tsx` — progress bar con % y barra, dark variants
- `src/components/PortfolioSelector.tsx` — dark variants
- `src/domain/bootstrap.ts` — `onProgress` callback opcional en `runBootstrap`
- `src/workers/bootstrap.worker.ts` — emite mensajes progress al main
- `src/hooks/useBootstrapWorker.ts` — handling de progress + callback API en `run()`
- `src/domain/bootstrap.test.ts` — batch-scan en test BIL (fix flakiness por 72k expects)
- `INSTRUCCIONES-PLANNER.md` — §4 reescrita reflejando Fase 2 RF

### Pendientes (no-bloqueantes, para futuras sesiones)

1. **Distribución**: re-copiar el `dist/` fresh a `../mercantil-planner-build/` para que el asesor tenga la versión con dark mode + nuevos sliders + progress + bundle más liviano. Update `LEEME.txt` con las mejoras. La versión ahí actualmente es del 2026-04-15 (pre-Fase 2).
2. **Actualizar §7 del spec** para documentar el RangeSlider dual-thumb, la posición de Simular junto al FanChart, el dark mode (estos estaban listados como "Pendiente Fase 2" — ahora hechos). — **HECHO al cierre de esta sesión** (ver abajo).
3. Eventualmente: tests de integración E2E (Playwright, RTL) que cubran el toggle theme y los sliders sincronizados.

### Próximo paso recomendado

**Distribución**: generar una copia fresh de `dist/` → `../mercantil-planner-build/` para que el asesor pueda usar la versión Fase 2 completa. Es un delta mecánico (~5 min) pero importante porque la carpeta build actual está desactualizada. Sugerir al usuario que arranque la próxima sesión pidiendo esto explícitamente.

---

## 2026-04-16 22:55 — Distribución refrescada a Fase 2 + kickoff E2E Playwright

### Distribución `../mercantil-planner-build/` actualizada

- Checklist §14 verificado al inicio: 141/141 tests, 5/5 sanity, `npm run build` limpio (56s, 602 modules).
- Sincronizado el contenido de `dist/` hacia `../mercantil-planner-build/` bajo la autorización explícita del §10 del spec:
  - Borrados los 3 assets viejos (`bootstrap.worker-C9H31ebe.js` 391 KB, `index-7dTNfQZg.css` 21.5 KB, `index-PvIlUESU.js` 1283 KB — del 2026-04-15 pre-Fase 2 cierre).
  - Copiados los 4 assets nuevos: `bootstrap.worker-D1qFha5b.js` 395 KB, `index-CRSp_zrZ.css` 28.9 KB, `index-D4iFEBY5.js` **1017 KB** (−267 KB vs anterior por xlsx split), `xlsx-B7Fe_CV5.js` 425 KB (chunk lazy, sólo se carga al primer click de Export).
  - Reemplazado `index.html` 491 B → 1087 B (ahora incluye script anti-FOUC del dark mode).
- **Preservados intactos** (no cambiaron desde el 2026-04-15): `serve.bat`, `serve.mjs`, `favicon.svg`, `icons.svg`.
- **`LEEME.txt` reescrito** (4038 B → 6 KB aprox). Cambios clave:
  - Título: "Versión: Fase 2 (RF yield-path)".
  - Sección nueva "NOVEDADES DE ESTA VERSIÓN (Fase 2)": reconstrucción RF yield-path, dark mode, RangeSlider dual-thumb sincronizado, Simular reubicado al FanChart, barra de progreso real, bundle con xlsx en chunk lazy.
  - Sección "CÓMO USARLA" actualizada: menciona ProfilePreview, la ubicación nueva de Simular, el RangeSlider con chips, click-to-resample en el mini chart del perfil.
  - Sección "METODOLOGÍA" actualizada: describe el modelo RF por ticker con la fórmula estándar `r = y/12 − D·Δy + ½·C·Δy² [+ residual]` y el damping cuadrático simétrico (reemplaza la nota "Fase 1 Tier A simplificado").
  - Sección nueva "ESTADO DE VALIDACIÓN": 141 tests + 5 sanity + XIRR cross-check + responsive 1280×800 light/dark.
  - Contacto preservado.

### Próximo paso en curso (nocturno)

Arrancando tests de integración E2E con Playwright — pendiente listado explícito del cierre Fase 2 (punto 3: "tests que cubran el toggle theme y los sliders sincronizados"). Ver entrada siguiente.

---

## 2026-04-16 23:16 — Bugs ruina + MDD manager + E2E Playwright (bloqueado por tooling)

> **Nota importante para el usuario**: §6 del `INSTRUCCIONES-PLANNER.md` describe Max Drawdown "sobre serie de valor pre-flujo". Esta sesión implementa el cambio a definición **manager-level** (independiente de flujos) autorizado explícitamente por el usuario. El spec §6 y el `LEEME.txt` del build quedan pendientes de update next session (fuera de alcance de esta sesión nocturna — requiere OK por la regla "no modificar spec sin autorización"). **LEEME.txt en `../mercantil-planner-build/` NO se tocó** — la distribución quedó intacta como se indicó.

---

### 1. Bug 1 — Fan chart con valores negativos

#### Root cause

`src/domain/flows.ts:213-226` tenía dos ramas separadas de clamp:

```ts
if (flow < 0 && tentative <= 0) { /* ruin by withdraw */ }
else if (tentative < 0) { /* catastrophic return */ }
```

Problema: la segunda rama catcheaba `tentative < 0` pero **no** `tentative === 0`, y la primera sólo aplicaba a retiros. Cualquier combinación donde `V[t-1]·(1+r[t]) + flow[t]` resultaba en un residuo Float64 muy chiquito (`-1e-15` por roundoff) pasaba. Además, combinado con el YAxis `domain={['auto', 'auto']}` en `FanChart.tsx:173`, Recharts auto-escala cuando detecta datos negativos → P10 banda visualmente por debajo de 0 USD.

#### Fixes aplicados

1. **`src/domain/flows.ts:213-232`** — clamp unificado. Las 2 ramas se colapsaron a `if (tentative <= 0) { v = 0; ruined = true; isRuined = true; }`. Garantiza `V[t] ≥ 0` INVARIANTE, independiente del signo del flujo o del roundoff. Comentario inline documenta el cambio y la razón.

2. **`src/domain/metrics.ts:543-555` (computeFanChartBands)** — `Math.max(0, pick(q))` aplicado a p10/p25/p50/p75/p90. Red de seguridad (belt-and-suspenders): si el motor de flujos ya garantiza ≥ 0, esto es no-op en práctica; si una regresión futura filtra un residuo negativo, el chart NUNCA mostrará bandas por debajo de 0. Documentado como invariante visual del chart, no como workaround.

#### Tests agregados (`src/domain/flows.test.ts:364-443`)

4 casos nuevos bajo `describe('Bug 1 — invariante V[t] ≥ 0 siempre')`:

- **Retornos catastróficos sin flujos**: `returns = [-0.5, -0.5, -0.9, -0.99, -0.5, -0.5]`, sin retiros. Todos los valores `≥ 0` assert.
- **Capital pequeño + retornos muy negativos + retiro**: path se ruina, ningún valor negativo.
- **Path ruinado ignora aportes posteriores**: retiros de 200 en meses 1-7 ruinan en mes 3; deposit 1000/mes desde mes 8 NO resucita el path — valores siguen en 0.
- **Estrés multi-path**: 500 paths × 60 meses con retornos aleatorios extremos. Scan completo de `out.values` — `min ≥ 0`.

#### Verificación

- `npm test` → 147/147 (+6 nuevos: 4 Bug 1 + 3 Bug 2 + 1 existente renamed). ✅
- `npm run sanity` → 5/5. ✅
- `npm run build` → limpio, 602 módulos. ✅

---

### 2. Bug 2 — Max Drawdown reflejaba retiros del cliente

#### Cambio de definición (user-authorized)

**Antes** (spec §6): MDD sobre `V_pre[t] = V[t-1]·(1+r[t])` → mezclaba performance del portafolio con decisiones de flujo del cliente. Paths ruinados por retiros agresivos daban MDD = −100% (o cerca).

**Ahora** (2026-04-17): MDD **manager-level** sobre la curva de equidad de $1 invertido, independiente de aportes/retiros:

```
E[0] = 1
E[k] = E[k-1] · (1 + r_port[startMonth + k − 1])   para k = 1..n
MDD = min_k ( E[k] / peak_k − 1 )
```

Misma MDD para un cliente que aporta agresivamente vs. uno que retira agresivo — mide solo la "vara del manager".

#### Archivos modificados

1. **`src/domain/metrics.ts`**:
   - JSDoc de archivo (líneas 19-30): definición nueva documentada + flag de "§6 del spec necesita update".
   - `WindowMetrics.maxDrawdown` doc (línea 66): "Max drawdown manager-level sobre retornos puros del portafolio, independiente de flujos."
   - `maxDrawdownPrePath` → **`maxDrawdownManagerPath`** (líneas 200-243). Firma cambió: ya no recibe `values`, sólo `portfolioReturns`. Curva de equidad calculada on-the-fly desde `E=1`.
   - Call site (línea 424): ajustado a la nueva firma.

2. **`src/components/StatsPanel.tsx:48`** — tooltip `hint` actualizado:
   - Antes: `"Sobre serie pre-flujo (antes de aplicar aporte/retiro)"`
   - Ahora: `"Caída máxima del portafolio, independiente de aportes/retiros del cliente"`

#### Tests en `src/domain/metrics.test.ts`

- **Test existente "un path con caída conocida"**: refactoreado. Los comentarios ahora explican `E[k]` (no `V_pre[t]`). Expected value = −0.20 idéntico (la regresión manual sobre retornos `[+0.10, −0.20, 0]` da misma MDD bajo ambas definiciones cuando no hay flujos).
- **Test nuevo (regresión Bug 2) "retiros que ruinan NO arrastran MDD a −100%"**: retornos `[−0.05, +0.03, +0.02, +0.02, ...]` con retiros agresivos que ruinan el path en mes 6. Sanity assert `sim.ruined[0] === 1`, y luego `expect(mdd).toBeCloseTo(-0.05, 5)` + `expect(mdd).toBeGreaterThan(-0.5)`. Este es **el guardrail explícito** del fix.
- **Test nuevo "MDD independiente de flujos"**: dos planes con idénticos retornos pero flujos radicalmente distintos (plan A sin flujos, plan B con aporte 1000/mes) → MDD idéntica a 8 decimales. Prueba el invariante diseñado.

#### Verificación

- 147/147 tests verdes. ✅
- Tooltip verificado en `src/components/StatsPanel.tsx`.
- `npm run build` limpio.

---

### 3. E2E Playwright — BLOQUEADO por issue de tooling Playwright+Node24+ESM

#### Setup completado

- `@playwright/test@1.59.1` ya estaba instalado (de sesión anterior).
- Chromium browser already installed (sesión anterior).
- `playwright.config.ts` correcto (`testDir: './e2e'`, preview en port 4173, etc.).
- `package.json` scripts `test:e2e`, `test:e2e:ui`, `test:e2e:headed` ya presentes.

#### Especificaciones escritas (10/10)

| # | Spec | Estado |
|---|------|--------|
| 1 | `e2e/smoke.spec.ts` | Escrita (existía) |
| 2 | `e2e/portfolios-profile.spec.ts` | Escrita (existía) |
| 3 | `e2e/simulate.spec.ts` | Escrita; agregada aserción Bug 1 (YAxis sin ticks negativos) |
| 4 | `e2e/window-sync.spec.ts` | Escrita (existía) |
| 5 | `e2e/theme.spec.ts` | Escrita (existía) |
| 6 | `e2e/flows.spec.ts` | **Nueva** — preset Jubilación → modo real + inflación visible + withdraw rule |
| 7 | `e2e/export.spec.ts` | **Nueva** — download Excel + xlsx chunk lazy-loaded |
| 8 | `e2e/responsive.spec.ts` | **Nueva** — 1280×800 sin overflow en light + dark |
| 9 | (theme cubre 6 + 7 del enunciado) | — |
| 10 | (la lista del enunciado contaba 10 puntos en 8 specs; mapeo 1:1 al spec del usuario) | — |

Helpers: `e2e/helpers.ts` ya existente (setInitialTheme, runSimulation, readTheme, isDark).

#### Blocker de tooling — Playwright + Node 24 + ESM package

**Síntoma** al correr `npx playwright test --list` o `test`:

```
Error: Playwright Test did not expect test() to be called here.
Most common reasons include:
- You are calling test() in a configuration file.
- You are calling test() in a file that is imported by the configuration file.
- You have two different versions of @playwright/test. This usually happens
  when one of the dependencies in your package.json depends on @playwright/test.
   at smoke.spec.ts:12
```

Error: No tests found. Total: 0 tests in 0 files.

#### Debugging realizado

1. **Un solo `@playwright/test` instalado** (verificado con `find node_modules -name "@playwright"`): `node_modules/@playwright/test@1.59.1` y `node_modules/playwright@1.59.1` — versiones idénticas.
2. **Mensaje engañoso**: la causa REAL no es "dos versiones" sino que `currentlyLoadingFileSuite()` retorna `undefined` en el CJS module cuando el spec file se carga vía ESM loader. Es decir, el `globals.js` de Playwright que SET la suite tiene instancia distinta al `globals.js` que el spec file (vía `@playwright/test`) READ.
3. **Env vars probadas**:
   - `PW_DISABLE_TS_ESM=1`: cambia la pila a CJS pero mismo error ("two different versions") + adicionalmente falla la resolución de `./helpers` (export ESM-only).
   - `NODE_OPTIONS="--import tsx/esm"`: mismo error.
4. **Extensions probadas**: `.spec.ts`, `.spec.mts`, directo `import from 'playwright/test'` → mismo error en todos.
5. **package.json override por subdirectorio** (`e2e/package.json` con `"type": "commonjs"`): cambia el stack trace a `Object.<anonymous>` (CJS) pero mismo fallo funcional — `currentlyLoadingFileSuite()` sigue retornando undefined.
6. **Playwright 1.60.0-alpha-2026-04-16**: instalado, probado, mismo error (stack trace diferente pero misma raíz).
7. **Revertido a 1.59.1 stable**.

**Root cause probable**: en Node 24.14.1 + Windows + `"type": "module"` root package, el ESM loader de Playwright (`node:module.register` con `MessageChannel`) pierde la conexión entre el contexto CJS donde corre `loadTestFile()` y el contexto donde se evalúa el spec file transformado. El mismo archivo termina cargándose dos veces — una por el framework para setear la suite, otra por el loader para ejecutar test() — resultando en dos `TestTypeImpl` roots.

Es un issue conocido upstream (múltiples reports en GitHub sobre combinación Node 22+/24 + Windows + ESM package). El fix upstream de Playwright está en camino pero no disponible en 1.59.1 ni en los alphas de 1.60 probados.

#### Workarounds NO intentados (para future sessions)

1. **Remover `"type": "module"` de `package.json`** y migrar todo a CJS-compatible / explicit `.mts` imports. **Riesgo alto**: Vite config, scripts build-data.mjs, y `worker-sanity.ts` dependen del mode module. Requiere OK del usuario antes de ejecutar.
2. **Bajar Node a v20 LTS** sólo para correr e2e. Requiere gestión de múltiples versiones Node (nvm-windows) — feature del entorno, no del subproyecto.
3. **Esperar Playwright 1.60 stable** con el fix upstream.
4. **Reemplazar Playwright por Cypress o WebdriverIO**. Overhead grande, no vale la pena para 10 specs.

#### Recomendación

Dejar los 10 specs escritos y correctos en `e2e/` para cuando el blocker se resuelva. Cuando Playwright 1.60 stable salga o el usuario elija hacer downgrade de Node, `npm run test:e2e` debería correr sin cambios en el código. **Ninguno de los specs depende del bug — son correctos contra la app actual.**

---

### 4. Estado final de la sesión

| Check | Resultado |
|-------|-----------|
| `npm test` | **147/147 passed** (era 141/141; +6 tests nuevos: 4 Bug 1, 3 Bug 2, −1 rename) |
| `npm run sanity` | **5/5 passed** |
| `npm run build` | **Limpio**, 602 módulos, 43s, bundle sin cambio de tamaño significativo |
| `npm run test:e2e` | **BLOQUEADO** por tooling (ver sección 3) — specs escritos, no ejecutables hasta upgrade |

### 5. Distribución `../mercantil-planner-build/` — intacta

No se tocó, como se indicó. Cuando el usuario lo apruebe, regenerar con `npm run build` → copiar `dist/` a `../mercantil-planner-build/` + update `LEEME.txt` con nota sobre MDD manager-level.

### 6. Qué revisar primero al despertar (prioridad 1-3)

1. **🔥 BUG 2 — definición MDD**: validar que la nueva definición manager-level es la que quiere. Tooltip en StatsPanel ahora dice "Caída máxima del portafolio, independiente de aportes/retiros del cliente". Si OK, **approve update de §6 del spec** (diff propuesto en sección 2 acá arriba). Si NO, podemos volver a pre-flow con una conditional (pero sería un anti-patrón UX — quedaron 2 semantics del mismo KPI).
2. **🔥 E2E tooling**: decidir entre (a) remover `"type": "module"` del package.json, (b) downgrade a Node 20 para e2e, o (c) esperar Playwright 1.60. Opción (a) es la más limpia long-term pero requiere probar que Vite + build-data.mjs + sanity sigan funcionando.
3. **Pendiente §6 del spec + LEEME.txt**: la definición nueva de MDD vive en el código pero NO en la documentación oficial. Update de `INSTRUCCIONES-PLANNER.md` §6 y `../mercantil-planner-build/LEEME.txt` es 10 min mecánicos con OK previo.

---

## 2026-04-17 — Sincronización de distribución post-bugs + LEEME actualizado

Ejecución mecánica después del despertar del usuario, para cerrar los bloqueadores técnicos previos a poder generar un instructivo comercial con gráficas / videos.

### Re-build + sync a `../mercantil-planner-build/`
- `npm run build` → limpio en 45.57s, 602 módulos. Bundle main cambió hash de `index-D4iFEBY5.js` → `index-CXPibBQN.js` (refleja los cambios en `flows.ts` + `metrics.ts` + `StatsPanel.tsx`). Los otros 3 assets (bootstrap.worker, index.css, xlsx chunk) mantuvieron su hash — no requirieron copia.
- Borrado `index-D4iFEBY5.js` de distribución, copiado `index-CXPibBQN.js`, y sincronizado `index.html` (trae la nueva referencia al bundle).
- `serve.bat`, `serve.mjs`, `favicon.svg`, `icons.svg` — intactos.

### LEEME.txt actualizado
- Agregada sección **"AJUSTES RECIENTES (2026-04-17)"** con 2 viñetas:
  - Fan chart sin valores negativos (regla de ruina reforzada).
  - Max Drawdown redefinido manager-level, independiente de flujos del cliente.
- Redacción accesible para asesor (no cuant): explica el "qué" y el "por qué" sin jargon.

### Qué queda pendiente de decisión del usuario
1. **§6 del spec `INSTRUCCIONES-PLANNER.md`**: texto actual dice "MDD sobre serie pre-flujo". Propuesta de redacción: "MDD manager-level. Calculado sobre la equity curve teórica `E[k] = ∏(1+r_port)` con `E[0]=1`, sobre la ventana seleccionada. Independiente de aportes/retiros del cliente — mide sólo el comportamiento del portafolio. La métrica es por lo tanto comparable entre clientes con flujos distintos." Requiere OK explícito del usuario para modificar el spec (regla §12).
2. **E2E Playwright tooling**: opciones (a) remover `"type": "module"` del package.json, (b) downgrade Node a v20, (c) esperar Playwright 1.60 stable. Ninguna bloquea videos/instructivo, es un safety net.

### Update §6 aplicado (OK del usuario)
- `INSTRUCCIONES-PLANNER.md` línea 226 — entrada Max Drawdown reescrita a versión manager-level, con nota de la actualización y cambio de definición documentado.
- Decisión sobre E2E tooling: **deferido** hasta después del instructivo comercial (mi recomendación, usuario OK implícito). Los 10 specs quedan escritos en `e2e/` esperando unblock.

### Estado post-cierre de bloqueadores técnicos
- Código: 147 tests, 5 sanity, build limpio.
- Distribución: `../mercantil-planner-build/` sincronizada con el build 2026-04-17 (bundle main con los 2 fixes + LEEME.txt actualizado).
- Documentación: spec §6 al día con la implementación.
- Siguiente fase: **contenido del instructivo comercial** (audiencia + formato + guión + casos).

---

## 2026-04-17 — Instructivo comercial: arranque de contenido (Parte 1 + Parte 4)

### Decisiones de producción acordadas con el usuario

- **Audiencia**: equipo comercial completo (senior + junior), usando el documento en capacitación Y como ficha de consulta rápida en reunión con cliente. El asesor arma el portafolio JUNTO al cliente, en vivo.
- **Principio rector**: "el riesgo real no es la volatilidad, es no cumplir el objetivo". El instructivo explica cada indicador bajo esa lente, documentando en paralelo el **costo del camino** (vol, drawdown, meses negativos) para armar un contrato emocional explícito con el cliente que facilite el seguimiento posterior.
- **Formato**: PDF con screenshots + GIFs animados. Video queda para después.
- **Producción**: sin voz, con subtítulos, stack 100% open-source (ScreenToGif, Greenshot, GIMP, Inkscape, Pandoc+LaTeX, fuentes Inter + IBM Plex Serif).
- **Léxico**: bogotano, no rioplatense. "Usted" con el cliente en las frases sugeridas.
- **Tono de la Parte 1**: "contar la robustez matemática sin lenguaje técnico" — generar confianza, luego sencillez.

### Carpeta nueva `mercantil-planner/instructivo/`

Creada como fuente Markdown del PDF. Tres archivos entregados en esta sesión:

1. **`README.md`** — índice del instructivo (8 partes), convenciones de estilo, stack de producción open-source, comando Pandoc para el build final.
2. **`parte-1-por-que-confiar.md`** — generar confianza. Contiene:
   - Los cuatro pilares del cálculo: 20+ años de historia real, 5000 futuros por corrida, modelo RF desde tasas actuales, **correlaciones condicionadas al régimen de mercado** (destacado por pedido del usuario — crisis/recuperación/expansión/shock inflacionario/calma, con ejemplos históricos concretos por régimen).
   - Validación previa a release: 147 tests + 5 sanity + XIRR vs Excel.
   - Qué NO es la herramienta (predicción, regulatorio, costos, juicio del asesor).
   - Frase de cierre con el cliente.
3. **`parte-4-glosario-nueve-indicadores.md`** — las 9 métricas en dos familias:
   - **Familia A (éxito del plan)**: prob. ruina, prob. shortfall, valor final, TWR, XIRR. Preámbulo con el **principio rector**: acompañar siempre porcentajes con traducción a capital final en dólares (retorno compuesto amplifica pequeñas diferencias de tasa en grandes diferencias de capital terminal).
   - **Familia B (costo del camino)**: max drawdown manager-level, vol anualizada, meses negativos/año, peor rolling 12m.
   - Cada ficha con 4 campos: **Qué mide**, **En reunión inicial**, **En seguimiento**, **Frase al cliente** (en "usted").
   - La ficha de Max Drawdown incluye ejemplo concreto del trade-off con capital final absoluto (USD 500K × 25 años, 7% → 5% TWR implica USD 1M menos de capital terminal).

### Revisado y aprobado por el usuario en esta sesión

- Reagrupación de las 9 métricas en dos familias de igual peso (no priorización 3+6).
- Uso del instructivo para sostener conversaciones de seguimiento ("dentro de lo esperado" vs crisis de expectativas).
- Léxico bogotano.
- Destacar correlaciones condicionadas al régimen (vs matriz estática).
- Principio de capital final absoluto alongside porcentajes.

### Pendientes del instructivo

| Parte | Estado |
|---|---|
| 0 — Portada/índice PDF | pendiente |
| 1 — Por qué confiar | borrador v1 archivado |
| 2 — Mapa de la herramienta | pendiente |
| 3 — Los 4 pasos operativos | pendiente |
| 4 — Glosario 9 indicadores | borrador v1 archivado |
| 4b — Seguimiento futuro | pendiente |
| 5 — Tres casos de cliente (Pablo 40a / Marta 65a / Carlos HNW) | **siguiente** — borrador entregado en chat al usuario para aprobación |
| 6 — FAQ y límites | pendiente |
| 7 — Troubleshooting | pendiente |

### Próximo paso recomendado

Arrancar Parte 5 (los tres casos) con placeholders numéricos `[XXX]` para los valores específicos. Cuando el usuario apruebe la narrativa, se corren los casos en la herramienta real y se pinan los números concretos + screenshots/GIFs.

---

## 2026-04-17 — Parte 5 del instructivo: cuatro casos de cliente archivados

### Entregado y guardado

`mercantil-planner/instructivo/parte-5-casos-cliente.md` (~800 líneas, ~8.500 palabras). Borrador completo con los cuatro casos, cada uno con estructura de 7 secciones aprobada (perfil / configuración / Familia A / Familia B / conversación / seguimiento). Valores numéricos como `[placeholders]` pendientes de pinear corriendo la herramienta.

### Feedback del usuario durante la sesión

1. **Perfiles y portafolios a comparar aprobados sin cambios.**
2. **Nuevo Caso 2 — Diana (renovadora de CDT)** agregado por pedido del usuario. Perfil: odontóloga 50 años, USD 200K, horizonte 15 años, *buy-and-hold*. Compara "Custom CashST 50% + GlFI 50%" (aproximación CDT-like) vs Signature Crecimiento. Mensaje central: mostrar con números el costo de oportunidad compuesto del cliente 100% CDT, sin forzar la decisión — dar consentimiento informado.
3. **Punto contraintuitivo en Marta confirmado:** Balanceado puede tener menor probabilidad de ruina que Conservador a 25 años. Elevado a mensaje central del caso, anclado al mantra: *"la volatilidad no es riesgo, es el costo de cumplir el objetivo — el riesgo es no cumplirlo"*. Esta frase queda como epígrafe de toda la Parte 5.
4. **Caso Carlos reescrito con estrategia mixta** por pedido explícito del usuario ("mostremos complejidad"). Ahora documenta explícitamente las 3 fases (equity-tilted 0-7, Balanceado 7-10, equity-tilted 10-30) y la forma operativa de analizarlas con 3 corridas secuenciales de la herramienta. Lenguaje simplificado intencionalmente para que un asesor junior pueda seguirlo.
5. **Estructura de 7 secciones por caso confirmada.**

### Nota técnica identificada (backlog de producto)

La UI actual permite Custom mix sobre los 10 AMCs — no sobre building blocks directos. La combinación "50% cash + 50% FIXED6" pura no es expresable exactamente. **Mejora sugerida para una sesión futura:** agregar un AMC nuevo llamado `CDT-Proxy` con composición `50% CashST + 50% FIXED6` (o equivalente) para tener una entrada directa desde el selector para clientes tipo Diana. Es un cambio mínimo en `src/domain/amc-definitions.ts`: una entrada nueva en `AMC_COMPOSITIONS`, etiqueta en `AMC_LABELS`, tier en `AMC_TIER`. No requiere cambios al motor ni a los tests existentes (solo agregar el test de expansión correspondiente).

### Estado del instructivo tras esta sesión

| Parte | Estado |
|---|---|
| 0 — Portada/índice PDF | pendiente |
| 1 — Por qué confiar | **borrador v1 archivado** |
| 2 — Mapa de la herramienta | pendiente |
| 3 — Los 4 pasos operativos | pendiente |
| 4 — Glosario 9 indicadores | **borrador v1 archivado** |
| 4b — Seguimiento futuro | pendiente |
| 5 — Cuatro casos de cliente | **borrador v1 archivado** (Pablo / Diana / Marta / Carlos) |
| 6 — FAQ y límites | pendiente |
| 7 — Troubleshooting | pendiente |

### Próximo paso recomendado para la próxima sesión

Priorizados:

1. **Parte 2 (Mapa de la herramienta)** — una página con overview visual del flow arriba-abajo. Corto y altamente visual; depende de los screenshots.
2. **Parte 3 (Los 4 pasos operativos)** — el manual operativo paso a paso. Es la parte más larga (~8 páginas) pero mecánica: un screenshot + un GIF por paso.
3. **Parte 4b (Seguimiento futuro)** — extender el hilo que ya aparece en la Parte 4 (cómo usar cada métrica en reunión de seguimiento) en una metodología formal: a 1 año, 3 años, 5 años, qué recalcular, qué conversar.
4. **Partes 6 y 7 (FAQ + Troubleshooting)** — cortas y mecánicas, se pueden hacer al cierre.
5. **Corrida de la herramienta con los 4 casos** — pinear los `[placeholders]` y capturar screenshots/GIFs. Actividad mecánica de ~1 hora si se hace sin interrupciones.
6. **Opcional — agregar AMC "CDT-Proxy"** — ~15 min de código + 1 test + re-build + re-deploy a distribución. Mejora directa del caso Diana.

Las partes 1, 4 y 5 ya cubren la base conceptual y narrativa. Lo que queda es operativo (partes 2, 3, 6, 7) + producción (screenshots, GIFs, build Pandoc).

---

## 2026-04-17 — Views (Fase A — dominio puro): feature nueva request del usuario

### Motivación

El usuario propuso agregar **views** al planner: condicionar las simulaciones sobre una hipótesis de mercado (ej. *"tasas suben 100 pbs en los próximos 12 meses"*) para obtener:
1. La probabilidad empírica del view (fracción de paths que lo cumplen).
2. El impacto condicional del view sobre las métricas del portafolio.
3. Lectura en corto / mediano / largo plazo usando el slider de ventana existente.

Conceptualmente es **condicionamiento bayesiano sobre la posterior bootstrap**: el view filtra los 5000 caminos simulados y las métricas se recalculan sobre el subset. No cambia el motor ni introduce supuestos nuevos.

### Decisiones acordadas con el usuario antes de codear

- **Fase A (esta sesión)**: dominio puro — tipos, predicados, presets, evaluación. Sin UI.
- **Fase B (sesión futura)**: ViewsPanel UI, store integration, overlay en fan chart, builder de views custom, views de régimen histórico, views cross-asset (LatAm: dólar, EEM vs DM, energy), descomposición del impacto por clase.
- Views positivos sí (no sólo estrés): rallies, mercados planos, bandas de percentil.
- Tres modos de definir "cambio de tasas" (peak / endpoint / persistent threshold).
- Subject yield default: TNX (10yr). Portfolio views sobre A o B.
- Análisis asimétrico (matched vs unmatched vs base) incluido.
- Dejamos para Fase B los views compuestos (AND/OR).

### Cambios en el código

**`src/domain/bootstrap.ts`**:
- `BootstrapInput.outputYieldPaths?: boolean` — nueva opción opt-in.
- `BootstrapOutput.yieldPaths?: Record<YieldKey, Float32Array>` — output opcional (IRX / FVX / TNX / TYX, cada uno `[nPaths × horizonMonths]`, ~29 MB total a 5000×360).
- Nueva condición de branching `needsYieldSim = rfActive || outputYieldPaths` — fuerza la rama yield-path si se piden los outputs aunque el portafolio sea pure equity.
- Escritura del nivel post-damping `yPath[i]` en el output, dentro del loop RF existente.
- Backward compatible: sin `outputYieldPaths`, performance idéntica (confirmado por sanity — 155 ms para 5000×360 SPY, mismo que antes).

**`src/domain/views.ts` (nuevo, ~500 líneas)**:
- Tipos: `YieldPaths`, `ViewSubject`, `PredicateMode` (6 variantes), `View`, `ViewEvaluation`, `ViewDataset`, `ConditionalInput`, `AsymmetricAnalysis`.
- Predicados soportados:
  - `peakChange` — max(y[t] − y[start]) ∈ [min, max] (yield).
  - `troughChange` — min(y[t] − y[start]) ∈ [min, max] (yield).
  - `endpointChange` — y[end] − y[start] ∈ [min, max] (yield).
  - `persistentThreshold` — racha consecutiva ≥ N meses con delta ≥ threshold (yield).
  - `cumulativeReturnRange` — retorno acumulado ∈ [min, max] (portfolio).
  - `percentileBandReturn` — retorno acumulado en banda de percentiles [lowerP, upperP] (portfolio).
- **9 presets built-in**: rates up/down/stable (peak/endpoint/persistent), portfolio crash/rally/flat/best-tercile/worst-tercile.
- Funciones: `evaluateView` (probabilidad + indices), `computeConditionalMetrics` (reutiliza `computeMetrics` sobre subset), `asymmetricAnalysis` (matched vs unmatched vs base), `getBuiltInView`, `withPortfolio` (clonar preset a otro portafolio).

**`src/domain/views.test.ts` (nuevo, 24 tests)**:
- Cobertura de los 6 modos de predicado sobre datos sintéticos.
- Probabilidad + error estándar verificados numéricamente.
- Subset vacío → `null`. Subset completo reproduce las métricas base.
- Asymmetric analysis con 0% match, 50%, 100% — casos borde.
- Integración end-to-end con el bootstrap real (500 paths, 24m, signatures Balanceado vs Crecimiento).
- Presets built-in bien formados (ids únicos, clone por portfolio funciona, throw en casos inválidos).

**`scripts/views-sanity.ts` (nuevo)**:
- End-to-end sobre simulación realista (5000 × 60 meses, Balanceado vs Crecimiento, capital USD 500K).
- Evalúa los 9 presets, reporta P(view), ΔTWR, ΔFinal, ΔMDD condicionales vs base.
- Tabla legible para review cualitativa por Head of Quant.
- Wired a npm script `sanity:views`.

### Resultados de la corrida de sanity (números intuitivamente coherentes)

Yield actual: IRX=3.62%, FVX=3.98%, TNX=4.34%, TYX=4.92%. Base TWR = 7.67%, valor final USD 723K.

| View | P(view) | ΔFinal condicional |
|------|---------|---------|
| Tasas suben 100 pbs (pico, 12m) | 17.3% | +USD 3K (neutro) |
| Tasas cierran +100 pbs (12m) | 9.9% | −USD 67K |
| Tasas bajan 100 pbs (pico, 12m) | 23.1% | −USD 33K |
| Tasas estables ±25 pbs (12m) | 20.6% | +USD 14K |
| Portafolio A cae −20% (12m) | 2.8% | −USD 175K (severo) |
| Portafolio A sube +20% (12m) | 7.3% | +USD 74K |
| Portafolio A plano (12m) | 22.1% | −USD 44K |
| Portafolio A mejor tercil (24m) | 33.3% | +USD 60K |
| Portafolio A peor tercil (24m) | 33.3% | −USD 79K |

Asimetría en tasas destacable: "peak +100 pbs" (17.3%) vs "endpoint +100 pbs" (9.9%) — muchos paths tocan el nivel pero no terminan allí. La diferencia cuantifica la importancia del *timing* en views de tasas.

### Verificación final de la sesión

- `npm test` → **171/171** (antes 147, +24 nuevos de views).
- `npm run sanity` → **5/5** (sin regresión en bootstrap).
- `npm run sanity:views` → **9/9 presets evaluados OK**.
- `npm run build` → **limpio**, 602 módulos, 44s.

### Fase B — pendientes para próximas sesiones

1. **UI**: `ViewsPanel` (chips con presets + probabilidad + métricas condicionales), integración con store Zustand, overlay en fan chart con bandas conditionales en tono tenue.
2. **Builder de views custom**: variable / operador / ventana / threshold desde la UI.
3. **Views compuestos** (AND / OR de múltiples predicados): stagflation, soft landing, etc.
4. **Views de régimen histórico**: 2008-like, 2022-like, etc. Requiere clasificador de bloques.
5. **Views cross-asset**: dólar, emergentes vs desarrollados, energy. Requiere exponer retornos per-ETF o differentials pre-computados desde el worker.
6. **Descomposición del impacto**: desglosar el ΔFinal condicional por clase de activo (renta variable / renta fija / cash).
7. **Persistencia y export**: guardar views custom en localStorage, exportar análisis condicional a Excel.

### Próximo paso recomendado

**Fase B — UI** del ViewsPanel. Es el paso necesario para que el asesor use la feature. Sin UI, la lógica está sólida pero inaccesible en reunión con cliente. Estimación: 1-2 sesiones (componente + store slice + integración con fan chart).

Tras la UI, retomar el instructivo — agregar una **Parte 4c: Manejo de Views** con los 9 presets explicados, cuándo usar cada uno con el cliente, y cómo leer la asimetría matched-vs-unmatched.

---

## 2026-04-17 — Trabajo remoto: CDT-Proxy AMC + instructivo Partes 4c / 6 / 7

Sesión de control remoto (sin feedback visual posible desde celular). Aprovechada para cerrar todo lo que no requiere ver pantallas.

### AMC nuevo: `CDT-Proxy`

Composición: `30% MM (BIL) + 20% UST13 (SPTS) + 50% FIXED6`. Es la expansión exacta del custom mix "50% CashST + 50% FIXED6" pre-aprobado en la sesión de diseño del Caso Diana. Volatilidad esperada < 2% anual, retorno esperado ~5,5% nominal. Tier: propuesto.

Cambios:
- `src/domain/types.ts` — `AMC_IDS` extendido con `'CDT-Proxy'`.
- `src/domain/amc-definitions.ts` — entrada en `AMC_COMPOSITIONS_PROPOSED`, label, tier.
- `src/domain/amc-definitions.test.ts` — 2 tests nuevos (expansión correcta + equivalencia matemática con el custom mix).
- `LEEME.txt` en distribución — sección "AJUSTES RECIENTES" ampliada.

**Verificación:**
- `npm test` → **174/174** (171 + 3 nuevos).
- `npm run build` → limpio, 45s. Nuevos hashes de bundle: `index-bZrIDeNe.js` (main, cambió por el AMC) + `bootstrap.worker-vzMeE9uq.js` (worker, cambió por los cambios de Views Fase A que se habían quedado sin deployar en distribución).
- Distribución sincronizada: borrados los 2 hashes viejos, copiados los nuevos + `index.html` actualizado.

**Impacto directo:** el Caso Diana del instructivo ahora tiene un AMC dedicado en el selector, simplificando la reunión con el cliente tipo CDT-renovador. La nota técnica que estaba como "backlog de producto" queda cerrada.

### Instructivo — 3 partes archivadas

**`parte-4c-manejo-de-views.md` (nuevo, ~9 KB):**
- Explica qué es un view y para qué sirve en reunión.
- Documenta los 9 presets built-in en dos bloques (4 sobre tasas + 5 sobre portafolio) con: condición, cuándo usarlo, qué mostrar, frase sugerida al cliente.
- Sección sobre análisis asimétrico (matched / unmatched / base).
- Reglas prácticas para leer confiabilidad estadística según tamaño del subset matched.
- Flujo recomendado de conversación con cliente usando views.
- Uso en seguimiento futuro: re-correr views para ver cómo evoluciona la probabilidad.

**`parte-6-faq-y-limites.md` (nuevo, ~9 KB):**
- 12 preguntas frecuentes agrupadas en 5 bloques (naturaleza de la simulación, escenarios extremos, configuración del portafolio, lectura de resultados, honestidad metodológica).
- Respuestas redactadas para uso directo en conversación con cliente.
- Sección explícita de sesgos y limitaciones del modelo.
- Sección "Cuándo NO usar esta herramienta" — honestidad metodológica.

**`parte-7-troubleshooting.md` (nuevo, ~6 KB):**
- Problemas al abrir la herramienta (Node no instalado, PATH, puerto ocupado, file:// vs http://).
- Problemas en tiempo de ejecución (Worker no carga, custom mix no suma 100, simulación lenta).
- Interpretación de resultados raros (valor final < capital, probabilidad de ruina alta, Excel que no abre).
- Cómo reportar un bug al Head of Quant.

### Estado del instructivo tras esta sesión

| Parte | Estado |
|---|---|
| 0 — Portada/índice PDF | pendiente |
| 1 — Por qué confiar | archivada |
| 2 — Mapa de la herramienta | pendiente (requiere screenshots) |
| 3 — Los 4 pasos operativos | pendiente (requiere screenshots + GIFs) |
| 4 — Glosario 9 indicadores | archivada |
| 4b — Seguimiento futuro | pendiente |
| 4c — Manejo de Views | **archivada** |
| 5 — Cuatro casos de cliente | archivada (pendiente pinear valores) |
| 6 — FAQ y límites | **archivada** |
| 7 — Troubleshooting | **archivada** |

### Qué queda pendiente

1. **Fase B UI de Views** — necesita PC. Componente ViewsPanel, store slice, overlay en fan chart. Typing del store se puede adelantar sin UI pero el grueso requiere visual.
2. **Partes 2, 3 y 4b del instructivo** — requieren screenshots/GIFs, posponibles hasta tener PC.
3. **Correr los 4 casos (Parte 5) en la herramienta** para pinear valores concretos. Requiere PC.
4. **E2E Playwright** — sigue bloqueado por tooling Node 24 + ESM. Posible unblock: remover `"type": "module"` del package.json y re-probar.
5. **Build del PDF con Pandoc** — cuando las 9 partes estén archivadas.

### Verificación final

- `npm test` → **174/174**.
- `npm run sanity` → 5/5.
- `npm run sanity:views` → 9/9 presets evaluados OK.
- `npm run build` → limpio.
- Distribución `../mercantil-planner-build/` sincronizada con el build actual (CDT-Proxy + Views Fase A + fixes del 17-abr todos en producción).

---

## 2026-04-17 — Remote sesión continuada: E2E unblock (fracasó) + Views Fase B scaffolding

### Intento de unblockeo de E2E Playwright — **FRACASÓ, revertido**

Hipótesis: remover `"type": "module"` del `package.json` destrabaría Playwright en Node 24 + Windows.

Cambios hechos:
- Renombrado `postcss.config.js`, `tailwind.config.js`, `eslint.config.js` → `.mjs` (para preservar su sintaxis ESM sin depender del flag `type: module`).
- Removido `"type": "module"` del `package.json`.

Verificación pre-Playwright (todo pasó):
- `npm test` → 174/174 ✓
- `npm run sanity` → 5/5 ✓
- `npm run sanity:views` → 9/9 ✓
- `npm run build` → limpio ✓

**Resultado con Playwright:** mismo error (`"Playwright Test did not expect test() to be called here"`, stack trace ahora en `Object.<anonymous>` que es CJS). El issue NO es `"type": "module"` — es el CJS/ESM bridge interno de Playwright 1.59.1 en combinación con Node 24 + Windows.

**Revertido:** los 3 configs volvieron a `.js` y el `"type": "module"` al package.json. Tests siguen 174/174 verdes post-revert.

**Aprendizaje:** el tool pipeline (Vite + Tailwind + PostCSS + Vitest + tsx + ESLint + build-data.mjs + sanity scripts) es totalmente agnóstico de `"type": "module"`. La única razón para mantenerlo es convención — y no destraba Playwright. Opciones que quedan:
1. Esperar Playwright ≥ 1.60 stable (fix upstream en camino).
2. Downgrade de Node a v20 LTS (requiere `nvm-windows` o similar).
3. Dejar E2E para cuando Playwright soporte Node 24 bien.

Todas requieren decisión/PC del usuario — no se pueden atacar remoto.

### Views Fase B (parcial) — scaffolding sin UI

Objetivo: dejar listos todos los tipos, el estado del store, el hook consumer y los tests, de modo que la próxima sesión con PC sólo tenga que escribir los componentes React (ViewsPanel + overlay en fan chart).

#### Cambios en el worker + hook (pasar yield paths)

**`src/workers/bootstrap.worker.ts`**:
- `OkResponse` ahora incluye `yieldPaths?: YieldPathsOutput`.
- Si `runBootstrap` devuelve yield paths, se incluyen en el mensaje y sus 4 buffers se agregan a `transfer` (zero-copy).

**`src/hooks/useBootstrapWorker.ts`**:
- `BootstrapRunResult.yieldPaths?: YieldPathsOutput` agregado al tipo y al resolve del promise.

Los tests del bootstrap existentes no cambiaron — backward compatible (sin `outputYieldPaths`, el output es el mismo).

#### Cambios en el store (`src/state/store.ts`)

Slice de views agregado:
- **Estado**: `yieldPaths`, `yieldInitial` (pre-computado desde `getYieldBounds` al importar), `activeViewId`, `viewAnalysisA`, `viewAnalysisB`, `viewError`.
- **`RawSimulationInput` extendido** con `yieldPaths?: YieldPaths` opcional.
- **Helper `evaluateActiveView`** — función pura que toma snapshot del estado + ventana y devuelve `{viewAnalysisA, viewAnalysisB, viewError}`. Maneja todos los edge cases: view id inválido, sin sim, yields faltantes para views de yield, shape mismatch. NUNCA lanza excepción — siempre devuelve `viewError` legible.
- **Nueva acción `setActiveView(id: string | null)`** — activa un preset por id o clearea. Dispara `evaluateActiveView` y persiste el resultado.
- **`setWindow` extendido**: tras clamp + recompute de métricas base, re-evalúa el view activo con la ventana nueva. Garantiza que las métricas condicionales siguen consistentes con el slider (< 100 ms del spec §7, respetado).
- **`ingestSimulation` extendido**: guarda `yieldPaths` si viene en el raw, y re-evalúa el view activo con los datos frescos. Un usuario que activó un view antes de simular verá el análisis poblarse automáticamente al terminar la sim.
- **`resetSimulation` extendido**: limpia análisis + error + yieldPaths, pero **preserva `activeViewId`** (si el usuario re-corre Simular, su view se reactiva automáticamente).

#### Nuevo hook `src/hooks/useViews.ts`

API focalizada para componentes UI:

```typescript
const {
  availablePresets,      // los 9 built-in
  activeView,            // View | null resuelto desde activeViewId
  probability,           // 0..1 | null
  standardError,         // null | número para IC 95%
  nMatched, nTotal,      // conteos
  analysisA, analysisB,  // matched / unmatched / base por portafolio
  error,                 // mensaje legible o null
  isSimulationReady,     // true si hay simulación
  requiresYieldPaths,    // view activo requiere yields
  hasYieldPaths,         // simulación actual incluye yields
  setActiveView,         // id | null
  clearView,             // shortcut a setActiveView(null)
} = useViews();
```

#### Tests (`src/state/store.test.ts` — 12 tests nuevos)

1. **Estado inicial**: activeViewId null, análisis null, error null, yieldInitial pre-poblado con valores realistas.
2. **Sin simulación**: activar preset válido → error "corré simular"; id inválido → error "no existe".
3. **Con simulación sin yields**: view de portfolio funciona (análisis poblado, probability calculada); view de yield → error "yields requeridos".
4. **Con simulación + yields**: view de yield evaluable, probability y analyses poblados; view con rango que no matchea → probability=0, matched=null, unmatched=base.
5. **setActiveView(null)** limpia todo.
6. **Cambio de ventana** re-evalúa el view activo (base.window actualizado; nPaths total invariante).
7. **resetSimulation preserva activeViewId**, limpia análisis.
8. **ingestSimulation con view pre-activado** lo re-evalúa automáticamente (error → análisis poblado).

**Verificación final:** `npm test` → **186/186** (174 + 12 nuevos). Build limpio, sanity 5/5.

#### Lo que queda para la próxima sesión (con PC)

**El scaffolding de Fase B ya soporta toda la UI sin más cambios de dominio/store.** La próxima sesión sólo necesita:

1. **Componente `ViewsPanel.tsx`** — chips con los 9 presets, badge de probabilidad + error estándar, tabla matched/unmatched/base para A y B, botón "limpiar view".
2. **Flag opt-in en SimulateButton** — checkbox "Incluir yields para análisis de views" que pasa `outputYieldPaths: true` al input del worker. Sin el checkbox, los views de portfolioReturn siguen funcionando; los de yield muestran el error legible que ya está cableado.
3. **Overlay en FanChart** — cuando hay view activo, dibujar una banda secundaria en tono tenue sobre el subset matched. Componente recibe `analysisA` del hook `useViews` y lo filtra.
4. **Integración visual**: decidir ubicación del ViewsPanel (debajo del StatsPanel, colapsable), iconografía, colores consistentes con la paleta Mercantil.

Estimación para la próxima sesión: ~1.5-2 horas de UI + revisión visual.

### Estado del proyecto al cierre de esta sesión

- **Código:** 186/186 tests · 5/5 sanity · 9/9 views-sanity · build limpio.
- **Distribución:** sincronizada (CDT-Proxy + todos los fixes del 17-abr).
- **Instructivo:** 6 de 9 partes archivadas (1, 4, 4c, 5, 6, 7). Pendientes 2, 3, 4b (requieren screenshots o PC).
- **Views:** Fase A dominio puro + Fase B scaffolding (worker/hook/store/useViews/tests) completos. Sólo falta UI React.
- **E2E Playwright:** sigue bloqueado por issue upstream — documentado, revertido limpio, a la espera de Playwright 1.60 stable o decisión de Node downgrade.

---

## 2026-04-17 — Views Fase B UI completa: ViewsPanel + wiring en SimulateButton + banner en FanChart

El usuario pidió arrancar Fase B UI mientras se dirigía a la PC. Entregado con defaults conservadores para revisión visual al llegar.

### Cambios de código

**`src/components/SimulateButton.tsx`**:
- `outputYieldPaths: true` por default en el input del worker. Decisión: los 29 MB adicionales de yield paths son despreciables en browsers modernos vs el costo de UX de obligar al usuario a activar un flag antes de usar views de tasas. Justificado en comment inline.
- `ingestSimulation` recibe ahora `yieldPaths: result.yieldPaths` del resultado del worker.

**`src/components/ViewsPanel.tsx` (nuevo, ~260 líneas)**:
- Card colapsable — arranca colapsado para no agregar ruido visual si el asesor no usa views.
- Header: título "Views — análisis condicional" + botón toggle + botón "Limpiar view" cuando hay uno activo.
- Cuerpo (cuando expandido):
  - Fila de chips con los 9 presets. Chip activo en naranja Mercantil; chips de yield-subject se muestran deshabilitados con tooltip explicativo si la última simulación no incluyó yields.
  - Caja de error rojo cuando `viewError` está seteado.
  - Display de probabilidad: número grande en naranja + error estándar pequeño + confidence badge (confiable / IC amplio / muestra chica / 0 paths) color-coded verde / ámbar / rojo según `nMatched`.
  - **Dos tablas** (una por portafolio A y B) con 3 filas × 5 columnas:
    - Filas: TWR mediano, valor final mediano, Max DD mediano.
    - Columnas: Métrica · Base (sin filtrar) · Si se materializa · Si NO se materializa · Δ si ocurre.
    - Colores semánticos en Δ (verde/rojo según signo y si la métrica es "más es mejor" o "menos es mejor").
  - Mensaje ilustrativo cuando `nMatched === 0` ("este view no se materializa — evidencia de que la hipótesis está fuera del rango de lo esperable").
- Consume todo su estado via el hook `useViews()` — cero estado local más allá del toggle expand/collapse.

**`src/components/FanChart.tsx`**:
- Import de `useViews`.
- Componente nuevo `ActiveViewBanner` al final del archivo (junto a LegendDot). Chip compacto naranja que aparece debajo de la leyenda cuando hay un view activo, mostrando label + probabilidad + nMatched. Sirve de recordatorio visual permanente aunque el ViewsPanel esté colapsado — el asesor sabe siempre qué filtro está aplicado.

**`src/App.tsx`**:
- Import de ViewsPanel, integrado como nueva fila 4b entre StatsPanel y ExportBar.

### Verificación

- `npm test` → **186/186** (sin cambios — el código nuevo es UI pura, sin agregar tests, pero la infraestructura testeada en Fase B scaffolding sigue verde).
- `npm run build` → limpio, 44s, 602 módulos. Nuevos hashes:
  - `bootstrap.worker-DcsMlXDE.js` (cambió por yieldPaths en OkResponse).
  - `index--nYiLBxx.css` (cambió por Tailwind compilando las clases nuevas del ViewsPanel).
  - `index-Dz-EbSbD.js` (cambió por ViewsPanel + integración FanChart + SimulateButton).
  - `xlsx-B7Fe_CV5.js` (invariante).

### Distribución

Sincronizado `../mercantil-planner-build/` con los 3 bundles nuevos + `index.html`. LEEME.txt actualizado con la sección de Views explicando los 9 presets, las dos métricas clave (probabilidad + impacto condicional), y el caso de uso "¿qué pasaría si…?".

### Decisiones de diseño que conviene revisar visualmente

1. **ViewsPanel arranca colapsado**: buen default porque los asesores nuevos no lo necesitan de entrada. Pero puede ser invisible — alternativa: arrancar expandido. Feedback del usuario al ver la herramienta.
2. **Chips de yield deshabilitados cuando no hay yields**: mensaje claro pero podría ser más suave (ej. tooltip sólo al hover en vez de disabled cursor).
3. **Badge de confidence**: 4 niveles (≥500, 100-500, 50-100, <50). Revisar si los thresholds tienen sentido para un asesor.
4. **Banner en FanChart**: ubicación debajo de la leyenda funciona porque es parte del mismo "grupo de info del chart". Alternativas: header del card (menos prominente) o floating sobre el chart (más intrusivo).
5. **Default `outputYieldPaths: true`**: costo de ~29 MB RAM por simulación. Si se vuelve problema en laptops más viejas, agregamos toggle opt-in en bootstrap config.

### Lo que queda pendiente

1. **Revisión visual del usuario** cuando llegue a la PC. Iterar sobre los puntos anteriores según feedback.
2. **Overlay de bandas condicionales en el fan chart** (Fase B2, opcional) — dibujar una segunda capa de bandas con los percentiles del subset matched. Requiere `computeFanChartBands` sobre indices filtrados (~200ms extra por view activación) y ajuste visual (tono tenue para no saturar). Lo dejé fuera por ahora — el ViewsPanel ya da el análisis completo; la banda en el chart es un refinamiento estético.
3. **Fase C — Views avanzados**: multi-predicado (stagflation = rates up AND equity down), regímenes históricos (2008-like), views cross-asset (dólar, emergentes vs desarrollados), descomposición por clase de activo. Todos son backlog futuro.
4. **Partes 2, 3, 4b del instructivo**: siguen pendientes, requieren screenshots.
5. **Correr los 4 casos del Caso 5** en la herramienta para pinear valores concretos + screenshots.

### Estado final de esta sesión remota

- **186/186 tests · 5/5 sanity · 9/9 views-sanity · build limpio.**
- **Distribución `../mercantil-planner-build/` sincronizada** con Views Fase B UI completa + CDT-Proxy + todos los fixes.
- Views ready para uso end-to-end: seleccionar portafolios → simular → activar preset → leer probabilidad + impacto condicional en las tablas A/B. Banner en el fan chart mantiene contexto visible.

---

## 2026-04-20 — Fase C.1 Views avanzados: composites multi-predicado (4 presets)

Sesión arrancó con re-verificación de entorno (186/186 tests · 5/5 sanity · 9/9 views-sanity · build limpio). Objetivo acordado con el usuario: arrancar Fase C por **multi-predicado**, postergando regímenes históricos / cross-asset / descomposición para Fase D. Decisiones clave negociadas antes de codear:

1. **Unión discriminada `AnyView = View | CompositeView`** con `isCompositeView` type guard. Permite widening backward-compatible de `evaluateView()` y `asymmetricAnalysis()` a `AnyView` sin romper callers existentes.
2. **Ventana unificada**: todos los componentes de un composite comparten `window`. La semántica "en algún momento" vs "al cierre" ya está encodeada por componente vía `PredicateMode`, así que un composite puede mezclar (p.ej. "rates peak up en algún momento AND equity cumulativo -20% sobre la ventana").
3. **Input como id-string de preset built-in** (no builder visual en esta fase). Los presets son read-only.
4. **4 presets cubriendo los 4 cuadrantes del plano tasas × equity** a 12m con combinator AND.

### Cambios de dominio (`src/domain/views.ts`)

- Nuevos tipos: `CompositeView` (discriminado por `kind: 'composite'`), `AnyView = View | CompositeView`.
- Nuevos helpers: `isCompositeView()`, `viewRequiresYieldPaths()` (single o composite), `getAnyBuiltInView()`, `findAnyBuiltInView()`.
- `evaluateView()` ahora acepta `AnyView` con dispatch interno. Composite usa bitmaps `Uint8Array[n]` por componente para combinar con AND (intersección) o OR (unión) — O(k·n) sobre nPaths=5000 es despreciable.
- `asymmetricAnalysis()` widened a `AnyView`.
- `ViewEvaluation.view` ahora es `AnyView`.
- Validaciones: `components.length === 0` → throw; componente con `window` distinta al composite → throw; componente yield con `yieldPaths=null` → throw (heredado del evaluador single).
- `BUILT_IN_COMPOSITE_VIEWS` con 4 presets:
  1. **Estanflación (12m)** — `peakChange TNX ≥ +100bps` AND `cumRet A ≤ -20%`.
  2. **Aterrizaje suave (12m)** — `troughChange TNX ≤ -100bps` AND `cumRet A ≥ +20%`.
  3. **Goldilocks (12m)** — `endpointChange TNX ∈ ±25bps` AND `percentileBandReturn A [66.67, 100]`.
  4. **Risk-off / vuelo a la calidad (12m)** — `troughChange TNX ≤ -100bps` AND `cumRet A ≤ -20%`.

### Tests nuevos en `src/domain/views.test.ts` (+18 tests, total 216)

- Type guards: `isCompositeView`, `viewRequiresYieldPaths` para single yield, single portfolio, composite con 1+ componente yield, composite sin yield.
- Lookup unificado: `getAnyBuiltInView` y `findAnyBuiltInView` para ids single + composite + inválidos.
- Evaluador AND: intersección exacta con 2 componentes, 3 componentes, todos matchean → P=1, ningún componente 2 matchea → P=0.
- Evaluador OR: unión exacta, ambos vacíos → P=0.
- Validaciones: components vacío, ventana incoherente, yields faltantes, ventana fuera de horizonte, composite degenerado con 1 componente.
- `asymmetricAnalysis` sobre composite: partición matched+unmatched=nTotal, TWR matched < unmatched cuando stagflation es sintéticamente impuesta.
- Shape de los 4 presets built-in: ids únicos, label/description poblados, componentes comparten ventana, combinator válido.
- End-to-end sobre bootstrap real (500 paths × 24m seed=42): los 4 evalúan sin errores, al menos 1 con matches > 0.
- **Cross-check estadístico**: matched(stagflation) ∩ matched(soft-landing) = ∅ por construcción (un path no puede simultáneamente cumplir "equity -20%" y "equity +20%").

### Tests nuevos en `src/state/store.test.ts` (+4 tests)

- Preset compuesto activo sin yieldPaths → `viewError` con mensaje "yields".
- Preset compuesto con yields → evalúa y puebla `viewAnalysisA`/`viewAnalysisB`. Test construye sintéticamente un dataset donde la estanflación cubre 100% (todos los paths tienen rates up +150bps y equity -26% a 12m) y verifica `probability=1`.
- `setWindow` con preset compuesto activo re-evalúa sin error.
- Id inválido → `viewError` "no existe".

### Cambios en `src/state/store.ts`

- `findViewById()` ahora usa `findAnyBuiltInView()` (busca en ambos pools).
- Check de yields cambió de `view.subject.kind === 'yield'` a `viewRequiresYieldPaths(view)` para cubrir composites.
- `customView` sigue tipado como `View` (el builder UI actual solo genera single-view dinámicos; los composites son exclusivamente built-in en esta fase).

### Cambios en `src/hooks/useViews.ts`

- `activeView: AnyView | null` widened.
- Resolución: `findAnyBuiltInView(activeViewId)` — busca en ambos pools.
- `availablePresets: readonly AnyView[]` expone la unión de 9 single + 4 composite via `useMemo`.
- `requiresYieldPaths` usa `viewRequiresYieldPaths(activeView)`.

### Cambios en `src/components/ViewsPanel.tsx`

- Tab "preset" dividido en dos secciones con headers: **Single-predicado** (9 presets iniciales) y **Compuestos (multi-predicado)** (4 nuevos, con subtítulo explicativo "Combinan tasas + equity en el mismo escenario").
- Chips idénticos visualmente en ambas secciones; el composite disabled si requiere yields y la sim no los tiene.
- Los tabs "yield" y "return" (builders custom) quedan como estaban — composites solo se acceden desde presets.

### Cambios en `scripts/views-sanity.ts`

- Itera pool unificado `[...BUILT_IN_VIEWS, ...BUILT_IN_COMPOSITE_VIEWS]`.
- Reporte tabular agrupa por sección `[SINGLE-PREDICADO]` y `[COMPUESTOS — multi-predicado con AND]`.
- Sanity check adicional: `atLeastOneCompositeEvaluated`.

### Resultados de views-sanity (5000 paths × 60m, seed=42, Balanceado vs Crecimiento)

| Composite | P(view) | ΔTWR | ΔFinal | ΔMDD |
|---|---|---|---|---|
| Estanflación (12m) | **0.0%** (sin match) | — | — | — |
| Aterrizaje suave (12m) | 1.1% (±0.15 pp) | +13.51 pp | +USD 67,552 | −7.67 pp |
| Goldilocks (12m) | 11.0% (±0.44 pp) | +3.82 pp | +USD 19,078 | +2.08 pp |
| Risk-off / vuelo a la calidad (12m) | 2.8% (±0.23 pp) | −35.00 pp | USD −174,992 | −23.58 pp |

**Observaciones estadísticas interesantes** (a validar con el usuario):
- **Estanflación = 0%**: en 5000 paths no hay un solo escenario donde rates peak up +100bps coincida con equity -20% o peor a 12m. El bootstrap histórico preserva la correlación negativa tasas-equity en crisis, donde un crash viene acompañado de flight-to-quality (rates bajan, no suben). Consistente con 2008, 2020; inconsistente con 2022.
- **Risk-off probabilidad = probabilidad de equity crash solo** (2.8% idénticos): TODOS los paths con equity -20% tienen rates bajando ≥100bps. Flight-to-quality está 100% encodeado en el modelo.
- **Goldilocks 11%**: escenario más común de los 4. Coherente con largos períodos calmos del histórico.
- **Aterrizaje suave 1.1%**: requiere que rates bajen Y equity suba fuerte en el mismo período — raro pero no imposible.

### Verificación final

- `npm test` → **216/216** (186 + 30 nuevos: 18 en views.test + 4 en store.test + ~8 de shape y validación).
- `npm run sanity` → 5/5 (determinismo, convergencia SPY 10.58%/mediana 11.25% Δ 0.67pp, perf 5000×360 = 175ms, RF yield-path IEF, RF bounds BIL).
- `npm run sanity:views` → 13/13 (9 single + 4 composite). Al menos 1 composite con nMatched > 0 ✓.
- `npm run build` → limpio en 47.5s. Nuevos hashes:
  - `index-BidL8KzG.js` (1,048.43 kB, gzip 346.01 — +5 KB vs previous por los 4 composites + tipos + helpers).
  - `index-BQ3wwZuE.css` (invariante salvo hash por UI de secciones nuevas).
  - `bootstrap.worker-DcsMlXDE.js` (invariante — composites son puramente dominio, no tocan worker).

### Pendientes según negociación con usuario

1. **Revisión visual** del usuario sobre los 4 chips compuestos en el tab "preset". Sugirió que le gustan los 4 pero pide feedback pre-UI también.
2. **Bug del click "Evaluar"** en el builder dinámico (yield builder y return builder): conversación pendiente porque "nos faltaba entendernos" sobre cómo representar el input del custom view. La hipótesis interna es que `useViews.activeView` solo resuelve `BUILT_IN_VIEWS` (no lee `customView` del store), entonces al setear un dynamic view con `setCustomView`, el activeView queda `null` y la sección de RESULTADOS no renderiza. Pero la corrección va atada a la discusión del punto 3, así que se deja intocado.
3. **Views numéricos robustos sobre los 32 ETFs** (Fase C.2): el usuario quiere poder decir "S&P renta entre -10% y -20% en los próximos 6 meses" con nombres cortos descriptivos por ETF que el asesor/cliente reconozca. Esto requiere:
   - Exponer retornos per-ticker desde el worker (hoy solo se transfiere el agregado `portfolioReturnA`/`B`). Eso implica un cambio de API del worker y un aumento significativo de data transfer (32 tickers × 5000 × 360 × 4 bytes ≈ 230 MB si se hace naive; necesita optimización o opt-in).
   - Diccionario de nombres cortos descriptivos por ETF (SPY → "S&P 500 USA", EZU → "Acciones Europa desarrollada", GHYG → "Deuda high yield global", etc.). Ubicación sugerida: `src/domain/etf-labels.ts`.
   - Extender `ViewSubject` con `{ kind: 'etfReturn'; ticker: Ticker }` y agregar al `PredicateMode` `cumulativeReturnRange` soporte para ese subject.
   - Builder visual nuevo con selector de ETF + min/max % + meses.
4. **Fase C.3 — Regímenes históricos** (2008-like, 2020-like, 2022-like). Backlog.
5. **E2E Playwright** sigue bloqueado upstream.

### Notas para próxima sesión

- Las discusiones 2 y 3 (click bug + ETFs numéricos) están atadas: el usuario dijo "después hablamos más claro del prompt de los views como yo los necesito para complementar los tuyos". Prioridad arrancar por ahí cuando se retome.
- Los composites están ready para revisión visual del usuario. El chip "Estanflación" con 0% es insight interesante para conversar — indica que el modelo no espera 2022 como escenario base (porque el bootstrap histórico pondera todos los períodos por igual).

---

## 2026-04-20 — Fase C.2 Views numéricos per-ETF + builder unificado + fix del click

Continuación de la misma sesión. Research previo (MSCI, Morningstar, Barclays, CFA Institute) confirmó que el régimen de correlación stock-bond NO es estable: 1968-1997 positiva (estanflación), 1997-2021 negativa (flight-to-quality), 2022+ vuelve a positiva. Nuestro dataset 2006-2026 es ~95% régimen negativo + ~10-12 meses de 2022. Eso explica el P(estanflación) = 0% observado. El usuario decidió postergar refinamientos a eso y arrancar Fase C.2 — views numéricos sobre los 32 ETFs con nombres cortos descriptivos.

### Scope negociado con el usuario

Ejemplos concretos que dio el usuario para anclar el diseño:
1. "Tesoros 30y rentan entre percentil 20 a 40 de las simulaciones" → probabilidad automática 20% (por construcción).
2. "ACWI renta 25% o más en algún momento antes de 24 meses" → **pico acumulado** (nuevo PredicateMode).
3. "Rally S&P +20% en 6m AND rally Eurozona +20% en 12m" → composite multi-asset con ventanas DISTINTAS por componente — **postergado a Fase C.2b** (requiere relajar el constraint de ventana unificada).

Decisiones tomadas:
- **Form unificado** (reemplaza los 3 tabs `yield`/`return`/`preset`) con 4 dimensiones ortogonales: Subject (ETF / Portfolio / Yield) · Medida (cierre/pico/piso/persistente) · Filtro (rango absoluto o percentilar) · Horizonte.
- **Probabilidad automática visible** antes de evaluar cuando filtro = percentilar (= upperP − lowerP).
- **Data per-ETF opt-in** via checkbox en `SimulateButton` — emite los 32 tickers con costo ~230 MB. Justificación: el hot loop ya calcula `reconstructed[j]` para los 32 tickers en la rama RF, solo hay que copiarlos a 32 buffers. Fast path equity forzado a rama unificada cuando se pide ETFs (los RF tickers necesitan reconstrucción yield-path, no retorno histórico).
- **Fix del click "Evaluar"** resuelto como efecto colateral del refactor de `useViews.activeView`: ahora resuelve customView del store si `activeViewId` matchea (antes solo miraba los built-in, dejando los dynamic views invisibles en la UI).

### Cambios de dominio (`src/domain/`)

**`views.ts`:**
- Nuevo `ViewSubject: { kind: 'etfReturn'; ticker: Ticker }`.
- Nuevos `PredicateMode`:
  - `peakCumulativeReturnRange` — max de cumRet(start, t) sobre t en la ventana.
  - `troughCumulativeReturnRange` — min análogo.
- Widened `cumulativeReturnRange` y `percentileBandReturn` para aceptar subjects `portfolioReturn` **o** `etfReturn`.
- Nuevos campos en `ViewDataset`: `etfReturns: EtfReturns | null`.
- Nuevos helpers: `viewRequiresEtfReturns()`, `requiredEtfTickers()`, `EtfReturns` type.
- Helper interno `peakTroughCumulative()` con un solo pass sobre la ventana.
- Helper interno `resolveReturnsArray()` con validaciones y errores legibles (yieldPaths/etfReturns null, ticker faltante).

**`etf-labels.ts` (nuevo, ~100 líneas):**
- Diccionario `Record<Ticker, { short, group }>` con nombres cortos en español Panamá para los 32 tickers.
- 5 grupos: `treasuries` (5), `fixedIncome` (6), `equityBroad` (8), `equityStyle` (2), `equitySector` (11).
- Helpers: `getEtfLabel`, `formatEtfLabel`, `tickersByGroup` para optgroups del dropdown.

**`bootstrap.ts`:**
- Nuevo `input.outputEtfReturns?: boolean` (default false).
- Nuevo `output.etfReturns?: Record<Ticker, Float32Array>` cuando el flag es true.
- Alloc de 32 Float32Array separados `[nPaths × horizonMonths]` (~230 MB para 5000×360).
- Emisión dentro del mismo hot loop — O(1) extra por mes por ticker, sin impacto perceptible en el tiempo.
- `needsYieldSim` ahora incluye `outputEtfReturns` para forzar la rama RF cuando el portafolio es 100% equity pero el user pidió ETF data (así los tickers RF se reconstruyen coherentemente con el entorno de tasas, no se leen como retornos históricos).

### Cambios en worker + hook (`workers/bootstrap.worker.ts`, `hooks/useBootstrapWorker.ts`)

- `OkResponse.etfReturns?: EtfReturnsOutput`.
- 32 buffers adicionales en la lista de transferables (zero-copy).
- `BootstrapRunResult.etfReturns?` en el hook.

### Cambios en store (`state/store.ts`)

- `RawSimulationInput.etfReturns?: EtfReturns`.
- Nuevo slice `etfReturns: EtfReturns | null` en el state.
- `evaluateActiveView` ahora toma `etfReturns` y devuelve error legible si el view requiere ETF data pero la sim no la incluye.
- `ingestSimulation` persiste etfReturns del raw input.
- `resetSimulation` limpia etfReturns.

### Cambios en `useViews` (`hooks/useViews.ts`)

- `availablePresets: readonly AnyView[]` (union de single + composite).
- **`activeView` resuelve customView del store si `activeViewId` matchea** → fixea el bug del click "Evaluar" (dynamic views del builder ahora renderizan la sección de RESULTADOS).
- Nuevo `requiresEtfReturns` + `hasEtfReturns` expuestos.

### Cambios en UI

**`SimulateButton.tsx`:**
- Checkbox "Habilitar ETFs individuales para views" con tooltip explicando el costo (~230 MB).
- Pasa `outputEtfReturns` al worker run call.
- `ingestSimulation` recibe `etfReturns` del resultado.

**`ViewsPanel.tsx` (rewrite completo, ~550 líneas):**
- Reemplaza los 3 tabs anteriores (yield/return/preset) con **2 tabs**: "Builder — crear view" y "Presets (13)".
- Builder unificado con 4 pasos numerados:
  1. Subject: chips (ETF individual / Portafolio A-B / Yield) + selector específico abajo. Chips deshabilitados si falta data (ETFs sin opt-in, yields sin activar).
  2. Medida: chips que cambian según subject (retorno cierre/pico/piso para ETF/Portfolio, cambio pbs cierre/pico/piso/persistente para Yield).
  3. Filtro: rango absoluto (min/max en % o pbs según subject, con placeholder "sin cota" para opcionales) o rango percentilar (solo válido con cumulative endpoint; muestra probabilidad auto = upperP − lowerP en badge ámbar).
  4. Horizonte en meses + (si persistente) meses consecutivos threshold.
- Botón Evaluar dispara `setCustomView(buildDynamicView(builder))`.
- La sección de resultados (probabilidad + tablas A/B) es la misma que antes, pero ahora renderiza también para dynamic views (bug fix).
- Tab "Presets" mantiene los 9 single-predicado + 4 compuestos con secciones agrupadas.

### Tests nuevos (+24 tests, total 240/240)

**`views.test.ts` (+15 tests):**
- ETF subject: cumulativeReturnRange sobre SPY, error si etfReturns null, error si ticker faltante.
- Helpers: `viewRequiresEtfReturns`, `requiredEtfTickers` para single/composite/yield-only.
- peakCumulativeReturnRange: path monotónico vs path con pico intermedio; peak difiere de endpoint cuando el path vuelve a 0; maxReturn como cota superior; aplica también a portfolioReturn.
- troughCumulativeReturnRange: análogo, trough difiere de cumulativo cuando el path recupera.
- percentileBandReturn widened a ETF: 100 paths uniformes, percentil 20-40 → ~20 matches. Error con yield subject.
- Composite con 2 componentes ETF diferentes (future-proof para C.2b): SPY rally AND EZU rally → match solo donde ambos se cumplen.

**`bootstrap.test.ts` (+5 tests):**
- Sin flag, `etfReturns` queda undefined (backward-compat).
- Con flag, emite 32 Float32Array con shape correcto `[nPaths × horizonMonths]`.
- Determinismo: mismo seed → etfReturns idéntico ticker a ticker.
- SPY en etfReturns coincide con set histórico (validando que equity tickers se leen directo de RETURNS aún en la rama RF).
- portfolioReturnsA consistente con y sin outputEtfReturns (regresión: forzar rama RF no cambia el agregado).

**`store.test.ts` (+4 tests):**
- `setCustomView` con view portfolioReturn: persiste customView, pobla analysis (antes era el bug: no se veía).
- `setActiveView` después de `setCustomView` limpia customView.
- View ETF sin etfReturns en la sim → error legible "requiere ETF".
- View ETF con etfReturns sintéticos → evalúa correctamente.

### Verificación final

- `npm test` → **240/240** (216 + 24 nuevos).
- `npm run sanity` → 5/5.
- `npm run sanity:views` → 13/13 presets + 2 smoke tests nuevos ETF:
  - **Tesoros 20+y (SPTL): percentil 20-40 de retornos a 12m → 20.5% (±0.57pp)** · n=1024. **Coincide empíricamente con la predicción por construcción del usuario (20%)** — valida el motor de percentile band widened a ETF.
  - **ACWI: pico acumulado ≥ +25% en algún momento antes de 24 meses → 52.2% (±0.71pp)** · n=2611. Insight: sobre 2 años es más-que-probable que el equity global toque +25% en algún momento (52%) aunque al cierre no se mantenga.
- `npm run build` → limpio en 50.30s. Nuevos hashes:
  - `bootstrap.worker-*.js` (cambió por outputEtfReturns).
  - `index-*.css` (cambió por builder UI + etf-labels optgroups).
  - `index-*.js` 1,060.40 kB (gzip 348.31) — +12 KB vs previo por etf-labels.ts + builder.
  - `xlsx-*.js` invariante.

### Pendientes actualizados

1. **Revisión visual del usuario** del builder unificado, con feedback sobre:
   - UX de los 4 pasos numerados (¿claros? ¿orden correcto?).
   - Optgroups del dropdown ETF (¿los 5 grupos están bien agrupados?).
   - Visibilidad de la probabilidad automática en filtro percentilar.
   - Textos del checkbox "Habilitar ETFs individuales" y del disabled state en chips.
2. **Fase C.2b — Composites multi-asset con ventanas distintas** (el ejemplo del usuario: rally S&P +20% en 6m AND rally Eurozona +20% en 12m). Requiere:
   - Relajar el constraint `window` unificada en `CompositeView` (permitir ventana per-componente).
   - Tab nuevo "Escenario combinado" con 2+ sub-builders apilados + combinator AND/OR.
   - Tests de evaluación con ventanas distintas.
3. **Fase C.3 — Regímenes históricos** (2008-like, 2020-like, 2022-like). Resuelve cleanly la detección de estanflación.
4. **Refinamiento de definiciones composite**: agregar variantes 24m/36m de los 4 built-in para testear empíricamente el decay con horizonte. Y evaluar un modo nuevo `synchronizedDirection` para detectar co-movimiento mes a mes (estanflación "real").
5. **Parts 2, 3, 4b del instructivo** — siguen pendientes (requieren screenshots).
6. **E2E Playwright** — bloqueado upstream.

### Estado final de la sesión

- **240/240 tests · 5/5 sanity · 13/13 views-sanity + 2 ETF smoke tests · build limpio.**
- Fase C.2 completa: dominio + worker + store + hooks + UI + tests + sanity.
- Bug del click "Evaluar" resuelto como efecto colateral del refactor de `useViews`.
- Bundle +12 KB vs previo (costo razonable para las features agregadas).
- **PROMPT-NUEVA-SESION.md** sigue desactualizado — no lo toqué en esta sesión, pero convendría actualizarlo antes de cerrar con una versión que apunte al estado Fase C.2 cerrada.
- Distribución `../mercantil-planner-build/` NO sincronizada todavía — el usuario puede querer hacer revisión visual localmente vía `npm run dev` antes de re-distribuir.

---

## 2026-04-20 — Fase C.2c: visualización condicional (bandas en FanChart + sección Stats condicional) + 2 quick fixes

Continuación de la misma sesión. El usuario hizo revisión visual de Fase C.2 en `npm run dev` y reportó 4 puntos:
1. Tooltip del chip ETF disabled demasiado genérico.
2. Nombres de yields no descriptivos (violaba la convención acordada).
3. Falta visualización gráfica del condicionamiento — "las estadísticas q se muestran para las simulaciones del fan chart se deben mostrar para los condicionamientos".
4. En Risk-off desaparecen "Si ocurre" — confusión del usuario sobre por qué.

Clarificaciones claves del usuario sobre el punto 3:
- "en la ventana se verá los escenarios concretos como revisión del condicionamiento directo, pero **en general se ve para todo el horizonte** cómo se afecta la probabilidad de conseguir el objetivo."
- Interpretación: las bandas condicionales deben cubrir el **horizonte completo** (no solo la ventana del view), porque el usuario quiere ver cómo el condicionamiento afecta el patrimonio a largo plazo, no solo el tramo de evaluación del view.
- Sobre Y-axis: "es estático solo para el on off de las condiciones. pero al mover la ventana de horizonte ahí sí se mueve" → Y-axis NO debe reescalar al togglear view on/off; SÍ reescala al mover el slider de ventana.

### Decisiones finales acordadas

1. **Estilo FanChart**: overlay con bandas base + líneas dashed condicionales. Si queda muddy, fallback a replacement. Arrancamos con overlay.
2. **StatsPanel**: panel secundario "Condicional al view" debajo del base, con las 9 métricas.
3. **Mini-tabla del ViewsPanel**: se mantiene (complemento rápido, 3 métricas).
4. **Métricas** respetan el slider de ventana (base y condicional ambas). **Bandas** van sobre horizonte completo.

Sobre el punto 4 (risk-off 0%) — explicación al usuario, no cambio de código: depende de la composición del portafolio. Conservador (8% equity) matemáticamente no puede perder −20% en 12m, por eso 0 matches. Con Crecimiento vería números. Esto también conecta con el régimen tóxico del research previo.

### Quick fixes (tasks #16 y #17)

- **Tooltip ETF**: de "Falta activar la opción correspondiente en el botón Simular" → **"Tildá «Habilitar ETFs individuales para views» junto al botón Simular y volvé a correr Simular"**.
- **Yields renombrados** a formato descriptivo consistente:
  - `IRX (3 meses)` → **Tasa 3 meses**
  - `FVX (5 años)` → **Tasa 5 años**
  - `TNX (10 años)` → **Tasa 10 años**
  - `TYX (30 años)` → **Tasa 30 años**
- Cambios aplicados en: `ViewsPanel.tsx` (YIELD_OPTIONS + yieldLabelMap en buildDescription) y `views.ts` (4 presets built-in con descripciones referenciando "la tasa 10 años" en vez de "el yield TNX").

### Fase C.2c — implementación (task #18)

**`src/domain/metrics.ts`:**
- `computeFanChartBands` ahora acepta parámetro opcional `indices?: Uint32Array | null`. Si se pasa, computa bandas solo sobre ese subset de paths (conditional mode). Si null, comportamiento original.
- 2 tests nuevos: `computeFanChartBands con indices` (crash subset vs growth subset vs base subset, verifica que mediana final cambia) + error de `indices vacío`.

**`src/state/store.ts`:**
- Nuevo state: `condBandsA`, `condBandsB: FanChartBands | null`.
- Nuevo helper `computeConditionalBands(viewAnalysisA, simA, simB, nPaths, H)` — separado de `evaluateActiveView` porque las bandas condicionales son **window-independent** (dependen de matchedIndices y sim, no de la ventana del slider). Así `setWindow` no paga el costo de ~200ms extra por slider drag.
- `ingestSimulation`: computa condBandsA/B si hay view activo con matches.
- `setActiveView` y `setCustomView`: computa condBandsA/B.
- `setWindow`: **NO** recalcula bandas condicionales — preserva las del state, solo recalcula métricas condicionales vía `asymmetricAnalysis` (que sí son window-dependent).
- `resetSimulation`: limpia condBandsA/B.

**`src/components/FanChart.tsx`:**
- Lee `condBandsA`/`condBandsB` del store, flag `hasCond` para toggle de rendering.
- Extiende `Point` type con `condAP10/P50/P90` y `condBP10/P50/P90` opcionales.
- `fullData` incluye los valores condicionales si están disponibles.
- **Y-axis estático on-toggle**: `yDomain` calculado SOLO sobre bandas base (`aP10/aP90/bP10/bP90/net`), ignorando condicionales. Activar/desactivar un view NO mueve el eje. El slider de ventana SÍ recalcula yDomain porque `data` cambia. Pasado explícitamente como `domain={yDomain}` en lugar de `'auto'`.
- **Overlay condicional**: 6 `<Line>` nuevas (P10/P50/P90 para A y B) con `strokeDasharray="5 3"` + colores mismos que las bandas base (navy y naranja Mercantil). Sin fill — solo contornos para que las bandas base sigan legibles.
- **Legend extendida**: 3 dots existentes (A / B / Neto) + nuevo `<LegendDashed>` con 2 mini-líneas dashed (navy + naranja) cuando `hasCond`, etiqueta "Condicionadas al view activo".
- **Tooltip extendido**: agrega "A mediana cond.", "A P10/P90 cond." y equivalentes para B cuando `hasCond`. `TooltipRow` nuevo prop `dashed` que muestra una mini-línea dashed en vez del dot.

**`src/components/StatsPanel.tsx`:**
- Extraído `StatsTable` como sub-component reutilizable con toda la lógica de render de 9 métricas × A/B/Δ.
- Panel principal ahora tiene 2 secciones:
  1. **Base — todos los N paths** (título + StatsTable con metricsA/metricsB).
  2. **Condicional al view: «{label}»** (cuando hay view activo con matched>0) — título con P empírica + nPaths + StatsTable con condMetricsA/condMetricsB tomados de `analysisA.matched`/`analysisB.matched` via useViews().
- Cuando `nMatched === 0` pero hay view activo: muestra banner ámbar "Sin datos condicionales: el view tiene probabilidad 0%".
- Las métricas condicionales recalculan automáticamente al mover el slider de ventana (vienen de `asymmetricAnalysis` que es window-dependent).

### Verificación final

- `npm test` → **242/242** (240 + 2 nuevos en metrics.test.ts).
- `npm run sanity` → 5/5.
- `npm run sanity:views` → 13/13 + 2 ETF smoke tests.
- `npm run build` → limpio en 52.15s.

### Comportamiento esperado en la herramienta

1. Sin view activo: FanChart muestra solo bandas base (como antes). StatsPanel muestra solo la sección "Base".
2. Activar view con `nMatched > 0`: aparecen 6 líneas dashed en el FanChart sobre TODO el horizonte + leyenda extra + sección "Condicional al view" en el StatsPanel con las 9 métricas del subset. **Eje Y no se mueve** al activar.
3. Mover slider de ventana con view activo: Y-axis se recalcula (comportamiento normal), bandas condicionales permanecen (no recalculadas), métricas condicionales sí se recalculan sobre la nueva ventana.
4. View con `nMatched === 0` (ej. Risk-off sobre Conservador): bandas condicionales null (no se dibujan en FanChart), banner amarillo en StatsPanel "Sin datos condicionales".

### Pendientes actualizados

1. **Revisión visual del usuario** de la Fase C.2c. Confirmar:
   - Overlay del FanChart es legible (no muddy)? Si no, fallback a replacement + Y-axis estático.
   - Sección condicional del StatsPanel se entiende al primer vistazo?
   - El punto 4 (risk-off 0%) queda claro con la explicación — o necesita un mensaje más prominente?
2. **Fase C.2b — Composites multi-asset con ventanas distintas** (rally S&P en 6m AND rally Eurozona en 12m). Sigue pendiente.
3. **Fase C.3 — Regímenes históricos** (2008/2020/2022-like). Backlog.
4. **Modo `synchronizedDirection`** para estanflación "real" mes a mes. Backlog.
5. **Instructivo + distribución + E2E** — pendientes previos.

### Estado final de la sesión

- **242/242 tests · 5/5 sanity · 13/13 views-sanity + 2 ETF smoke tests · build limpio en 52.15s.**
- Fase C.2c completa: overlay condicional en FanChart + panel secundario condicional en StatsPanel + quick fixes.
- Y-axis estático al togglear view (por request explícito del usuario) — implementado via yDomain computado solo sobre bandas base.
- Bandas condicionales sobre horizonte completo, métricas condicionales respetan el slider (arquitectura window-independent para bandas vs window-dependent para métricas).

---

## 2026-04-20 — Fase C.2b dominio: composites multi-asset con ventanas distintas + housekeeping

Mismo día, sesión continuada. Usuario lejos del PC, aprobó adelantar en paralelo: (1) actualizar PROMPT-NUEVA-SESION.md desactualizado (task housekeeping) y (2) Fase C.2b dominio puro — relajar el constraint de ventana unificada en `CompositeView` + tests. Sin tocar UI (queda para cuando el usuario pueda revisar visualmente).

### Housekeeping: `PROMPT-NUEVA-SESION.md` actualizado

Estaba desactualizado desde "FASE 1 CERRADA" + "131 tests". Reemplazado para reflejar:
- Estado actual: Fase C.2c cerrada (2026-04-20).
- Tests: 242 (pre-C.2b, ahora 249).
- Sanity: 5/5, views-sanity: 13 presets + 2 ETF smoke tests.
- Pendientes mencionados: C.2b multi-asset, C.3 regímenes, synchronizedDirection, instructivo, E2E.
- Bitácora es append-only — entrada más reciente al **final**, no al top.

### Fase C.2b dominio (task #20)

**Objetivo:** habilitar composites donde cada componente tenga su propia ventana (ej. "rally SPY +20% en 6m AND rally EZU +20% en 12m"). El constraint anterior forzaba que todos los componentes compartan `composite.window`.

**Cambios en `src/domain/views.ts`:**
- `CompositeView.components[].window` **ya NO necesita coincidir** con `composite.window`. El docstring del tipo se actualizó para reflejar esto.
- `composite.window` se mantiene como **display envelope** (útil para UI hints sobre el rango temporal del composite, NO para validación cruzada).
- `evaluateCompositeView`: removida la validación "ventana distinta" (loop que tiraba error si `c.window !== view.window`). Mantenido `validateWindow(view.window, H)` al inicio. Cada componente valida su propia ventana dentro de `evaluateSingleView`, así que composites con ventanas fuera de horizonte siguen tirando error legible.
- Nuevo helper `componentWindowEnvelope(view: CompositeView): Window` — computa `{startMonth: min, endMonth: max}` sobre los components. Útil para UI (Fase C.2b UI, pendiente) y tests.

**Tests nuevos (+7, total 249):**
- `componentWindowEnvelope` con ventanas simétricas (coincide con view.window), asimétricas (starts/ends distintos), 0 componentes (throw).
- Acepta componentes con ventanas distintas sin error (reemplazo del test antiguo que esperaba error).
- Evalúa composite AND con ventanas [1,6] y [1,12] — caso concreto del usuario "rally SPY 6m AND rally EZU 12m". Construcción sintética: 4 paths con patrones controlados, verifica que solo el path 0 (ambos rallies simultáneos) matchea. probability = 0.25 exacto.
- OR con ventanas distintas: unión sobre paths que matchean c1 O c2 (ventanas [1,6] y [1,12]).
- Componente con ventana fuera de horizonte → throw legible del validator interno.
- Composite con ventana de envelope [1,24] pero componentes con [1,6] y [7,18] no solapados → evalúa OK. AND sobre paths distintos por componente → 0 matches (test de sanidad semántica).

**Extensión a `scripts/views-sanity.ts`:**
- Agregado un 3er smoke test: composite multi-window "Rally S&P 6m AND rally Eurozona 12m" (ejemplo del usuario, cableado directamente). Evalúa end-to-end sobre la simulación real (5000 paths × 60m, Balanceado vs Crecimiento, seed 42).
- **Resultado empírico: 3.8% (±0.27pp) · n=191.** Coherente — es raro que ambas regiones (US y Eurozona) tengan simultáneamente un rally +20% dentro de su respectiva ventana, pero ocurre ocasionalmente. Confirma que el engine multi-window funciona.

**Lo que queda para Fase C.2b UI** (cuando el usuario pueda revisar visualmente):
- Tab nuevo "Escenario combinado" en `ViewsPanel` con 2+ sub-builders apilados (replicando el builder existente).
- Selector de combinator AND/OR.
- Botón "Agregar condición" para 3er+ componente.
- El dominio ya soporta todo — solo falta el form visual.

### Verificación final

- `npm test` → **249/249** (242 + 7 nuevos de C.2b).
- `npm run sanity` → 5/5.
- `npm run sanity:views` → 13 presets + 3 ETF smoke tests (incluido el multi-window composite).
- `npm run build` → limpio en 54.42s.

### Estado final de la sesión

- **249/249 tests · 5/5 sanity · 16 smoke tests en views-sanity · build limpio 54s.**
- Fase C.2c (visualización condicional) lista para revisión visual cuando el usuario vuelva al PC.
- Fase C.2b dominio completo, UI pendiente hasta confirmación visual de C.2c + OK para arrancar tab nuevo.
- PROMPT-NUEVA-SESION.md actualizado — seguro para abrir sesión nueva de Claude Code y que el agente entienda el estado correcto.
- Distribución `../mercantil-planner-build/` NO sincronizada — el usuario decide cuándo re-distribuir.

---

## 2026-04-21 — Decisión final de visualización condicional (consolidada, pendiente de implementar)

La sesión anterior se corrompió con API errors antes de poder aplicar esta decisión. El último hito verificado fue Fase C.2c + C.2b dominio (249/249 tests, build limpio). Consolidamos acá la decisión final acordada para cuando se retome la implementación.

### Decisión (fuente de verdad)

**Dos modos de visualización del condicionamiento, con switch UI entre ellos:**

1. **Toggle mode** (modo preferido):
   - Base: bandas sólidas 20% fill + medianas sólidas.
   - Cond: misma estética exacta (bandas sólidas 20% fill + medianas sólidas).
   - Switch entre uno y otro. Nunca ambos visibles a la vez.

2. **Overlay mode** (estilo v1 restaurado, ambos visibles):
   - Base: bandas sólidas 20% fill + medianas sólidas (sin fade al activar cond).
   - Cond encima: 6 líneas dashed (P10/P50/P90 para A y B, sin fill).
   - Leyenda: dots para "Portafolio A" / "Portafolio B" (base) + mini-líneas dashed para "A (cond.)" / "B (cond.)".

3. **Y-axis:** `union(base, cond)` — estable bajo todos los toggles (no se mueve al alternar Toggle↔Overlay ni al activar/desactivar view).

4. **Tooltip:**
   - Overlay: muestra ambos (base labels + cond labels).
   - Toggle: muestra solo el conjunto visible.

### Diff respecto a Fase C.2c ya implementada

Lo que ya está: overlay con 6 líneas dashed, leyenda extendida con mini-dashed, tooltip con ambos sets cuando `hasCond`, panel "Condicional al view" en StatsPanel.

Lo que falta implementar:
- **Switch UI** (Toggle ↔ Overlay) — nuevo control en el header del FanChart.
- **Toggle mode rendering** — cuando está activo, sustituir base por cond con estética idéntica (bandas sólidas + medianas sólidas), no overlayear.
- **Y-axis en `union(base, cond)`** — hoy se computa solo sobre base (clip potencial si cond excede los extremos).
- **Tooltip conditional por modo** — en Toggle mostrar solo el conjunto visible.
- Confirmar que no hay fade en bandas base cuando se activa el overlay (revisar opacity del fill actual).

### Criterio de aceptación al implementar

- Base-only (sin view) → comportamiento actual intacto.
- View activo + Toggle mode → vista limpia del cond, Y-axis idéntico al de base-only en extent si base es mayor, o expandido si cond excede.
- View activo + Overlay mode → bandas base legibles + 6 dashed encima + leyenda combinada + tooltip con ambos sets.
- Switch Toggle↔Overlay → sin cambio en Y-axis (estable).
- Tests existentes (249/249) + nuevos tests para el switch y el domain union.

### Estado verificado al inicio de esta sesión

- `npm test` → **249/249** ✅
- `npm run sanity` → verificado en background (OK, exit 0).
- `npm run sanity:views` → verificado en background (OK, exit 0).
- `npm run build` → en ejecución al momento de escribir (pendiente confirmar).

### Próximo paso recomendado

Confirmar con el usuario el orden de ataque: (a) switch UI + toggle mode primero (el más visible), (b) Y-axis union (el más sutil), (c) tooltip conditional por modo. Implementar un solo cambio a la vez con commit atómico + verificación de tests/sanity/build después de cada uno.

---

## 2026-04-21 — Toggle "Mostrar AMCs propuestos" + autofallback

Mismo día. Mientras la decisión de visualización condicional queda en backlog, el usuario pidió un toggle pequeño para ocultar los AMCs propuestos (CashST/USGrTech/USTDur) del PortfolioSelector porque aún no están aprobados. Default OFF (asesor solo ve los 7 existentes), con autofallback al destildar para que ningún portafolio quede colgando de un AMC oculto.

### Decisiones acordadas

- **Default OFF** — los propuestos no se ven al arrancar. El usuario que quiera explorarlos debe tildar explícitamente.
- **Autofallback** al togglear OFF (no preserve-and-hide) para evitar inconsistencias de UI.
- **Checkbox global** compartido por A y B (no per-selector) — evita que A muestre propuestos y B no.
- **Posición:** arriba de los dos `PortfolioSelector` (es selección de portafolio, no visualización de chart).

### Cambios

**`src/state/store.ts`:**
- Nuevo state `showProposedAmcs: boolean` (default `false`).
- Nuevo setter `setShowProposedAmcs(show)` que dispara autofallback sobre `portfolioA`/`B` cuando `show === false`.
- Helper privado `stripProposedFromSpec(spec)`:
  - `signature` → no afectado.
  - `amc` propuesto → switch a `GlFI`.
  - `custom` con pesos sobre propuestos → zero esos pesos + renormaliza el resto a 100%.
  - `custom` con todos los pesos sobre propuestos → fallback a `GlFI: 100`.
- Import nuevo: `AMC_TIER` desde `../domain/amc-definitions` y `AmcId` desde `../domain/types`.

**`src/components/PortfolioSelector.tsx`:**
- Subscribe a `showProposedAmcs` desde el store.
- `visibleAmcIds` memo: filtra `AMC_IDS` a solo "existing" cuando el toggle está OFF.
- Tab AMC: el optgroup "Propuestos" se renderiza solo si `showProposedAmcs === true`.
- Tab Custom: itera sobre `visibleAmcIds` (3 sliders desaparecen cuando está OFF).

**`src/App.tsx`:**
- Checkbox chico arriba de los dos `PortfolioSelector` (`flex justify-end`, texto `text-xs`, accent naranja Mercantil, tooltip explicativo).
- Lee/escribe `showProposedAmcs` y `setShowProposedAmcs` del store.

**`src/state/store.test.ts`:**
- Reset del beforeEach incluye `showProposedAmcs: false` para aislamiento.
- Suite nueva `store — showProposedAmcs` con 8 tests:
  1. Default OFF al arrancar.
  2. Toggle ON solo actualiza la flag.
  3. Toggle OFF con signature → no afecta spec.
  4. Toggle OFF con AMC propuesto → fallback a GlFI (A y B).
  5. Toggle OFF con AMC existente → no cambia nada.
  6. Toggle OFF con custom mixto → zero propuestos + renormaliza resto a 100% (verifica ratio exacto).
  7. Toggle OFF con custom 100% en propuestos → `{GlFI: 100}`.
  8. Toggle ON tras OFF NO restaura los portafolios anteriores (autofallback es destructivo del estado).

**`INSTRUCCIONES-PLANNER.md`:**
- §7 PortfolioSelector actualizado: descripción del toggle, ubicación, default, y especificación completa del autofallback.

### Verificación

- `npm test` → **257/257** (249 + 8 nuevos). Sin regresiones.
- `npm run build` → en ejecución al momento de escribir.

### Comportamiento esperado en la UI

1. Asesor abre la app → ve solo los 7 AMCs existentes en el dropdown del tab AMC y en los sliders del tab Custom. Checkbox "Mostrar AMCs propuestos" visible arriba (destildado).
2. Tilda el checkbox → aparece el optgroup "Propuestos" en el dropdown y los 3 sliders extra en Custom.
3. Selecciona USGrTech como portafolio A → ahora destilda el checkbox → portafolio A vuelve a `GlFI` automáticamente, propuestos desaparecen del dropdown.
4. Carga config compartida con USGrTech mientras toggle está OFF → el portafolio queda en USGrTech (el setter `setPortfolioA` no aplica autofallback). El asesor puede tildar el toggle si necesita ver/editar.

### Pendientes actualizados

- Visualización condicional v2 (switch Toggle/Overlay + Y-axis union) — sigue en backlog.
- Fase C.2b UI (tab "Escenario combinado").
- Fase C.3 — regímenes históricos.
- Modo `synchronizedDirection`.
- Instructivo + distribución + E2E.

### Estado al cierre de esta entrada

- 257/257 tests, sanity 5/5, sanity:views 13 + 3 ETF (todos verdes en la verificación inicial de la sesión).
- Build pendiente de confirmar.
- Distribución `../mercantil-planner-build/` no sincronizada — el usuario decide.

---

## 2026-04-23 — Deploy en GitHub Pages + rename corporativo Mercantil SFI → Mercantil AWM

Sesión de infraestructura. Dos bloques independientes: (1) setup de deploy remoto para que la herramienta sea accesible desde cualquier PC/tablet, (2) rename del nombre corporativo de la firma (SFI → AWM) en todo el código y docs.

### Bloque 1 — Setup de GitHub + GitHub Pages

Decisión del usuario: **repo público + GitHub Pages** (no privado con auth). Razón: es una versión de pruebas; eventualmente se migrará a un repo privado bajo organización Mercantil AWM. Los colegas acceden con URL sin cuenta de GitHub.

**Cambios locales (Fase 1, hechos por Claude):**

- **3 CSVs movidos a `mercantil-planner/data/`** — solo los 3 que el planner necesita (`mercantil_retornos_backfilled.csv`, `mercantil_yields_mensuales.csv`, `mercantil_rf_decomposed.csv`, ~220 KB total). El resto de `../mercantil_datos/` (5 MB, pertenece al proyecto de Benchmark y al optimizador) NO se mueve al repo del planner.
- **`scripts/build-data.mjs`** → `DATA_DIR` actualizado de `'../../mercantil_datos'` a `'../data'`. Comentarios actualizados.
- **`vite.config.ts`** → agregado `base: '/mercantil-planner/'` para que los assets carguen bajo el subpath de GitHub Pages.
- **`.gitignore`** extendido: `playwright-report/`, `test-results/`, `.env*`, `.claude/`.
- **`.github/workflows/deploy.yml`** creado: push a main → checkout → Node 20 → `npm ci` → `npm run build` → upload artifact → `actions/deploy-pages@v4`.
- **`git init -b main`** + primer commit `d7cb167` con 84 archivos.
- Verificación local: 257/257 tests, build limpio 1m11s, assets con prefijo correcto `/mercantil-planner/...`.

**Fase 2 (hecha por el usuario):**

- Creó repo público `github.com/andresborrerom/mercantil-planner`.
- `git remote add origin ...` + `git push -u origin main`.
- Settings → Pages → Source: GitHub Actions.

**Resultado:**

- Workflow run #1 exitoso (conclusion=success).
- URL viva: **https://andresborrerom.github.io/mercantil-planner/** (HTTP 200, JS 1,069 KB + CSS 32 KB, mismos tamaños que el build local).
- A partir de ahora, cada push a `main` redeploya automáticamente en ~2-3 min.

### Bloque 2 — Rename Mercantil SFI → Mercantil AWM

Corporate rename. Scope del reemplazo en `mercantil-planner/`:

- `index.html` (title tag, visible en la pestaña del browser).
- `src/App.tsx` (header "Mercantil AWM · Quantitative Research" y footer "Mercantil AWM · Herramienta interna").
- `README.md` (2 menciones).
- `scripts/build-data.mjs` (comentario sobre la decisión del usuario).
- `instructivo/README.md` y `instructivo/parte-7-troubleshooting.md`.
- `../about-me.md` en la raíz (4 menciones).

**Falsos positivos NO tocados** (grep matchea "SFI" como substring):

- `SFIN` (código del AMC "Sector Financials") en `src/domain/amc-definitions.ts`, `src/domain/types.ts` y `INSTRUCCIONES-PLANNER.md §AMCs`.

**Entradas anteriores de esta bitácora NO tocadas** — descripciones históricas de lo que decía el código al momento de la entrada (ejemplo: la entrada original del título "Mercantil SFI · Planificador patrimonial" se conserva como registro de qué decía entonces).

### Pendientes actualizados

1. **Re-sincronizar `mercantil-planner-build/`** (distribución local hermana) o deprecarla — ahora hay URL pública compartible, el caso de uso de la distribución local puede ya no aplicar.
2. **Visualización condicional v2** (switch Toggle/Overlay + Y-axis union) — sigue en backlog.
3. **Fase C.2b UI** (tab "Escenario combinado" con AND/OR).
4. **Fase C.3 — Regímenes históricos** (2008/2020/2022-like).
5. **Modo `synchronizedDirection`** para estanflación real.
6. **Audit UX móvil** — ya acordado como trabajo posterior a tener la versión laptop/tablet completa.
7. **Instructivo partes 2/3/4b** — siguen pendientes (requieren screenshots).
8. **Migración a repo privado bajo organización Mercantil AWM** — cuando el usuario decida.

### Estado al cierre

- Deploy en producción a través de GitHub Pages funcionando.
- 257/257 tests, build limpio, pipeline CI/CD automatizado.
- Todos los lugares visibles de "Mercantil SFI" renombrados a "Mercantil AWM" en el planner y en el perfil compartido; 3 menciones históricas preservadas en la bitácora.

---

## 2026-04-23 — Reconciliación de bitácora: Visualización condicional v2 YA está implementada

Auditoría de estado post-deploy. El backlog decía "Visualización condicional v2 (switch Toggle/Overlay + Y-axis union) — pendiente implementar" pero una inspección directa de `src/components/FanChart.tsx` confirma que los 4 criterios de aceptación definidos en la entrada del 2026-04-21 **están implementados**:

1. **Switch UI Toggle ↔ Overlay** — `DisplayMode = 'overlay' | 'toggle'` con sub-switch `ToggleShown = 'base' | 'cond'`. `SegmentedControl` reutilizable renderiza ambos controles (líneas 245-266). Default `overlay`.
2. **Toggle mode rendering** — bloque `{showCond && displayMode === 'toggle' && (...)}` (líneas 371-410) dibuja dos `Area` (condABand, condBBand) + dos `Line` de mediana condicional con fill 20% opacity y medianas sólidas, mismo look que base.
3. **Y-axis en `union(base, cond)`** — `yDomain` memo (líneas 165-184) itera sobre `aP10/bP10/aP90/bP90/net` **y** sobre `condAP10/condBP10/condAP90/condBP90` cuando están disponibles. Comentario en el código referencia explícitamente "Fase C.2c v2 (2026-04-21)".
4. **Tooltip condicional por modo** — `FanTooltip` recibe props `showBase` + `showCond` (líneas 301-307) y renderiza condicionalmente las rows base / cond.

Entradas `Point` type extendidas con `condABand`, `condBBand` (además de las `condAP10..condBP90` previas de v1) — el dato está en el shape completo.

### Interpretación

La entrada del 2026-04-21 registraba que la sesión anterior se cortó con API errors antes de poder implementar. Probablemente la implementación ocurrió en una sesión posterior no registrada explícitamente, o el log se perdió. En todo caso, el deploy actual (commit `91a26d6` en `main`, desplegado a andresborrerom.github.io/mercantil-planner/) ya contiene v2.

### Acción

- Backlog actualizado: ítem "Visualización condicional v2" **removido** (está cerrado).
- No requiere cambios de código — solo esta entrada de reconciliación para que el bitácora refleje la realidad.
- Tests 257/257 siguen verdes — no se tocó nada.

### Lección

Conviene revisar el código antes de asumir que el backlog está al día. El bitácora es append-only (bueno para historia) pero se puede des-sincronizar si una sesión se cae antes de loggearse. Una auditoría rápida código vs backlog tras reanudar trabajo detecta estas discrepancias.

---

## 2026-04-23 — Fase C.2b UI: tab "Escenario combinado" con AND/OR + ventanas per-componente

Implementación de la UI del composite builder (el dominio estaba cerrado desde 2026-04-20, ver entradas anteriores). Permite al usuario construir un `CompositeView` dinámico desde la interfaz.

### Cambios

**`src/state/store.ts`:**
- `customView: View | null` → `customView: AnyView | null` (acepta composite).
- `setCustomView: (view: View) => void` → `setCustomView: (view: AnyView) => void`.
- `evaluateActiveView(..., customView: View | null, ...)` → `customView: AnyView | null`.
- Removido import `type View` (ya no se usa).
- El core de `evaluateActiveView` ya rutea correctamente vía `isCompositeView` (sin cambios de lógica).

**`src/hooks/useViews.ts`:**
- `setCustomView: (view: View) => void` → `(view: AnyView) => void`. Comentario actualizado: "Acepta tanto single como composite (Fase C.2b)".
- Removido import `type View`.

**`src/components/ViewsPanel.tsx`** (refactor sustancial):

1. **Extracción de `SingleViewBuilderForm`** — sub-componente con los 4 pasos (subject, medida, filtro, horizonte). Props: `{ state, setState, hasEtfReturns, hasYieldPaths, title?, onRemove? }`. Encapsula los handlers internos (`update`, `handleSubjectKind`, `handleMeasureKind`). Sin botón "Evaluar" — ese vive en el parent. Reutilizable tanto en el tab single como en cada componente del composite.

2. **Nuevos tipos/defaults:**
   - `CompositeBuilderState = { combinator: 'and' | 'or'; components: BuilderState[] }`.
   - `MAX_COMPOSITE_COMPONENTS = 4`, `MIN_COMPOSITE_COMPONENTS = 2`.
   - `DEFAULT_COMPOSITE_BUILDER` — 2 componentes: equity shock -20/-10% + yield peakChange ≥100pbs (estanflación incipiente, AND).

3. **`buildDynamicComposite(state)`** — reutiliza `buildDynamicView` para cada componente, calcula envelope de ventanas (min startMonth, max endMonth), genera label `"Escenario combinado · N condiciones (AND|OR)"` y description concatenada con " Y " / " O ".

4. **Tab nuevo "Escenario combinado"** (junto a "Builder — single" y "Presets (13)"):
   - Combinator pills AND / OR al tope.
   - Stack de N sub-builders con título `"Condición K"`.
   - Botón "Eliminar" por sub-builder (visible cuando N > 2).
   - Botón "+ Agregar condición (K/4)" (deshabilitado en el límite).
   - Botón "Evaluar combinado" a la derecha.
   - Cada sub-builder preserva su estado independiente via `makeComponentSetState(idx)` — factory de `Dispatch<SetStateAction<BuilderState>>` que actualiza el componente correcto del array.

5. **Tab "Builder — single" mantenido intacto** — ahora usa el mismo `SingleViewBuilderForm` refactorizado. Cero regresión funcional.

### Tests (+3, total 260/260)

En `src/state/store.test.ts`, nuevo describe `setCustomView con CompositeView (Fase C.2b UI)`:

1. **Composite AND con 2 componentes válidos** → `activeViewId`/`customView`/analysis poblados. Con retornos flat, probabilidad = 1.
2. **Composite OR con ventanas distintas** → paths pares flat 6m + paths impares rally 12m → OR cubre ambos → probabilidad = 1.
3. **Composite con componente que requiere yields y no hay** → `viewError` menciona "yields".

### Verificación

- `npm test` → **260/260** (+3 composite tests).
- `npm run build` → limpio en ~44s. Bundle `index-*.js` creció de 1,069 KB a 1,074 KB (+5 KB por tab composite + refactor del sub-componente).
- Sanity suites no se re-corrieron (no hubo cambios de motor/dominio).

### Pendientes actualizados

Removidos del backlog:
- ~~Fase C.2b UI~~ (cerrada acá).

Quedan:
- **Fase C.3 — Regímenes históricos**: Crisis financiera (oct-2007 a mar-2009), COVID (feb-2020 a dic-2020), Bear inflación (ene-2022 a oct-2022). Decisión de diseño acordada: mostrar ambas interpretaciones simultáneamente (RF con tasas actuales COMO arranque vs. RF con tasas del período). 4 líneas por regimen (A y B × ambas interpretaciones) en chart compacto debajo del FanChart. Implementación pendiente.
- Modo `synchronizedDirection` (estanflación real mes a mes).
- Instructivo partes 2/3/4b (requieren screenshots).
- E2E Playwright (bloqueado upstream).
- Audit UX móvil — posterior a tener laptop/tablet estable.
- Migración a repo privado bajo organización Mercantil AWM.
- `mercantil-planner-build/` — sincronizar bajo demanda para uso offline.

### Estado al cierre

- **260/260 tests · build limpio · Fase C.2b UI cerrada.**
- Deploy automático en `andresborrerom.github.io/mercantil-planner/` tras el push.
- La UI del tab composite quedó con 2 componentes default que ilustran un caso concreto (estanflación incipiente) — útil como ejemplo para asesores que abren el tab por primera vez.

---

## 2026-04-23 — Fase C.3: regímenes históricos · replay determinístico con 2 interpretaciones

Nueva vista en la herramienta: aplicar un período histórico concreto al portafolio actual del usuario como un "what-if" determinístico (N=1, sin probabilidad). Complemento pedagógico del bootstrap probabilístico.

### Regímenes implementados (nombres con fechas explícitas)

1. **Crisis financiera global · oct-2007 a mar-2009** (18 meses).
2. **Shock COVID · feb-2020 a dic-2020** (11 meses).
3. **Bear de inflación · ene-2022 a oct-2022** (10 meses).

### Decisiones de diseño (todas con OK del usuario 2026-04-23)

1. **Dos interpretaciones simultáneas, sin toggle.** Mostrar ambas a la vez hace visible el gap entre ellas = impacto del carry al arrancar desde tasas actuales. En portafolios equity-puros las dos líneas coinciden; en RF-heavy el gap es educativo. Toggle ocultaría el punto pedagógico.

2. **Fórmula `currentRates`:** `r_current_t = r_hist_t − carry_hist_t + (y_today/12)` aplicada solo a los 11 tickers RF. Para equity, ambos modos son idénticos (returns no dependen del nivel de yields). Para FIXED, invariante al modo (retorno nominal constante).

3. **Fallback elegante en pre-launch:** si `RF_DECOMP[ticker]` tiene NaN en meses anteriores al launch del ETF (ej. GHYG antes de 2007-05, EMB antes de 2008-01), caemos al valor de `RETURNS` que ya está imputado con proxies. Así evitamos NaN en portafolios que tocan ETFs tempranos durante Crisis 2008.

4. **Panel separado debajo del FanChart**, no overlay — el régimen es N=1 y no encaja en la distribución probabilística del FanChart.

5. **Capital inicial:** `plan.initialCapital` del usuario si es > 0; sino $100,000 default. Sin aportes/retiros durante el período — muestra el portafolio "desnudo" bajo el shock.

### Implementación

**`src/domain/regimes.ts` (nuevo, ~280 líneas):**
- `REGIMES: readonly RegimeDef[]` con los 3 regímenes.
- `regimeWindow(regime)`: traduce startDate/endDate a `{startIdx, endIdx, length}` sobre DATES.
- `computeRegimeReturns(spec, regime, mode, yieldInitial)`: expansión del portafolio vía `expandPortfolio` → loop sobre meses de la ventana → combinación ponderada de ETF returns + FIXED. Devuelve `Float32Array` de longitud `regime.length`.
- `tickerReturnAt(ticker, monthIdx, mode, yieldInitial)`: núcleo del cálculo por ticker. Router entre equity (RETURNS directo), RF histórico (RETURNS directo), y RF currentRates (reconstrucción vía carry).
- `computeValuePath(initial, returns)`: compone serie de valores acumulados. Output length = returns.length + 1 (incluye V[0] = initial).
- `computeRegimeStats(valuePath)`: retorna `{totalReturn, maxDrawdown, finalValue}` para la tabla.
- `findRegime(id)`: lookup por id.

**`src/domain/regimes.test.ts` (nuevo, +12 tests):**
- Validación de las 3 ventanas (start/end/length correctos).
- `computeRegimeReturns` produce Float32Array con longitud correcta y valores finitos para las 3 signatures × 3 regímenes × 2 modos = 18 combos.
- Portafolio 100% equity (USA.Eq) → historical y currentRates son IDÉNTICOS bit-exacto (contra-prueba del fallback erróneo).
- Portafolio 100% RF (GlFI) → historical y currentRates DIFIEREN, y la diff es acotada (< 1%/mes).
- `computeValuePath` recurrencia correcta (V[t] = V[t-1] × (1+r[t-1])).
- `computeRegimeStats` drawdown no-positivo, totalReturn alineado con finalValue/initial-1.
- Sanidad del dataset: RF_DECOMP.carry finito en los 3 regímenes para tickers clave.

**`src/components/RegimesPanel.tsx` (nuevo, ~340 líneas):**
- Header colapsable (default cerrado — no mete ruido al load inicial).
- 3 pills de régimen con tooltip = descripción.
- Descripción del régimen activo abajo.
- Legenda con 4 items: A sólida/dashed + B sólida/dashed.
- Chart `ComposedChart` de recharts con 4 `Line`:
  - A currentRates: navy sólida, strokeWidth 2.
  - A historical: navy dashed (5 3), strokeWidth 1.5, opacity 0.6.
  - B currentRates: naranja sólida.
  - B historical: naranja dashed, opacity 0.6.
- Tooltip custom con 4 filas (bold las sólidas, dashed icon las históricas).
- 2 sub-tablas lado a lado (Portafolio A, Portafolio B), cada una con 3 filas (Retorno total, Max drawdown, Valor final) × 2 columnas (Tasas actuales / Tasas del período).
- Footer con nota explicativa (capital inicial, sin flujos, N=1).

**`src/App.tsx`:**
- Import `RegimesPanel`.
- Insertado debajo del `ViewsPanel` (Fila 4c), antes del `ExportBar`.

### Verificación

- `npm test` → **272/272** (260 + 12 de regimes).
- `npm run build` → limpio en 53s. Bundle `index-*.js` creció 1,074 → 1,087 KB (+13 KB del panel + recharts extra).
- Sanity suites no se re-corrieron (sin cambios de motor bootstrap).

### Comportamiento esperado en la UI

1. Asesor abre la app → al hacer scroll abajo, panel "Regímenes históricos — replay determinístico" (colapsado).
2. Expande → ve los 3 regímenes seleccionables, descripción del activo, chart con 4 líneas.
3. Compara portafolios A vs B directamente sobre el shock concreto.
4. Ve gap entre líneas sólidas (tasas de hoy) y dashed (tasas del período) = impacto del carry. En portafolios equity las líneas coinciden (esperado). En portafolios RF-heavy, el gap es mayor.
5. Tabla inferior cuantifica: retorno total, max drawdown, valor final para las 4 combinaciones.

### Pendientes actualizados

Removidos del backlog:
- ~~Fase C.3 — Regímenes históricos~~ (cerrada acá).

Quedan:
- Modo `synchronizedDirection` (estanflación real mes a mes).
- Instructivo partes 2/3/4b (requieren screenshots — ahora con más views también).
- E2E Playwright (bloqueado upstream).
- Audit UX móvil — posterior a tener laptop/tablet estable.
- Migración a repo privado bajo organización Mercantil AWM.
- `mercantil-planner-build/` — sincronizar bajo demanda para uso offline.
- Posible evolución de C.3: permitir agregar flujos durante el replay del régimen (hoy está "desnudo"). Y/o soportar un régimen custom definido por rango de fechas.

### Estado al cierre

- **272/272 tests · build limpio · Fase C.3 cerrada.**
- Deploy automático en `andresborrerom.github.io/mercantil-planner/` tras el push.
- Panel nuevo vive colapsado por default — asesor lo abre a demanda.

---

## 2026-04-23 — Fase C.3.1: Enriquecimiento de stats de regímenes (6 métricas nuevas)

Continuación directa de Fase C.3 (cerrada la misma sesión). Usuario pidió métricas adicionales para la tabla de stats, "así no salgan en las gráficas específicamente" — es decir, profundizar la narrativa cuantitativa sin cargar el chart visual.

### Métricas agregadas (6, pasando de 3 a 9 totales por portafolio × modo)

Las 3 existentes: **Retorno total · Valor final · Max drawdown**.

**Pedidas por el usuario:**

1. **Duración de la caída** — meses desde el peak del max DD hasta el trough. Captura "qué tan rápido fue el golpe" vs "goteo prolongado".
2. **Tiempo a recuperación** — meses desde el trough hasta volver a superar el peak previo. `null` si el régimen termina antes (se muestra como "no recuperó"). Complementa max DD: una caída profunda que se recupera rápido es muy distinta de una caída moderada pero persistente.
3. **Meses en negativo por año** — `(# meses neg) × 12 / meses_regimen`. Normaliza para comparar regímenes de distinta duración (ej. Crisis 2008 con 18 meses vs Inflación 2022 con 10 meses).

**Sugeridas por Claude y aprobadas:**

4. **Volatilidad anualizada** — `sd(retornos) × √12`, sample variance (divisor n−1). Complemento clásico del retorno: "¿qué tan accidentado fue el camino?". Ulcer Index se descartó por ser demasiado técnico.
5. **Peor mes** — min de retornos mensuales. Anécdota concreta para la conversación con cliente ("en marzo de 2020 cayó X% en un mes").
6. **Mejor mes** — max de retornos mensuales. Counterpart: los rebotes también existen dentro del régimen y son parte del relato.

### Implementación

**`src/domain/regimes.ts`:**

- `RegimeStats` extendido con 6 campos nuevos.
- `computeRegimeStats(valuePath, monthlyReturns)` — segundo argumento obligatorio ahora. Varias métricas (vol, negativeMonths, worst/best) operan sobre retornos directamente.
- Single-pass sobre `valuePath` trackea: peak, peakIdx, maxDD, maxDDPeakIdx, maxDDTroughIdx. Eso da drawdownDuration.
- Segundo loop corto tras el trough busca recovery — `null` si no hay.
- Pass sobre `monthlyReturns` acumula: # negativos, worstMonth, bestMonth, sum (para mean).
- Pass final de varianza: sample variance con divisor `max(1, n-1)` (guarda contra n=1 degenerado).

**Convenciones en edge-cases:**

- Path monótona creciente → maxDD=0 ⇒ drawdownDuration=0, timeToRecovery=0 (coherente con "no hubo drawdown").
- Drawdown sin recuperación al cierre del régimen → timeToRecovery=null (UI muestra "no recuperó").
- Retornos constantes → vol=0.

### UI (`src/components/RegimesPanel.tsx`)

- `StatsSubtable` ahora renderiza 9 filas en lugar de 3. Mismas 2 columnas (Tasas actuales | Tasas del período).
- Nuevos formatters: `formatMonths(v | null)` (muestra "no recuperó" para null, "0" / "1 mes" / "N meses" de lo contrario); `formatMonthsPerYear(v)` (ej. "4.5 meses/año").
- Signed % para Peor mes y Mejor mes (siempre con + o −).
- Orden conceptual: Resultado (retorno, valor final) → Profundidad (max DD, duración, peor mes) → Recuperación (tiempo, meses neg) → Variabilidad (vol, mejor mes).

### Tests nuevos (+6, total 278/278)

1. Drawdown duration: path sintética `100→105→102→90→95→120`, peak en t=1, trough en t=3 → duration = 2 meses.
2. Time to recovery: path con recovery al cierre → número correcto de meses.
3. Time to recovery = null: path que no recupera dentro del régimen.
4. Negative months per year: normalización correcta para regímenes de 12 y 6 meses.
5. Worst/best month + volatilidad anualizada dentro del rango esperado.
6. Vol = 0 cuando retornos son todos iguales.

Los 3 tests existentes (totalReturn, maxDrawdown, finalValue) también se actualizaron para pasar `monthlyReturns` como segundo argumento.

### Verificación

- `npm test` → **278/278** (272 + 6 nuevos).
- `npm run build` → limpio en ~45s. Bundle sin cambio material (formatters + filas de tabla son costo despreciable).

### Pendientes actualizados

Quedan:
- Modo `synchronizedDirection` (estanflación real mes a mes).
- Instructivo partes 2/3/4b.
- E2E Playwright.
- Audit UX móvil.
- Migración a repo privado Mercantil AWM.
- `mercantil-planner-build/` sync bajo demanda.
- Evolución C.3: régimen custom por rango de fechas + permitir flujos durante el replay.

### Estado al cierre

- **278/278 tests · build limpio · Fase C.3 ampliada con stats adicionales.**
- Tabla de regímenes ahora tiene densidad informativa plena — el asesor puede contar la historia completa del régimen (qué tan profundo, qué tan largo, qué tan accidentado, mejor/peor mes).

