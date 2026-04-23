/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Paleta Mercantil (referencia: mercantilbanco.com.pa)
        mercantil: {
          navy: '#213A7D',        // azul corporativo principal
          'navy-deep': '#17285A',  // hover / bordes fuertes
          'navy-soft': '#3B5BA9',  // azul medio (hero gradient, fondos)
          orange: '#E97031',       // naranja acento (CTA, highlights)
          'orange-deep': '#C85A1F',
          gold: '#C9A84C',         // dorado (logo "M", acentos premium)
          'gold-soft': '#E2C878',
          ink: '#0B1020',          // texto principal sobre blanco
          slate: '#4B5563',        // texto secundario
          mist: '#F4F6FB',         // fondo de página / tarjetas
          line: '#E5E7EF',         // bordes sutiles
          // Dark-mode palette (navy-tinted para preservar identidad Mercantil)
          'dark-bg': '#0A1025',       // fondo de página
          'dark-panel': '#141D3C',    // fondo de cards/paneles
          'dark-line': '#27325A',     // bordes sutiles en dark
          'dark-ink': '#E8ECF5',      // texto primario
          'dark-slate': '#96A0BD',    // texto secundario
          'dark-navy-text': '#92A6DE', // navy iluminado para headers en dark
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
      },
      boxShadow: {
        card: '0 1px 2px rgba(11,16,32,0.04), 0 4px 16px rgba(11,16,32,0.06)',
        'card-hover':
          '0 2px 4px rgba(11,16,32,0.06), 0 12px 32px rgba(11,16,32,0.10)',
      },
      borderRadius: {
        card: '14px',
      },
    },
  },
  plugins: [],
};
