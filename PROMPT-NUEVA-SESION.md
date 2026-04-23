# Prompt para nueva sesión de Claude Code — Mercantil Planner

Copia y pega todo el bloque de abajo al iniciar la sesión.

---

Estoy trabajando en el subproyecto Mercantil Planner. Lee estos 3 archivos en este orden antes de hacer cualquier otra cosa:

1. `INSTRUCCIONES-PLANNER.md` completo (es la fuente de verdad del subproyecto)
2. `progreso-planner.md` — la bitácora acumulativa. Es append-only; la entrada **más reciente está al final** y corresponde a **Fase C.2c** (visualización condicional en FanChart + sección Stats condicional, cerrada 2026-04-20).
3. `../about-me.md` (mi perfil profesional, compartido entre proyectos)

**NO leas** ningún otro `.md` de la carpeta raíz `../` — pertenecen a otro proyecto (Estudio de Benchmark).

Después de leer los 3 archivos, hacé el checklist del §14 del spec:

- Verificá que los 3 CSVs de `../mercantil_datos/` existen
- Corré `npm test` y confirmá que los **242 tests** pasan (dominio: stats, metrics, flows, bootstrap + views single/composite + ETF returns + store)
- Corré `npm run sanity` y confirmá **5/5 verdes** (determinismo, convergencia SPY ±1pp, perf 5000×360 <15s, RF yield-path IEF, RF bounds BIL)
- Corré `npm run sanity:views` y confirmá **13 presets + 2 ETF smoke tests verdes** (9 single + 4 compuestos + SPTL percentil + ACWI peak)
- Corré `npm run build` como smoke test (debe pasar limpio en ~50s)

Cuando todo esté verde, decime qué entendiste del estado actual del proyecto, qué quedó pendiente según la última entrada de la bitácora (Fase C.2b multi-asset composites con ventanas distintas, Fase C.3 regímenes históricos, modo synchronizedDirection, instructivo, E2E), y proponé el siguiente paso. Esperá mi OK antes de tocar archivos.
