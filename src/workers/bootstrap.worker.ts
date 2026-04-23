/**
 * Bootstrap Web Worker — thin message-handler wrapper sobre runBootstrap.
 *
 * Protocolo:
 *   main → worker: { id, payload: BootstrapInput }
 *   worker → main: { id, ok: true, result: BootstrapOutput } | { id, ok: false, error: string }
 *
 * Se transfiere el ownership de los Float32Array para evitar copias.
 */

/// <reference lib="webworker" />

import {
  runBootstrap,
  TIER_A_TICKERS,
  type BootstrapInput,
  type EtfReturnsOutput,
  type YieldPathsOutput,
} from '../domain/bootstrap';

// Info de Fase 2 — visible en DevTools del browser al cargar el worker.
// El badge visual equivalente vive en el Header del App.
console.info(
  `[bootstrap.worker] Fase 2: los ${TIER_A_TICKERS.length} tickers RF ` +
    `(${TIER_A_TICKERS.join(', ')}) usan reconstrucción yield-path ` +
    `(carry + duration·Δy + ½·conv·Δy² + residual credit), partiendo del ` +
    `nivel actual de yields y con damping cuadrático en los bordes del rango histórico.`,
);

type IncomingMessage = {
  id: string;
  payload: BootstrapInput;
};

type OkResponse = {
  id: string;
  ok: true;
  portfolioReturnsA: Float32Array;
  portfolioReturnsB: Float32Array;
  /** Solo presente si el input pidió outputYieldPaths. */
  yieldPaths?: YieldPathsOutput;
  /** Solo presente si el input pidió outputEtfReturns. */
  etfReturns?: EtfReturnsOutput;
  meta: ReturnType<typeof runBootstrap>['meta'];
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

export type WorkerResponse = OkResponse | ErrResponse | ProgressResponse;

self.onmessage = (event: MessageEvent<IncomingMessage>) => {
  const { id, payload } = event.data;
  try {
    const result = runBootstrap(payload, {
      onProgress: (completedPaths, totalPaths) => {
        const msg: ProgressResponse = { id, progress: true, completedPaths, totalPaths };
        self.postMessage(msg);
      },
    });
    const response: OkResponse = {
      id,
      ok: true,
      portfolioReturnsA: result.portfolioReturnsA,
      portfolioReturnsB: result.portfolioReturnsB,
      meta: result.meta,
    };
    const transferBuffers: ArrayBuffer[] = [
      result.portfolioReturnsA.buffer as ArrayBuffer,
      result.portfolioReturnsB.buffer as ArrayBuffer,
    ];
    if (result.yieldPaths) {
      response.yieldPaths = result.yieldPaths;
      transferBuffers.push(
        result.yieldPaths.IRX.buffer as ArrayBuffer,
        result.yieldPaths.FVX.buffer as ArrayBuffer,
        result.yieldPaths.TNX.buffer as ArrayBuffer,
        result.yieldPaths.TYX.buffer as ArrayBuffer,
      );
    }
    if (result.etfReturns) {
      response.etfReturns = result.etfReturns;
      for (const ticker of Object.keys(result.etfReturns) as (keyof EtfReturnsOutput)[]) {
        transferBuffers.push(result.etfReturns[ticker].buffer as ArrayBuffer);
      }
    }
    // Transfer ownership de los buffers para evitar copias.
    self.postMessage(response, { transfer: transferBuffers });
  } catch (err) {
    const response: ErrResponse = {
      id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(response);
  }
};
