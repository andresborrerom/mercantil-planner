/**
 * useTheme — hook de tema claro/oscuro con persistencia en localStorage.
 *
 * Comportamiento:
 *   - Primera visita: usa `prefers-color-scheme` del sistema como default.
 *   - Sesiones subsecuentes: respeta la última elección guardada en
 *     localStorage (`mercantil-planner.theme`).
 *   - Aplica/quita la clase `dark` en `<html>` (Tailwind `darkMode: 'class'`).
 *   - Actualiza `color-scheme` del elemento raíz para que los scrollbars y
 *     form controls nativos también respeten el tema.
 *
 * FOUC (flash of unstyled content) se mitiga con un script inline en
 * `index.html` que corre ANTES de React y aplica la clase al `<html>`.
 */

import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'mercantil-planner.theme';

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    /* localStorage puede fallar en modo privado */
  }
  if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) return 'dark';
  return 'light';
}

function applyTheme(t: Theme): void {
  const root = document.documentElement;
  root.classList.toggle('dark', t === 'dark');
  root.style.colorScheme = t;
}

export function useTheme(): {
  theme: Theme;
  toggle: () => void;
  setTheme: (t: Theme) => void;
} {
  const [theme, setThemeState] = useState<Theme>(() => getInitialTheme());

  useEffect(() => {
    applyTheme(theme);
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      /* noop */
    }
  }, [theme]);

  const setTheme = useCallback((t: Theme) => setThemeState(t), []);

  const toggle = useCallback(() => {
    setThemeState((t) => (t === 'light' ? 'dark' : 'light'));
  }, []);

  return { theme, toggle, setTheme };
}

/** Paleta de colores para los charts (Recharts). Adaptada al tema. */
export type ChartTheme = {
  portfolioA: string;
  portfolioB: string;
  net: string;
  grid: string;
  axis: string;
  tooltipBg: string;
  tooltipBorder: string;
  tooltipText: string;
  tooltipSecondary: string;
};

export const LIGHT_CHART_THEME: ChartTheme = {
  portfolioA: '#213A7D',
  portfolioB: '#E97031',
  net: '#6B7280',
  grid: '#E5E7EF',
  axis: '#6B7280',
  tooltipBg: '#FFFFFF',
  tooltipBorder: '#E5E7EF',
  tooltipText: '#0B1020',
  tooltipSecondary: '#4B5563',
};

export const DARK_CHART_THEME: ChartTheme = {
  portfolioA: '#92A6DE',
  portfolioB: '#F28C5E',
  net: '#9CA3AF',
  grid: '#27325A',
  axis: '#96A0BD',
  tooltipBg: '#141D3C',
  tooltipBorder: '#27325A',
  tooltipText: '#E8ECF5',
  tooltipSecondary: '#96A0BD',
};

export function getChartTheme(theme: Theme): ChartTheme {
  return theme === 'dark' ? DARK_CHART_THEME : LIGHT_CHART_THEME;
}
