import ExportBar from './components/ExportBar';
import FanChart from './components/FanChart';
import FlowEditor from './components/FlowEditor';
import Header from './components/Header';
import PortfolioSelector from './components/PortfolioSelector';
import ProfilePreview from './components/ProfilePreview';
import StatsPanel from './components/StatsPanel';
import ViewsPanel from './components/ViewsPanel';
import { usePlannerStore } from './state/store';

function App() {
  const portfolioA = usePlannerStore((s) => s.portfolioA);
  const portfolioB = usePlannerStore((s) => s.portfolioB);
  const setPortfolioA = usePlannerStore((s) => s.setPortfolioA);
  const setPortfolioB = usePlannerStore((s) => s.setPortfolioB);
  const showProposedAmcs = usePlannerStore((s) => s.showProposedAmcs);
  const setShowProposedAmcs = usePlannerStore((s) => s.setShowProposedAmcs);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1">
        {/* Hero compacto — introducción. El botón de Simular vive junto al FanChart
             para que el flujo natural arriba-abajo termine en la acción y el asesor
             vea el resultado armarse sin volver a la parte superior. */}
        <section className="bg-gradient-to-br from-mercantil-navy via-mercantil-navy to-mercantil-navy-soft text-white">
          <div className="mx-auto max-w-7xl px-6 py-10">
            <p className="text-[11px] uppercase tracking-[0.18em] text-mercantil-gold-soft">
              Mercantil SFI · Quantitative Research
            </p>
            <h1 className="mt-1 text-3xl md:text-4xl font-semibold text-white">
              Planificador patrimonial
            </h1>
            <p className="mt-2 text-sm md:text-base text-white/80 max-w-2xl">
              Simulá el camino patrimonial de un cliente en dos portafolios en paralelo,
              con flujos configurables hasta 30 años. Definí de arriba hacia abajo y presioná
              <strong className="text-white"> Simular</strong> junto al gráfico para ver la proyección armarse.
            </p>
          </div>
        </section>

        {/* Body */}
        <section className="mx-auto max-w-7xl px-6 py-8 space-y-6">
          {/* Fila 1: Portafolios A y B */}
          <div className="space-y-2">
            <div className="flex items-center justify-end">
              <label
                className="flex items-center gap-2 text-xs text-mercantil-slate dark:text-mercantil-dark-slate cursor-pointer hover:text-mercantil-ink dark:hover:text-mercantil-dark-ink select-none"
                title="Los AMCs propuestos (CashST, USGrTech, USTDur) aún no están aprobados. Mostralos para incluirlos en la selección."
              >
                <input
                  type="checkbox"
                  checked={showProposedAmcs}
                  onChange={(e) => setShowProposedAmcs(e.target.checked)}
                  className="accent-mercantil-orange h-3.5 w-3.5"
                />
                Mostrar AMCs propuestos
              </label>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <PortfolioSelector
                label="Portafolio A"
                accentClass="A"
                value={portfolioA}
                onChange={setPortfolioA}
              />
              <PortfolioSelector
                label="Portafolio B"
                accentClass="B"
                value={portfolioB}
                onChange={setPortfolioB}
              />
            </div>
          </div>

          {/* Fila 2: Perfil + escenario sample */}
          <ProfilePreview />

          {/* Fila 3: Flow editor */}
          <FlowEditor />

          {/* Fila 3: Fan chart */}
          <FanChart />

          {/* Fila 4: Stats */}
          <StatsPanel />

          {/* Fila 4b: Views (análisis condicional) */}
          <ViewsPanel />

          {/* Fila 5: Export */}
          <ExportBar />
        </section>
      </main>

      <footer className="border-t border-mercantil-line bg-white dark:bg-mercantil-dark-panel dark:border-mercantil-dark-line">
        <div className="mx-auto max-w-7xl px-6 py-5 text-xs text-mercantil-slate dark:text-mercantil-dark-slate flex items-center justify-between">
          <span>
            Mercantil SFI · Herramienta interna · © {new Date().getFullYear()}
          </span>
          <span className="text-mercantil-slate/70 dark:text-mercantil-dark-slate/70">
            Fase 2 · Block bootstrap 2006–2026 + RF yield-path
          </span>
        </div>
      </footer>
    </div>
  );
}

export default App;
