/**
 * Header estilo Mercantil — replica visualmente el top bar de mercantilbanco.com.pa:
 * logo "M" dorada + wordmark "Mercantil" con swoosh naranja + nav con subrayado
 * naranja en item activo + botones CTA a la derecha.
 *
 * Renderiza un badge informativo "Fase 2 · RF yield-path" que indica que los 11
 * tickers de renta fija usan reconstrucción estructural (carry evolutivo + duration·Δy
 * + ½·conv·Δy² + residual credit bootstrapeado). El motor de bootstrap imprime también
 * el detalle en consola al arrancar.
 *
 * Incluye un `ThemeToggle` para alternar entre tema claro y oscuro.
 */
import ThemeToggle from './ThemeToggle';

export default function Header() {
  const navItems = [
    { label: 'Planificador', active: true },
    { label: 'Portafolios', active: false },
    { label: 'Flujos', active: false },
    { label: 'Reportes', active: false },
  ];

  return (
    <header className="sticky top-0 z-20 bg-white border-b border-mercantil-line shadow-sm dark:bg-mercantil-dark-panel dark:border-mercantil-dark-line dark:shadow-none">
      <div className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BrandMark />
          <div className="hidden md:flex items-center gap-2 leading-none">
            <span className="text-2xl font-semibold text-mercantil-navy tracking-tight dark:text-mercantil-dark-ink">
              Mercantil
            </span>
            <Swoosh />
          </div>
          <PhaseBadge />
        </div>

        <nav className="hidden lg:flex items-center gap-8">
          {navItems.map((item) => (
            <button
              key={item.label}
              className={[
                'relative text-sm font-medium transition',
                item.active
                  ? 'text-mercantil-navy dark:text-mercantil-dark-ink'
                  : 'text-mercantil-slate hover:text-mercantil-navy dark:text-mercantil-dark-slate dark:hover:text-mercantil-dark-ink',
              ].join(' ')}
            >
              {item.label}
              {item.active && (
                <span className="absolute -bottom-5 left-0 right-0 h-[3px] bg-mercantil-orange rounded-full" />
              )}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button className="mp-btn-outline hidden sm:inline-flex">
            Guía del asesor
          </button>
          <button className="mp-btn-primary">
            Mercantil en Línea
            <span aria-hidden className="ml-1">
              ▾
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}

/** Círculo con "M" dorada, evocando el 100 + logo del sitio. */
function BrandMark() {
  return (
    <div className="flex items-center justify-center h-10 w-10 rounded-full bg-mercantil-navy">
      <span className="font-serif text-xl text-mercantil-gold-soft leading-none">
        M
      </span>
    </div>
  );
}

/**
 * Badge informativo que indica que los 11 tickers de renta fija usan
 * reconstrucción yield-path (Fase 2): carry evolutivo a partir del nivel actual
 * de tasas + duration·Δy + ½·conv·Δy² + residual credit bootstrapeado del mismo
 * bloque histórico. Damping cuadrático en los extremos del rango histórico
 * (piso = min − 0.5%, techo = max × 1.5). La lista de tickers se inlinea en el
 * tooltip para no arrastrar market.generated.ts (~400 KB) al bundle principal.
 */
function PhaseBadge() {
  return (
    <span
      className="hidden lg:inline-flex items-center gap-1.5 ml-3 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-900 border border-emerald-300 text-[11px] font-semibold cursor-help"
      title={
        'Fase 2 del motor RF: los 11 tickers de renta fija (BIL, SPTS, IEI, IEF, SPTL, ' +
        'IGOV, AGG, LQD, GHYG, EMB, CEMB) usan reconstrucción yield-path. Cada mes, ' +
        'el carry se deriva del nivel simulado de yield (partiendo del último observado) ' +
        'y el retorno por precio de duration·Δy + ½·conv·Δy². Para credit/EM el modelo ' +
        'suma un residual bootstrapeado que captura el spread premium. Damping cuadrático ' +
        'fuera del rango histórico (piso = min − 0.5%, techo = max × 1.5).'
      }
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-600" />
      Fase 2 · RF yield-path
    </span>
  );
}

/** Pequeño swoosh naranja que acompaña el wordmark. */
function Swoosh() {
  return (
    <svg
      width="22"
      height="14"
      viewBox="0 0 22 14"
      fill="none"
      aria-hidden
      className="translate-y-[1px]"
    >
      <path
        d="M1 9 C 6 1, 14 1, 21 6"
        stroke="#E97031"
        strokeWidth="3"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="21" cy="6" r="2.5" fill="#E97031" />
    </svg>
  );
}
