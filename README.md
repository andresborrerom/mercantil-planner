# Mercantil Planner

Subproyecto de **Mercantil AWM — Quantitative Research**. Herramienta
interactiva in-browser (offline, sin Python) para simular el camino
patrimonial de un cliente invertido en dos portafolios en paralelo, con
flujos configurables a lo largo de hasta 30 años.

## Fuente de verdad

- **Spec:** [`INSTRUCCIONES-PLANNER.md`](./INSTRUCCIONES-PLANNER.md) — objetivo,
  stack, motores, UI, AMCs, criterio de aceptación. Si algo acá contradice el
  spec, el spec manda.
- **Bitácora:** [`progreso-planner.md`](./progreso-planner.md) — hitos,
  decisiones, pendientes. Agregar al final, no sobrescribir.
- **Perfil del usuario:** [`../about-me.md`](../about-me.md) (compartido entre
  todos los proyectos de Mercantil AWM).

## Comandos

```bash
npm test             # Vitest — tests de dominio (141 tests: stats, metrics, flows, bootstrap, RF, etc.)
npm run sanity       # 5 chequeos §4 + Fase 2: convergencia SPY, perf 5000×360, RF yield-path, RF bounds
npm run analyze:rf   # Análisis empírico RF para recalibrar rf-config.ts si cambia el dataset
npm run dev          # Vite dev server en localhost:5173 (corre build-data.mjs primero)
npm run build        # Build de producción a dist/ (corre build-data.mjs primero)
npm run preview      # Sirve dist/ para smoke test del build
npm run build:data   # Regenera src/data/market.generated.ts manualmente
```

## Layout del código

```
mercantil-planner/
├── INSTRUCCIONES-PLANNER.md    ← spec (fuente de verdad)
├── progreso-planner.md         ← bitácora
├── scripts/
│   ├── build-data.mjs          ← lee ../mercantil_datos/*.csv → src/data/market.generated.ts
│   ├── worker-sanity.ts        ← sanidad: convergencia SPY, perf, RF yield-path, RF bounds (tsx)
│   └── rf-analysis.ts          ← análisis empírico Fase 2 (regresiones D/C + damping) (tsx)
├── src/
│   ├── data/
│   │   └── market.generated.ts ← 244 meses × 32 tickers, generado, NO editar
│   ├── domain/                 ← lógica pura, sin React, totalmente testeada
│   │   ├── types.ts
│   │   ├── amc-definitions.ts
│   │   ├── bootstrap.ts        ← block bootstrap + RF yield-path reconstruction (Fase 2)
│   │   ├── rf-config.ts        ← parámetros RF user-approved (D, C, proxy, damping)
│   │   ├── flows.ts
│   │   ├── metrics.ts
│   │   ├── presets.ts
│   │   ├── profile.ts          ← clasificación vol (Baja/Media/Alta) + single-path metrics
│   │   ├── prng.ts
│   │   └── stats.ts
│   ├── workers/
│   │   └── bootstrap.worker.ts ← Web Worker + progress messages
│   ├── hooks/
│   │   ├── useBootstrapWorker.ts
│   │   └── useTheme.ts         ← dark mode hook + chart themes
│   ├── state/
│   │   └── store.ts            ← Zustand store
│   ├── components/             ← React + Tailwind (con dark: variants)
│   │   ├── Header.tsx          ← brand + badge Fase 2 + ThemeToggle
│   │   ├── ThemeToggle.tsx     ← sun/moon toggle
│   │   ├── PortfolioSelector.tsx
│   │   ├── ProfilePreview.tsx  ← vol profile + sample path + RangeSlider sincronizado
│   │   ├── FlowEditor.tsx
│   │   ├── FanChart.tsx        ← fan chart + SimulateButton embebido + RangeSlider
│   │   ├── RangeSlider.tsx     ← dual-thumb slider reutilizable
│   │   ├── StatsPanel.tsx
│   │   ├── SimulateButton.tsx  ← con progress bar real
│   │   └── ExportBar.tsx       ← xlsx lazy-loaded en chunk separado
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css               ← Tailwind + .mp-* classes con dark variants
└── dist/                       ← output del build (gitignored)
```

El output de distribución (`dist/` copiado + `serve.bat` + `LEEME.txt`) vive
en `../mercantil-planner-build/` al nivel de la carpeta MERCANTIL.

## Reglas de aislamiento del subproyecto

Este subproyecto vive dentro de `C:\Users\pocho\OneDrive\MERCANTIL\mercantil-planner\`
junto a otro proyecto (Estudio de Benchmark). Ver **§0 del spec** para la lista
exacta de archivos de la raíz que **NO** se deben leer ni modificar desde acá.

## Para retomar una sesión

Si abrís una sesión nueva de Claude Code o de otra herramienta:

1. Leé `../about-me.md`, `INSTRUCCIONES-PLANNER.md`, y `progreso-planner.md`.
2. Corré `npm test` y `npm run sanity` para confirmar que los motores siguen
   verdes.
3. Revisá la última entrada de `progreso-planner.md` para saber en qué punto
   quedó y qué es lo siguiente.
