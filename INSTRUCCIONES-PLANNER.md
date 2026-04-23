# INSTRUCCIONES — Mercantil Planner (subproyecto)

> **Fuente de verdad única** de este subproyecto. Si algo aquí contradice otro archivo de la carpeta raíz `MERCANTIL/`, esto manda dentro de `mercantil-planner/`.

---

## 0. Aislamiento respecto al resto de la carpeta

Este subproyecto vive dentro de `C:\Users\pocho\OneDrive\MERCANTIL\mercantil-planner\`. La carpeta raíz `MERCANTIL\` contiene **otro proyecto activo** (Estudio de Benchmark) con sus propios archivos. Claude trabajando en este subproyecto debe respetar estas reglas:

### Archivos que NO debes leer, modificar, ni tratar como contexto
- `../instrucciones-proyecto.md`
- `../progreso.md`
- `../hallazgos.md`
- `../MERCANTIL_RECAPITULACION_1.md`
- Cualquier cosa en `../scripts/`
- Cualquier cosa en `../mercantil-preview/`
- Cualquier cosa en `../entregables/`
- Cualquier cosa en `../prompts/`

### Archivos que SÍ debes leer al inicio de cada sesión
1. `../about-me.md` — perfil del usuario, compartido entre todos sus proyectos.
2. Este archivo (`INSTRUCCIONES-PLANNER.md`).
3. `./progreso-planner.md` — bitácora propia del subproyecto.

### Dependencias externas (solo lectura, nunca escribir)
- `../mercantil_datos/mercantil_retornos_backfilled.csv` — retornos mensuales de 32 ETFs (ene 2006 → abr 2026)
- `../mercantil_datos/mercantil_rf_decomposed.csv` — descomposición RF (carry/price/delta_yield/total)
- `../mercantil_datos/mercantil_yields_mensuales.csv` — yields mensuales ^IRX/^FVX/^TNX/^TYX

Estos son outputs cerrados del otro proyecto. Si no existen o el schema no cuadra, **abortar y avisar** — no intentar regenerarlos.

**Todo archivo que crees o modifiques debe vivir dentro de `mercantil-planner/`.** Toda nota de progreso va a `./progreso-planner.md`, nunca al `progreso.md` de la raíz.

---

## 1. Objetivo del subproyecto

Construir una **herramienta interactiva in-browser, offline, sin Python**, que permita a un asesor de Mercantil simular el camino patrimonial de un cliente invertido en **dos portafolios en paralelo**, con flujos de inversión/desinversión arbitrarios a lo largo de hasta **30 años (360 meses)**, y compararlos en riesgo-retorno con fan charts móviles y estadísticas por ventana.

**Distribución:** la carpeta se comparte vía OneDrive. El asesor abre `dist/index.html` (directo o vía `serve.bat`) y la usa sin instalar nada.

---

## 2. Stack técnico

- **Vite + React 18 + TypeScript**
- **Recharts** para fan chart y gráficos auxiliares
- **TailwindCSS**
- **Web Worker dedicado** para el motor de bootstrap
- **Datos inlineados** en el bundle al build time (no fetch en runtime)
- **SheetJS (`xlsx`)** para export a Excel
- **Output:** `mercantil-planner/dist/` — single page app con `index.html` + `assets/`

### Colores Mercantil (tokens Tailwind)
- Navy principal: `#213A7D`
- Naranja acento: `#E97031`
- Dorado acento: `#C9A84C`

---

## 3. Estructura del subproyecto

