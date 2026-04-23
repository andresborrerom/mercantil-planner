/**
 * SimulateButton — dispara el worker de bootstrap y mete el resultado al store.
 *
 * Deshabilitado mientras status === 'running'. Muestra elapsedMs de la última
 * corrida exitosa y error en rojo si la corrida falló.
 */

import { useCallback, useState } from 'react';
import { expandPortfolio } from '../domain/amc-definitions';
import { useBootstrapWorker, type BootstrapProgress } from '../hooks/useBootstrapWorker';
import { usePlannerStore } from '../state/store';

export default function SimulateButton() {
  const portfolioA = usePlannerStore((s) => s.portfolioA);
  const portfolioB = usePlannerStore((s) => s.portfolioB);
  const plan = usePlannerStore((s) => s.plan);
  const bootstrap = usePlannerStore((s) => s.bootstrap);
  const status = usePlannerStore((s) => s.status);
  const errorMessage = usePlannerStore((s) => s.errorMessage);
  const lastElapsedMs = usePlannerStore((s) => s.lastElapsedMs);
  const setStatus = usePlannerStore((s) => s.setStatus);
  const ingestSimulation = usePlannerStore((s) => s.ingestSimulation);

  const worker = useBootstrapWorker();
  const [progress, setProgress] = useState<BootstrapProgress | null>(null);
  /**
   * Opt-in para emitir retornos per-ETF en el próximo simulación. Costo de
   * memoria ~230 MB para 5000×360 — por eso es opt-in (a diferencia de yields
   * que cuestan ~29 MB y van siempre activos). Se persiste solo en este
   * componente (no en el store) porque afecta únicamente la próxima corrida.
   */
  const [outputEtfReturns, setOutputEtfReturns] = useState(false);

  const handleRun = useCallback(async (): Promise<void> => {
    setStatus('running');
    setProgress({ completedPaths: 0, totalPaths: bootstrap.nPaths });
    try {
      const expA = expandPortfolio(portfolioA);
      const expB = expandPortfolio(portfolioB);
      const result = await worker.run(
        {
          portfolios: { A: expA, B: expB },
          horizonMonths: plan.horizonMonths,
          config: bootstrap,
          // Emitimos yield paths siempre — habilita los views de tasas sin
          // requerir una segunda corrida. Costo de memoria ~29 MB adicionales
          // por simulación (5000 × 360 × 4 yields × 4 bytes), que en browsers
          // modernos no tiene impacto perceptible.
          outputYieldPaths: true,
          // ETF returns opt-in desde UI (~230 MB si está activo).
          outputEtfReturns,
        },
        (p) => setProgress(p),
      );
      ingestSimulation({
        portfolioReturnsA: result.portfolioReturnsA,
        portfolioReturnsB: result.portfolioReturnsB,
        nPaths: result.meta.nPaths,
        horizonMonths: result.meta.horizonMonths,
        elapsedMs: result.meta.elapsedMs,
        yieldPaths: result.yieldPaths,
        etfReturns: result.etfReturns,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[SimulateButton] error', err);
      setStatus('error', msg);
    } finally {
      setProgress(null);
    }
  }, [bootstrap, ingestSimulation, outputEtfReturns, plan.horizonMonths, portfolioA, portfolioB, setStatus, worker]);

  const isRunning = status === 'running';
  const pct = progress && progress.totalPaths > 0
    ? Math.round((progress.completedPaths / progress.totalPaths) * 100)
    : 0;

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <button
        onClick={handleRun}
        disabled={isRunning}
        className="mp-btn-primary bg-mercantil-orange hover:bg-mercantil-orange-deep text-base px-6 py-3 min-w-[140px] justify-center"
      >
        {isRunning ? (
          <>
            <Spinner />
            {progress ? `${pct}%` : 'Simulando…'}
          </>
        ) : (
          <>
            ▶ Simular
          </>
        )}
      </button>
      <label
        className="flex items-center gap-1.5 text-[11px] text-mercantil-slate dark:text-mercantil-dark-slate cursor-pointer select-none"
        title="Emite los retornos mensuales de los 32 ETFs individuales (~230 MB extra). Necesario para views del tipo 'S&P cae entre −10% y −20% en 6 meses'."
      >
        <input
          type="checkbox"
          checked={outputEtfReturns}
          onChange={(e) => setOutputEtfReturns(e.target.checked)}
          disabled={isRunning}
          className="accent-mercantil-orange"
        />
        Habilitar ETFs individuales para views
      </label>
      <div className="text-xs text-mercantil-slate dark:text-mercantil-dark-slate min-w-[240px]">
        {isRunning && progress && (
          <div>
            <div className="flex justify-between mb-1">
              <span>
                Simulando paths: <strong className="text-mercantil-ink dark:text-mercantil-dark-ink">{progress.completedPaths.toLocaleString()}</strong> /{' '}
                {progress.totalPaths.toLocaleString()}
              </span>
              <span className="tabular-nums">{pct}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-mercantil-line dark:bg-mercantil-dark-line overflow-hidden">
              <div
                className="h-full bg-mercantil-orange transition-[width] duration-150 ease-out"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )}
        {status === 'error' && errorMessage && (
          <span className="text-rose-700 dark:text-rose-400 font-semibold">Error: {errorMessage}</span>
        )}
        {status === 'done' && lastElapsedMs != null && (
          <span>
            Última corrida: <strong className="text-mercantil-ink dark:text-mercantil-dark-ink">{lastElapsedMs.toFixed(0)} ms</strong> en el worker
          </span>
        )}
        {status === 'idle' && (
          <span>
            {bootstrap.nPaths} paths × {plan.horizonMonths} meses · seed {bootstrap.seed} · block{' '}
            {bootstrap.blockSize}
          </span>
        )}
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg
      className="animate-spin h-4 w-4 mr-2 text-white"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}
