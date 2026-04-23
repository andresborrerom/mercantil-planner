/**
 * Generadores pseudo-aleatorios deterministas.
 *
 * Se usa Mulberry32: 32-bit state, ~1 ns por llamada en V8, periodo 2^32,
 * suficientemente bueno para simulaciones Monte Carlo no criptográficas.
 * Reproducible dado un seed.
 */

/**
 * Crea un generador de números en [0, 1) a partir de un seed de 32 bits.
 * Dos llamadas con el mismo seed producen exactamente la misma secuencia.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function (): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/**
 * Entero uniforme en [0, maxExclusive). Usa el rand() provisto.
 * Sesgo despreciable si maxExclusive << 2^32 (nuestro caso: < 400).
 */
export function randInt(rand: () => number, maxExclusive: number): number {
  return Math.floor(rand() * maxExclusive);
}