```
mercantil-planner/
├── INSTRUCCIONES-PLANNER.md      ← este archivo (fuente de verdad)
├── progreso-planner.md           ← bitácora
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.js
├── index.html
├── scripts/
│   ├── build-data.mjs            ← lee CSVs de ../mercantil_datos/ y emite src/data/market.generated.ts
│   ├── worker-sanity.ts          ← tests de sanidad (convergencia SPY + perf + RF yield-path + RF bounds)
│   └── rf-analysis.ts            ← análisis empírico Fase 2 (regresiones D/C + calibración damping)
├── vitest.config.ts
├── postcss.config.js
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── index.css                 ← Tailwind base + component classes (.mp-card, .mp-btn-*) con variants dark:
│   ├── data/
│   │   └── market.generated.ts   ← generado por build-data.mjs, NO editar a mano
│   ├── domain/                   ← lógica pura, sin React, totalmente testeada con Vitest
│   │   ├── types.ts              ← PortfolioSpec, FlowRule, PlanSpec, SimulationResult, etc.
│   │   ├── amc-definitions.ts    ← AMCs/Signatures hardcoded + expandPortfolio()
│   │   ├── bootstrap.ts          ← block bootstrap pareado + RF yield-path reconstruction (Fase 2)
│   │   ├── rf-config.ts          ← parámetros calibrados Fase 2 (D, C, proxy yield, damping) user-approved
│   │   ├── prng.ts               ← Mulberry32 PRNG con seed reproducible
│   │   ├── flows.ts              ← motor de flujos determinístico + regla de ruina
│   │   ├── metrics.ts            ← 9 métricas del §6 + fan chart bands
│   │   ├── stats.ts              ← helpers estadísticos (percentile, median, std, band)
│   │   ├── presets.ts            ← presets de flujos (ahorro / jubilación / herencia)
│   │   └── profile.ts            ← clasificación vol (Baja/Media/Alta) + single-path metrics
│   ├── workers/
│   │   └── bootstrap.worker.ts   ← Web Worker, thin wrapper sobre bootstrap.ts, emite progress messages
│   ├── hooks/
│   │   ├── useBootstrapWorker.ts ← hook React para lifecycle del worker + progress callback
│   │   └── useTheme.ts           ← theme light/dark con localStorage + chart themes para Recharts
│   ├── components/
│   │   ├── Header.tsx            ← branding Mercantil + badge Fase 2 + ThemeToggle
│   │   ├── ThemeToggle.tsx       ← botón sol/luna para alternar tema
│   │   ├── PortfolioSelector.tsx ← tabs Signature/AMC/Custom + look-through colapsable
│   │   ├── ProfilePreview.tsx    ← badges de vol profile + sample path click-to-resample + RangeSlider sincronizado
│   │   ├── FlowEditor.tsx        ← presets + lista editable de reglas + params del plan
│   │   ├── FanChart.tsx          ← Recharts fan chart con zoom + RangeSlider + SimulateButton embebido
│   │   ├── RangeSlider.tsx       ← slider dual-thumb reutilizable (usado en FanChart + ProfilePreview)
│   │   ├── StatsPanel.tsx        ← tabla A vs B vs Δ con color semántico
│   │   ├── SimulateButton.tsx    ← wired al worker, barra de progreso real, elapsedMs y errores
│   │   └── ExportBar.tsx         ← Excel export (lazy-loaded xlsx chunk) + share config JSON
│   └── state/
│       └── store.ts              ← Zustand store global
└── dist/                         ← output del build (gitignore)
```

Se duplica a `../mercantil-planner-build/` después del build exitoso, para facilitar el share por OneDrive sin que el usuario tenga que excavar dentro del código fuente.

---

## 4. Motor de retornos (Web Worker)

Block bootstrap pareado con reconstrucción RF yield-path para los tickers de renta fija. Porta a TypeScript la lógica — **no copies** `bootstrap_core.py` del otro proyecto.

### Motor general

- **Block bootstrap pareado** con `block_size` default 12. Los 32 ETFs se muestrean en bloques alineados por fecha — la correlación cross-sectional (equity-equity, equity-rate, rate-spread) se preserva.
- **FIXED determinístico**: `FIXED6 = (1.06)^(1/12) − 1` y `FIXED9 = (1.09)^(1/12) − 1`. Tasas editables en UI (defaults 6% y 9%).
- **Equity (21 tickers)**: bootstrap de retornos totales históricos directamente. Cuando ninguno de los portafolios toca RF tickers, el worker usa una fast path equity-only que preserva la performance original (~130ms para 5000×360 en Node).
- **Seed reproducible** (default 42, editable).
- **N_paths** default 5000, máximo 10000.
- **Output del worker:** matriz `Float32Array` de `[n_paths × n_months]` de **retornos mensuales del portafolio** (ya look-through-eado a ETFs y combinado por pesos).

### RF yield-path reconstruction (11 tickers RF)

