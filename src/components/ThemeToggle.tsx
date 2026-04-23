/**
 * ThemeToggle — botón sol/luna que alterna entre tema claro y oscuro.
 *
 * Persistencia y aplicación del tema vive en `useTheme`. Este componente es
 * solo visual: lee el estado y dispara `toggle()`.
 */

import { useTheme } from '../hooks/useTheme';

export default function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const isDark = theme === 'dark';
  const label = isDark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro';

  return (
    <button
      onClick={toggle}
      aria-label={label}
      title={label}
      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-mercantil-line bg-white text-mercantil-slate transition hover:border-mercantil-orange hover:text-mercantil-orange focus:outline-none focus:ring-2 focus:ring-mercantil-orange focus:ring-offset-2 focus:ring-offset-white dark:border-mercantil-dark-line dark:bg-mercantil-dark-panel dark:text-mercantil-gold-soft dark:hover:text-mercantil-gold dark:focus:ring-offset-mercantil-dark-bg"
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

function SunIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" />
      <path d="m19.07 4.93-1.41 1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}
