import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    globals: false,
    // Los tests del dominio son puros — no necesitan DOM ni React.
    // Los componentes UI se testean aparte con jsdom si llega a hacer falta.
  },
});