Todos los tickers de renta fija del dataset (BIL, SPTS, IEI, IEF, SPTL, IGOV, AGG, LQD, GHYG, EMB, CEMB) usan reconstrucción desde un path de yield simulado, no bootstrap de retornos totales. Esto asegura que el modelo arranque desde el entorno de tasas actual del cliente y produzca carry coherente con ese nivel.

**Simulación de yield paths** — las 4 series (IRX, FVX, TNX, TYX) se simulan en paralelo:
- Arranque: último yield observado en el dataset (mercado actual).
- Update mensual: `y[t] = y[t-1] + Δy_eff[t]`, con `Δy` tomado del **mismo bloque histórico** que el resto de activos (preserva correlación cross-asset y cross-maturity).
- **Damping cuadrático simétrico** sobre los bordes del rango histórico: si el path sale del rango, `Δy_eff = Δy · max(0, 1 − x²)`, donde `x` es la fracción normalizada dentro del buffer. Piso = `y_min_hist − 0.5%` (absoluto), techo = `y_max_hist × 1.5` (multiplicativo). Aplicado simétricamente para preservar correlación en ambas direcciones. Un cap duro final garantiza `y ∈ [floor, ceiling]` aún en Δy extremos.

**Reconstrucción del retorno mensual por RF ticker** (según modelo calibrado):
- **Carry-only** (BIL): `r = y_proxy / 12` — price return ≈ ruido, solo carry.
- **Treasury** (SPTS/IEI/IEF/SPTL): `r = y_proxy/12 − D·Δy + ½·C·Δy²` — reconstrucción estructural completa.
- **Híbrido** (IGOV/AGG/LQD/GHYG/EMB/CEMB): `r = y_proxy/12 − D·Δy + ½·C·Δy² + residual[m]`, donde `residual` es bootstrapeado del **mismo bloque histórico** y captura el spread premium (credit/FX/país). La media positiva del residual por ticker corresponde al spread carry anualizado (ej. LQD ~+200 bps/año, GHYG ~+685 bps/año).

**Parámetros calibrados empíricamente** (D, C, yield proxy por ticker, exponente de damping) vía `scripts/rf-analysis.ts` sobre el dataset completo. Decisiones clave aprobadas por el Head of Quant Research:
- Convexity `C ≠ 0` solo donde es físicamente significativa (IEI, IEF, SPTL). En credit/híbridos se fija `C = 0` para evitar overfitting del término Δy² a ruido de spread (la regresión estimaba convexidades absurdas como −981 años² para GHYG).
- SPTS usa yield sintético `0.63·IRX + 0.37·FVX` (interpolación lineal por maturity hacia el 2yr point).
- Residual NaN prefix (primeros meses de cada ticker híbrido) se imputa con la media empírica de residuales válidos (mean-preserving, no introduce bias sistemático).

La calibración actual vive hardcoded en `src/domain/rf-config.ts`. Si se agregan meses nuevos al dataset con valores extremos que cambien significativamente los parámetros (duración por regresión, rango histórico), re-correr `npm run analyze:rf` y actualizar `rf-config.ts` con review manual.

### Tests de sanidad del worker (`npm run sanity`)

1. **Determinismo**: dos corridas con el mismo seed → output idéntico.
2. **Convergencia SPY**: con `seed=42`, `block_size=12`, `n_paths=5000`, `horizonte=120`, portafolio 100% SPY (rama equity-only), la mediana del retorno anualizado debe caer dentro de ±1pp del retorno anualizado realizado histórico de SPY.
3. **Performance**: una simulación 5000 × 360 debe completarse en < 15s en browser (hard cap §11.4).
4. **RF yield-path coherente**: 100% IEF produce retornos sin NaN, media mensual en rango compatible con carry actual de TNX/12, y vol mensual de SPTL > vol de IEF × 1.5 (efecto duración).
5. **RF bounds respetados**: 100% BIL no viola nunca `[floor/12, ceiling/12]` sobre 1.8M valores (damping + cap duro funcionan).

---

## 5. Motor de flujos

Determinístico, corre en main thread (es barato).

```ts
type FlowRule = {
  id: string;
  label: string;
  sign: 'deposit' | 'withdraw';
  amount: number;            // USD, nominal o real según PlanSpec.mode
  frequency: 'monthly' | 'quarterly' | 'semiannual' | 'annual';
  startMonth: number;        // 1-indexed
  endMonth: number | null;   // null = hasta horizonte
  growthPct: number;         // crecimiento anual del monto, default 0
};

type PlanSpec = {
  initialCapital: number;
  horizonMonths: number;     // 1..360
  mode: 'nominal' | 'real';
  inflationPct: number;      // default 2.5
  rules: FlowRule[];
};
```

