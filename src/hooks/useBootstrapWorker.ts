/**
 * Hook que encapsula el ciclo de vida del Web Worker de bootstrap.
 *
 * Crea UN worker por mount, lo reutiliza entre corridas, y lo termina al
 * unmount. Expone `run(input)` que retorna una Promise con los Float32Array
 * del worker y el elapsedMs medido por el propio worker.
 *
 * Uso:
 *   const worker = useBootstrapWorker();
 *   const result = await worker.run({ portfolios, horizonMonths, config });
 *   // result.portfolioReturnsA / result.portfolioReturnsB / result.meta
 */

import { useCallback, useEffect, useRef } from 'react';
import type {
  BootstrapInput,
  EtfReturnsOutput,
  YieldPathsOutput,
} from '../domain/bootstrap';

type WorkerRunMeta = {
  nPaths: number;
  horizonMonths: number;
  blockSize: number;
  seed: number;
  fixed6Monthly: number;
  fixed9Monthly: number;
  elapsedMs: number;
  nMonthsData: number;
};

type OkResponse = {
  id: string;
  ok: true;
  portfolioReturnsA: Float32Array;
  portfolioReturnsB: Float32Array;
  yieldPaths?: YieldPathsOutput;
  etfReturns?: EtfReturnsOutput;
  meta: WorkerRunMeta;
};

type ErrResponse = {
  id: string;
  ok: false;
  error: string;
};

type ProgressResponse = {
  id: string;
  progress: true;
  completedPaths: number;
  totalPaths: number;
};

type WorkerResponse = OkResponse | ErrResponse | ProgressResponse;

export type BootstrapRunResult = {
  portfolioReturnsA: Float32Array;
  portfolioReturnsB: Float32Array;
  /** Solo presente si el input pidió `outputYieldPaths: true`. */
  yieldPaths?: YieldPathsOutput;
  /** Solo presente si el input pidió `outputEtfReturns: true`. */
  etfReturns?: EtfReturnsOutput;
  meta: WorkerRunMeta;
};

export type BootstrapProgress = {
  completedPaths: number;
  totalPaths: number;
};

type PendingJob = {
  resolve: (value: BootstrapRunResult) => void;
  reject: (reason: Error) => void;
  onProgress?: (progress: BootstrapProgress) => void;
};

export function useBootstrapWorker(): {
  run: (
    input: BootstrapInput,
    onProgress?: (progress: BootstrapProgress) => void,
  ) => Promise<BootstrapRunResult>;
} {
  const workerRef = useRef<Worker | null>(null);
  const pendingRef = useRef<Map<string, PendingJob>>(new Map());
  const counterRef = useRef(0);

  useEffect(() => {
    // Vite convierte la URL relativa a un chunk de worker con hash estable.
    const worker = new Worker(
      new URL('../workers/bootstrap.worker.ts', import.meta.url),
      { type: 'module' },
    );

    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      const msg = event.data;
      const pending = pendingRef.current.get(msg.id);
      if (!pending) return;
      // Progreso intermedio: no resolvemos, solo notificamos.
      if ('progress' in msg) {
        pending.onProgress?.({
          completedPaths: msg.completedPaths,
          totalPaths: msg.totalPaths,
        });
        return;
      }
      // Mensaje terminal (ok:true o ok:false).
      pendingRef.current.delete(msg.id);
      if (msg.ok === true) {
        pending.resolve({
          portfolioReturnsA: msg.portfolioReturnsA,
          portfolioReturnsB: msg.portfolioReturnsB,
          yieldPaths: msg.yieldPaths,
          etfReturns: msg.etfReturns,
          meta: msg.meta,
        });
      } else {
        pending.reject(new Error(msg.error));
      }
    };

    worker.onerror = (event) => {
      // Si el worker explota, rechazamos todas las corridas pendientes.
      const err = new Error(event.message || 'Error inesperado en el worker de bootstrap');
      for (const [, pending] of pendingRef.current) pending.reject(err);
      pendingRef.current.clear();
    };

    workerRef.current = worker;

    return () => {
      worker.terminate();
      workerRef.current = null;
      pendingRef.current.clear();
    };
  }, []);

  const run = useCallback(
    (
      input: BootstrapInput,
      onProgress?: (progress: BootstrapProgress) => void,
    ): Promise<BootstrapRunResult> => {
      const worker = workerRef.current;
      if (!worker) {
        return Promise.reject(new Error('El worker de bootstrap no está inicializado'));
      }
      const id = `job-${++counterRef.current}`;
      return new Promise<BootstrapRunResult>((resolve, reject) => {
        pendingRef.current.set(id, { resolve, reject, onProgress });
        worker.postMessage({ id, payload: input });
      });
    },
    [],
  );

  return { run };
}