### Recurrencia path a path
```
V[0] = initialCapital
V[t] = V[t-1] * (1 + r_port[t]) + flow[t]
```
donde `flow[t]` es la suma neta de todas las reglas activas ese mes (aportes `+`, retiros `−`).

### Regla de ruina
Si al aplicar el flujo del mes `t` el valor quedaría negativo, el retiro se trunca al saldo disponible, `V[t] = 0`, y todos los meses siguientes el path queda congelado en 0 con `ruined[path] = true`. No se procesan más flujos para ese path.

**Probabilidad de ruina = `count(ruined) / n_paths`**. Métrica destacada, siempre visible.

### Modo real
Cuando `mode === 'real'`:
- Los montos de `FlowRule.amount` se interpretan como USD de hoy.
- Se inflan a nominal mes a mes con `(1 + infl)^(t/12)` antes de aplicar.
- El fan chart tiene un toggle para mostrar `V[t]` en USD nominales o deflactados a USD de hoy.

### Tests unitarios obligatorios del motor de flujos
1. Cashflow simple con retornos constantes debe matchear `FV = PV*(1+r)^n + PMT*annuity_factor` a 6 decimales.
2. Ruina forzada: capital 1000, retiro mensual 200, retorno 0% → ruina en mes 5, V queda en 0.
3. Modo real: aporte $1000 constante con inflación 2.5% → el aporte nominal del mes 120 debe ser `1000 * 1.025^10`.
4. Growth anual: aporte con `growthPct=5` aplica compounding anual (no mensual).

---

## 6. Métricas (panel de stats)

Todas se calculan **sobre la ventana seleccionada** en el fan chart. Se agregan across paths a percentiles (default mostramos mediana + P10/P90).

Métricas obligatorias:

| # | Métrica | Notas |
|---|---------|-------|
| 1 | **TWR anualizado** | Time-weighted, ignora flujos. |
| 2 | **XIRR (money-weighted)** | TIR sobre cash flows del cliente: `−aportes`, `+retiros`, `+valor_final`. Newton-Raphson con fallback a bisección. |
| 3 | **Max Drawdown (manager-level)** | Calculado sobre la equity curve teórica `E[k] = ∏(1+r_port)` con `E[0]=1`, sobre la ventana seleccionada. Independiente de aportes/retiros del cliente — mide sólo el comportamiento del portafolio. Comparable entre clientes con patrones de flujo distintos. Actualización 2026-04-17: antes se calculaba sobre la serie pre-flujo, lo que mezclaba caídas de mercado con caídas por retiros del cliente. Tooltip `(?)` refleja la definición nueva. |
| 4 | **Meses negativos por año** | `count(r_port<0) / n_meses × 12`. |
| 5 | **Volatilidad anualizada** | `std(r, ddof=1) * sqrt(12)`. |
| 6 | **Peor retorno rolling 12m** | Sobre la ventana. |
| 7 | **Probabilidad de ruina** | Sobre horizonte total, NO depende de la ventana. Fija en el panel. |
| 8 | **Prob. de terminar bajo el capital aportado neto** | Shortfall probability. |
| 9 | **Valor final (mediana + P10/P90)** | Al final de la ventana seleccionada. |

Cada fila: `A mediana (P10–P90)` │ `B mediana (P10–P90)` │ `Δ (B−A)` con color (verde si B mejora, rojo si empeora).

---

## 7. UI — spec mínimo

### Layout
- Header: "MERCANTIL SFI — Planificador" con "M" dorada + badge verde **Fase 2 · RF yield-path** + `ThemeToggle` (sol/luna).
- Hero compacto — intro pura sin CTAs (el botón Simular vive en el FanChart).
- Fila 1: dos columnas A│B, cada una con `PortfolioSelector`.
- Fila 2: `ProfilePreview` — badges de perfil de volatilidad (Baja/Media/Alta) + sample path con click-to-resample + KPIs per-path + `RangeSlider` de ventana sincronizado con el FanChart.
- Fila 3: `FlowEditor` (ancho completo), presets arriba + lista de reglas editables.
- Fila 4: `FanChart` (ancho completo) con zoom automático a la ventana seleccionada + `SimulateButton` embebido en el header del card (top-right). El flow natural arriba-abajo termina en la acción de simular con el resultado apareciendo inmediatamente debajo.
- Fila 5: `StatsPanel` (dos columnas con delta).
- Fila 6: `ExportBar` — export Excel + compartir config JSON.
- Re-correr worker solo cuando cambian: portafolios, seed, n_paths, block_size, horizonte, tasas FIXED. Cambios en flujos y ventana son instantáneos (solo main thread).

### PortfolioSelector (3 modos en tabs)
1. **Signature**: Conservador / Balanceado / Crecimiento.
2. **AMC individual**: dropdown con los 7 AMCs existentes (optgroup "Existentes"). Si el toggle "Mostrar AMCs propuestos" está activo, aparece también el optgroup "Propuestos" (CashST, USGrTech, USTDur).
3. **Custom mix**: sliders sobre los AMCs visibles (7 si el toggle está OFF, 10 si está ON), suma 100%, botón "normalizar".

Muestra look-through a ETF en donut colapsable + `%FIXED` calculado.

#### Toggle "Mostrar AMCs propuestos" (default OFF)

Checkbox global compartido por A y B, ubicado arriba de los dos PortfolioSelector. Como los 3 propuestos no están aprobados, default OFF para evitar que se seleccionen accidentalmente.

**Autofallback al destildar** (definido en `setShowProposedAmcs`):
- `signature` → no afectado.
- `amc` con id propuesto → switch automático a `GlFI`.
- `custom` con peso > 0 sobre propuestos → zero esos pesos y renormaliza el resto a 100%.
- `custom` con todos los pesos sobre propuestos (suma 0 después del strip) → fallback a `GlFI: 100`.

El autofallback es destructivo del estado: re-tildar el toggle no restaura los portafolios anteriores.

### ProfilePreview (perfil de volatilidad + escenario sample)
- **Badges de perfil** — clasificación de cada portafolio por volatilidad histórica anualizada (determinística, disponible antes de simular):
  - Volatilidad Baja: < 6% anualizada.
  - Volatilidad Media: 6%–12%.
  - Volatilidad Alta: > 12%.
  - Umbrales basados en convenciones de BlackRock, JPMorgan, Morgan Stanley, Raymond James. Hardcodeados en `profile.ts`, fácilmente editables.
  - Color: verde (Baja), ámbar (Media), rosa (Alta). Border-left con color del portafolio. Adaptados a dark mode con palettes tint dark + text bright.
- **Mini chart** — un path random del bootstrap (pareado A/B del mismo "mercado"). **Click en el gráfico = nuevo path aleatorio** entre los N paths disponibles. Sigue la ventana seleccionada en FanChart.
- **KPIs per-path** al lado del chart: % meses negativos, Max Drawdown, TWR anualizado, saldo final. Calculados sobre la ventana activa del FanChart.
- **RangeSlider de ventana** debajo del chart + KPIs, sincronizado con el FanChart via el mismo estado del store. Mover uno mueve el otro automáticamente.

### FanChart
- Eje X: meses → años. Eje Y: valor en USD.
- Dos bandas: A navy 20% opacity, B naranja 20% opacity. Colores del chart adaptan a dark mode (ver `getChartTheme` en `useTheme.ts`).
- Percentiles: P10/P90 como bandas (Area), P50 como líneas (Line).
- Línea gris dashed para "capital aportado neto" (determinística).
- **Header del card** incluye título, leyenda de los 3 colores (Portafolio A / B / Capital aportado neto) Y el `SimulateButton` top-right con barra de progreso real durante la corrida (`XX%` en el botón + "Simulando paths: N/5000" + barra naranja animada).
- **Zoom automático a la ventana seleccionada**: el chart siempre muestra solo el rango [startMonth, endMonth] de la ventana activa y auto-escala ambos ejes. NO hay vista completa del horizonte — toda la vista ES la ventana.
- **RangeSlider dual-thumb** de ventana (reemplazó los 2 sliders apilados independientes) + chips: `1a / 3a / 5a / 10a / Total`. Ambos thumbs arrastrables con pointer events, tooltip al hover/drag, keyboard nav (arrows ±1, Shift ±12, Home/End extremos), ARIA slider roles, constraint `minWindow=6`. Compartido via store con el `RangeSlider` del ProfilePreview → mover uno mueve el otro. Al arrastrar, stats y ProfilePreview se recalculan en vivo (< 100 ms).
- Tick formatter adaptativo: meses para ventanas cortas (≤24m), años para largas.
- Tooltip al hover con A y B para P10/mediana/P90 + capital aportado neto.

#### Visualización condicional (cuando hay view activo con `nMatched > 0`)

Dos modos de visualización con switch UI en el header del FanChart:

1. **Toggle mode** (preferido por default):
   - Base: bandas sólidas 20% fill + medianas sólidas.
   - Cond: misma estética exacta (bandas sólidas 20% fill + medianas sólidas).
   - Switch entre uno y otro — nunca ambos visibles a la vez.

2. **Overlay mode** (estilo v1, ambos visibles):
   - Base: bandas sólidas 20% fill + medianas sólidas (sin fade al activar cond).
   - Cond encima: 6 líneas dashed (P10/P50/P90 para A y B, sin fill).
   - Leyenda extendida: dots para "Portafolio A" / "Portafolio B" (base) + mini-líneas dashed para "A (cond.)" / "B (cond.)".

**Y-axis:** se computa sobre `union(base, cond)` y permanece **estable bajo todos los toggles** — no se mueve al alternar Toggle↔Overlay ni al activar/desactivar el view. Sí se recalcula al mover el slider de ventana.

**Tooltip:**
- Overlay: muestra ambos conjuntos (base labels + cond labels).
- Toggle: muestra solo el conjunto visible.

**Bandas condicionales** se computan sobre el horizonte completo (window-independent). **Métricas condicionales** del StatsPanel respetan el slider de ventana (window-dependent). Ver `progreso-planner.md` entrada 2026-04-21 para el diff respecto a la implementación parcial actual de Fase C.2c.

### FlowEditor
- 3 presets como chips clickeables: **Ahorro acumulación**, **Jubilación**, **Herencia**.
- Lista editable de `FlowRule` debajo — agregar / eliminar / duplicar.
- Validación inline (no alerts).

### No negociables de UX
- Loading state del worker con barra de progreso real `"N/5000 paths…"` + `elapsedMs` post-corrida. (**Implementado** con `onProgress` callback en `bootstrap.ts` → worker emite cada 250 paths → `useBootstrapWorker` lo expone → `SimulateButton` renderiza.)
- **Dark mode toggle**. (**Implementado** en `ThemeToggle.tsx` + `useTheme.ts`. Persistencia `localStorage` + fallback `prefers-color-scheme`. Anti-FOUC script inline en `index.html`. Paleta navy-tinted "dark respetuoso" que preserva identidad Mercantil. Cubre todos los componentes + chart colors theme-aware.)
- Botón **Exportar a Excel** (`.xlsx`): spec de ambos portafolios, reglas, tabla de stats, y primeras 500 paths × horizonte. (**Implementado** en `ExportBar.tsx` con `xlsx` en chunk lazy-loaded → bundle principal −282 KB / −93 KB gzipped.)
- Botón **Compartir config**: copia JSON al clipboard e input para pegar y reconstruir sesión. (**Implementado** en `ExportBar.tsx`.)
- **Responsive desktop 1280×800 mínimo**. (**Implementado y validado formalmente** en light + dark: `bodyWidth=1265px` sin overflow horizontal, todos los elementos fit sin recorte.)

---

## 8. Definiciones de AMCs (embebidas en `src/domain/amc-definitions.ts`)

Hardcodear estas composiciones, no leer el .py del otro proyecto:

### AMCs existentes (con FIXED embebido)
| AMC | UST13 | DMG7 | IG | HY | EMDBT | EQUS | EQXUS | EQGLB | FIXED6 | FIXED9 |
|-----|-------|------|----|----|-------|------|-------|-------|--------|--------|
| GlFI | 10 | 25 | 35 | 10 | — | — | — | — | 20 | — |
| RF.Lat | — | — | — | 60 | 20 | — | — | — | — | 20 |
| ST.Cr.Opps | — | — | — | 30 | 20 | — | — | — | — | 50 |
| HY.Cr.Opps | — | — | — | 40 | — | — | — | — | — | 60 |
| USA.Eq | — | — | — | — | — | 100 | — | — | — | — |
| GlExUS | — | — | — | — | — | — | 100 | — | — | — |
| GlSec.Eq | — | — | — | — | — | — | — | 100 | — | — |

### AMCs propuestos
- **CashST**: MM(BIL) 60 + UST13(SPTS) 40
- **USGrTech**: GRW(IWF) 60 + STECH(IXN) 40
- **USTDur**: UST37(IEI) 50 + UST710(IEF) 50

### Signatures (look-through a AMCs)
- **Conservador**: GlFI 55, RF.Lat 37, GlSec.Eq 8
- **Balanceado**: GlFI 25, RF.Lat 25, USA.Eq 10, GlExUS 10, GlSec.Eq 25, HY.Cr.Opps 5
- **Crecimiento**: GlFI 5, RF.Lat 5, USA.Eq 15, GlExUS 15, GlSec.Eq 55, HY.Cr.Opps 5

### Mapeo ID → Ticker (para look-through final a los 32 ETFs)
```
MM:BIL, UST13:SPTS, UST37:IEI, UST710:IEF, UST10P:SPTL, DMG7:IGOV,
IG:LQD, HY:GHYG, EMDBT:EMB, EMCRP:CEMB, AGG:AGG, EQGLB:ACWI, EQUS:SPY,
EQEU:EZU, EQJP:EWJ, EQDM:URTH, EQEM:EEM, EQXUS:ACWX, SMCAP:IJR,
VAL:IWD, GRW:IWF, STECH:IXN, SFIN:IXG, SDISC:RXI, SINDU:EXI, SHLT:IXJ,
SCOMM:IXP, SSTAP:KXI, SMAT:MXI, SENR:IXC, SRLE:RWO, SUTIL:JXI
```
FIXED6 y FIXED9 NO son ETFs — son los retornos determinísticos definidos en §4.

**Regla de dilución:** este subproyecto usa los AMCs con composición **no diluida** (como están hoy). La dilución por AUM inflows es responsabilidad del otro proyecto.

---

## 9. Script `build-data.mjs`

- Lee los 3 CSVs de `../mercantil_datos/` con `node:fs`.
- Valida que la matriz de retornos tiene **≥ 240 meses** y los **32 ETFs esperados**. Si no, aborta el build con exit code 1.
- Emite `src/data/market.generated.ts` con:
  - `export const DATES: string[]` — fechas ISO.
  - `export const TICKERS: readonly [...]` — tipado estrecho.
  - `export const RETURNS: Float32Array` — flat row-major `[n_meses × n_tickers]`.
  - `export const YIELDS: { IRX, FVX, TNX, TYX: Float32Array }`.
  - `export const RF_DECOMP: { [ticker]: { carry, price, delta_yield, total: Float32Array } }`.
- Se corre automáticamente como `prebuild` script en `package.json`.
- Idempotente — correrlo dos veces debe producir el mismo archivo byte a byte (salvo un comment con timestamp opcional).

---

## 10. Distribución

Después de `npm run build`:

1. `dist/` contiene `index.html` + `assets/`.
2. Copiar `dist/` a `../mercantil-planner-build/` (al nivel de la raíz MERCANTIL, no dentro del subproyecto) para que sea fácil compartir por OneDrive.
3. `../mercantil-planner-build/serve.bat` + `serve.mjs` — servidor HTTP local usando Node.js (NO Python — Node ya está garantizado en el sistema porque es parte del stack del subproyecto). `serve.mjs` es un mini servidor estático con solo built-ins de Node (sin deps), maneja MIME types, path traversal guard, y abre el browser automáticamente. `serve.bat` lo invoca con `node serve.mjs` y tiene `pause` al final para atrapar errores. **Chrome y Edge bloquean Web Workers module desde `file://`**, así que el servidor local es obligatorio.
4. `../mercantil-planner-build/LEEME.txt` — guía para el asesor: qué es la herramienta, cómo abrirla (serve.bat), cómo usarla, resumen de metodología, nota sobre Fase 1 vs Fase 2.

---

## 11. Criterio de aceptación

El subproyecto se considera **cerrado** cuando:

1. `npm run build` pasa limpio desde `mercantil-planner/`.
2. Abriendo `dist/index.html` (directo o vía `serve.bat`), se puede configurar 2 portafolios distintos, definir flujos (preset + reglas custom adicionales), y ver fan chart + stats actualizados.
3. El slider de ventana recalcula stats en **< 100 ms**.
4. Una simulación de **5000 paths × 360 meses** termina en **< 15 s** en la máquina del usuario.
5. **XIRR y TWR** coinciden con validación manual en Excel a **4 decimales** sobre un caso de prueba documentado en `progreso-planner.md`.
6. La **probabilidad de ruina** es coherente: con retiros agresivos sube, con conservadores ~0%.
7. Export a Excel abre bien en Office y contiene toda la config.
8. Los tests unitarios del motor de flujos pasan (ver §5).

---

## 12. Convenciones y reglas generales

- **TypeScript estricto** (`"strict": true`), nada de `any` salvo en los datos generados.
- **Tests** con Vitest para los motores puros (flujos, métricas). El worker se valida con el test de sanidad del §4 corrido como script aparte.
- **Encoding UTF-8** en todo archivo.
- **Commits lógicos** recomendados, pero NO inicializar git dentro de `mercantil-planner/` sin preguntarme primero (la raíz no tiene git).
- **Antes de tocar cualquier archivo fuera de `mercantil-planner/`, preguntar.**
- **Bugs en los CSVs de origen:** no los corrijas, reporta y propón workaround.
- **Nada de placeholders vacíos en UI.** Si el worker no corrió, muestra CTA claro.
- **Todo en español** en UI y comentarios user-facing. Código y nombres de variables en inglés.

---

## 13. Pasos de implementación (orden sugerido)

1. Verificar entorno: `node --version`, `npm --version`. Si faltan, avisar y parar.
2. `npm create vite@latest . -- --template react-ts` dentro de `mercantil-planner/`. Instalar Tailwind, Recharts, SheetJS, Zustand, Vitest.
3. `scripts/build-data.mjs` + validaciones. Generar `market.generated.ts`.
4. `domain/types.ts` + `amc-definitions.ts` (hardcoded del §8).
5. Worker de bootstrap (Fase 1, sin Tier A carry+dur). Test de sanidad.
6. `domain/flows.ts` + tests unitarios Vitest (§5).
7. `domain/metrics.ts` + tests (TWR, XIRR, DD, ruina).
8. `domain/presets.ts`.
9. UI: layout + PortfolioSelector + FlowEditor.
10. FanChart con slider de ventana.
11. StatsPanel con recálculo por ventana.
12. Export Excel + compartir config JSON.
13. Build, copiar a `../mercantil-planner-build/`, smoke test.
14. Actualizar `progreso-planner.md` con el hito.

---

## 14. Checklist de inicio de sesión (para futuras sesiones de Claude Code)

Cada vez que abras una sesión nueva en este subproyecto:

- [ ] Leer `../about-me.md`
- [ ] Leer este archivo completo (`INSTRUCCIONES-PLANNER.md`)
- [ ] Leer `./progreso-planner.md`
- [ ] **NO** leer `../instrucciones-proyecto.md`, `../progreso.md`, `../hallazgos.md`, `../MERCANTIL_RECAPITULACION_1.md`
- [ ] Verificar que los 3 CSVs de `../mercantil_datos/` existen
- [ ] Correr `npm test` para confirmar que el dominio puro (stats, metrics, flows, bootstrap, presets, AMCs) sigue en verde. Si hay regresiones, parar y avisar antes de tocar código nuevo.
- [ ] Correr `npm run sanity` para confirmar que el motor de bootstrap sigue pasando el test de convergencia del §4 (SPY histórico ± 1pp) y el cap de performance 5000×360 < 15s. Si alguno falla, es la primera prioridad.
- [ ] Si la sesión anterior tocó componentes UI (`src/components/`, `src/state/`, `src/hooks/`, `src/App.tsx`, `index.css`, etc.), correr `npm run build` como smoke test antes de arrancar — tsc strict valida todo el árbol de tipos y Vite compila el worker chunk. Si falla, arreglar primero.
- [ ] Revisar qué quedó pendiente en `progreso-planner.md` y proponer el siguiente paso antes de codear
