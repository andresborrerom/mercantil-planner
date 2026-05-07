/**
 * build-instructivo.mjs — build production del instructivo HTML responsive.
 *
 * A diferencia de build-instructivo-preview.mjs (que genera _preview.html
 * gitignored para validación interna), este produce un HTML production-grade
 * con CSS mobile-first, sidebar TOC drawer en celular, lazy-loading de
 * imágenes, y paleta Mercantil real. El output se commitea al repo y se
 * publica via GitHub Pages.
 *
 * Uso:
 *   npm run instructivo:build                              # output a instructivo/dist/
 *   node scripts/build-instructivo.mjs --out=dist/instructivo  # output custom
 */

import { copyFile, mkdir, readdir, rm } from 'node:fs/promises';
import { existsSync, readFileSync as readSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');
const INSTRUCTIVO_DIR = join(ROOT, 'instructivo');
const ASSETS_SRC = join(INSTRUCTIVO_DIR, 'assets');

// Parse --out=<dir> argument
const outArg = process.argv.find((a) => a.startsWith('--out='));
const OUT_DIR = outArg
  ? resolve(ROOT, outArg.slice('--out='.length))
  : join(INSTRUCTIVO_DIR, 'dist');
const OUT_HTML = join(OUT_DIR, 'index.html');
const OUT_ASSETS = join(OUT_DIR, 'assets');

// Orden canónico de las partes (mismo que preview).
const PARTS_ORDERED = [
  { file: 'parte-0-portada.md', title: 'Portada' },
  { file: 'parte-1-por-que-confiar.md', title: 'Parte 1 — Por qué confiar' },
  { file: 'parte-2-mapa-herramienta.md', title: 'Parte 2 — Mapa de la herramienta' },
  { file: 'parte-3-los-cuatro-pasos.md', title: 'Parte 3 — Los cuatro pasos' },
  { file: 'parte-4-glosario-nueve-indicadores.md', title: 'Parte 4 — Los 9 indicadores' },
  { file: 'parte-4b-seguimiento-futuro.md', title: 'Parte 4b — Seguimiento futuro' },
  { file: 'parte-4c-manejo-de-views.md', title: 'Parte 4c — Manejo de views' },
  { file: 'parte-5-casos-cliente.md', title: 'Parte 5 — Casos de cliente' },
  { file: 'parte-6-faq-y-limites.md', title: 'Parte 6 — FAQ y límites' },
  { file: 'parte-7-troubleshooting.md', title: 'Parte 7 — Troubleshooting' },
];

marked.use({ gfm: true, breaks: false });

function slugify(s) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Lazy-load attribute en imágenes via marked renderer custom.
const renderer = new marked.Renderer();
const baseImage = renderer.image.bind(renderer);
renderer.image = function (href, title, text) {
  const html = baseImage(href, title, text);
  return html.replace('<img ', '<img loading="lazy" decoding="async" ');
};

const parts = [];
for (const part of PARTS_ORDERED) {
  const filePath = join(INSTRUCTIVO_DIR, part.file);
  if (!existsSync(filePath)) {
    console.warn(`[build-instructivo] Falta ${part.file} — se omite`);
    continue;
  }
  const md = readSync(filePath, 'utf8');
  const html = marked.parse(md, { renderer });
  const slug = slugify(part.title);
  parts.push({ ...part, slug, html });
}

const generatedAt = new Date().toLocaleString('es-VE', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const toc = parts
  .map(
    (p) =>
      `<li><a href="#${p.slug}" data-slug="${p.slug}">${p.title}</a></li>`,
  )
  .join('\n');

const body = parts
  .map(
    (p) =>
      `<section class="part" id="${p.slug}">
        ${p.html}
      </section>`,
  )
  .join('\n');

// Mercantil palette desde tailwind.config.js (mantener sincronizado).
const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#213A7D">
  <title>Instructivo del Planificador Patrimonial — Mercantil AWM</title>
  <style>
:root {
  --navy: #213A7D;
  --navy-deep: #17285A;
  --navy-soft: #3B5BA9;
  --orange: #E97031;
  --orange-deep: #C85A1F;
  --gold: #C9A84C;
  --ink: #0B1020;
  --slate: #4B5563;
  --mist: #F4F6FB;
  --line: #E5E7EF;
  --bg: #FFFFFF;
  --code-bg: #F1F5F9;
  --shadow-card: 0 1px 2px rgba(11,16,32,0.04), 0 4px 16px rgba(11,16,32,0.06);
}

* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
html { scroll-behavior: smooth; -webkit-text-size-adjust: 100%; }

body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: 16px;
  line-height: 1.55;
  color: var(--ink);
  background: var(--bg);
  -webkit-font-smoothing: antialiased;
}

/* Top bar — móvil only, oculta en desktop */
.topbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--navy);
  color: white;
  position: sticky;
  top: 0;
  z-index: 100;
  box-shadow: 0 1px 8px rgba(0,0,0,0.15);
}
.topbar h1 {
  font-size: 16px;
  font-weight: 600;
  margin: 0;
  flex: 1;
  letter-spacing: 0.01em;
}
.topbar h1 strong { color: var(--gold); }
.menu-toggle {
  background: transparent;
  border: 1px solid rgba(255,255,255,0.3);
  color: white;
  width: 38px;
  height: 38px;
  border-radius: 6px;
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.menu-toggle:hover { background: rgba(255,255,255,0.1); }

/* Layout principal */
.layout {
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  max-width: 1280px;
  margin: 0 auto;
  gap: 0;
}

/* Sidebar TOC */
.toc {
  background: var(--mist);
  border-right: 1px solid var(--line);
  padding: 32px 20px;
  position: sticky;
  top: 0;
  align-self: start;
  max-height: 100vh;
  overflow-y: auto;
  font-size: 14px;
}
.toc-header {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--slate);
  margin-bottom: 12px;
}
.toc ol {
  list-style: none;
  padding: 0;
  margin: 0;
  counter-reset: toc;
}
.toc li {
  counter-increment: toc;
  margin-bottom: 4px;
}
.toc a {
  display: block;
  padding: 6px 10px;
  border-radius: 6px;
  color: var(--ink);
  text-decoration: none;
  border-left: 3px solid transparent;
  transition: background 0.15s, border-color 0.15s;
}
.toc a:hover { background: white; }
.toc a.active {
  background: white;
  border-left-color: var(--orange);
  color: var(--navy);
  font-weight: 600;
}

/* Main content */
main {
  padding: 48px 56px 96px;
  min-width: 0;
}
.banner {
  background: var(--mist);
  border-left: 4px solid var(--orange);
  padding: 14px 18px;
  font-size: 13px;
  color: var(--slate);
  margin-bottom: 36px;
  border-radius: 0 6px 6px 0;
}
.banner strong { color: var(--ink); }

.part {
  border-bottom: 1px solid var(--line);
  padding-bottom: 56px;
  margin-bottom: 56px;
}
.part:last-child { border-bottom: none; }

/* Tipografía */
h1, h2, h3, h4, h5 {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", Roboto, sans-serif;
  color: var(--navy);
  line-height: 1.25;
  margin-top: 1.6em;
  margin-bottom: 0.5em;
  font-weight: 700;
}
h1 {
  font-size: 32px;
  border-bottom: 3px solid var(--navy);
  padding-bottom: 12px;
  margin-top: 0;
  letter-spacing: -0.01em;
}
h2 {
  font-size: 24px;
  border-bottom: 1px solid var(--line);
  padding-bottom: 8px;
}
h3 { font-size: 19px; }
h4 { font-size: 16px; color: var(--slate); text-transform: uppercase; letter-spacing: 0.04em; }
p, ul, ol { margin: 0.9em 0; }
li { margin-bottom: 0.3em; }
strong { color: var(--ink); font-weight: 600; }
a { color: var(--orange-deep); }
a:hover { color: var(--orange); }

/* Code */
code {
  font-family: "SF Mono", "Consolas", "Monaco", "Courier New", monospace;
  background: var(--code-bg);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.88em;
  color: var(--navy-deep);
}
pre {
  background: var(--code-bg);
  border: 1px solid var(--line);
  border-radius: 8px;
  padding: 14px 18px;
  overflow-x: auto;
  font-size: 13px;
  line-height: 1.5;
}
pre code { background: none; padding: 0; }

/* Blockquote — frases-modelo al cliente */
blockquote {
  border-left: 4px solid var(--orange);
  padding: 4px 18px;
  color: var(--slate);
  margin: 1.2em 0;
  font-style: italic;
  background: rgba(233,112,49,0.04);
  border-radius: 0 6px 6px 0;
}
blockquote strong { color: var(--ink); }

/* Tablas */
table {
  border-collapse: collapse;
  width: 100%;
  margin: 1.2em 0;
  font-size: 14px;
  display: block;
  overflow-x: auto;
}
@media (min-width: 768px) {
  table { display: table; }
}
th, td {
  border: 1px solid var(--line);
  padding: 10px 14px;
  text-align: left;
  vertical-align: top;
}
th {
  background: var(--mist);
  font-weight: 600;
  color: var(--navy);
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
tbody tr:nth-child(even) { background: rgba(244,246,251,0.5); }

hr {
  border: none;
  border-top: 1px solid var(--line);
  margin: 2.2em 0;
}

/* Imágenes — responsive con borde sutil */
img {
  max-width: 100%;
  height: auto;
  display: block;
  margin: 1.4em auto;
  border: 1px solid var(--line);
  border-radius: 6px;
  box-shadow: var(--shadow-card);
}
/* Caption en cursiva (markdown lo renderea como em dentro de p) */
img + em, p > em:only-child {
  display: block;
  text-align: center;
  color: var(--slate);
  font-size: 13px;
  margin-top: -0.6em;
  margin-bottom: 1.8em;
}

/* GIFs marcadores en cursiva — los rezagados se ven distintos */
p:has(> em:only-child:not(:has(*))) em { font-style: italic; }

/* ===========================================================
   Mobile (< 768px) — TOC se vuelve drawer hamburguesa
   =========================================================== */
@media (max-width: 767px) {
  body { font-size: 15px; }
  .topbar { display: flex; }
  .layout { grid-template-columns: 1fr; max-width: 100%; }
  main { padding: 24px 18px 64px; }
  h1 { font-size: 26px; }
  h2 { font-size: 21px; }
  h3 { font-size: 17px; }

  .toc {
    position: fixed;
    top: 62px; /* topbar height */
    left: 0;
    width: 88%;
    max-width: 320px;
    height: calc(100vh - 62px);
    background: var(--mist);
    border-right: 1px solid var(--line);
    z-index: 99;
    transform: translateX(-100%);
    transition: transform 0.25s ease-in-out;
    box-shadow: 4px 0 24px rgba(0,0,0,0.12);
  }
  .toc.open { transform: translateX(0); }
  .toc-backdrop {
    display: none;
    position: fixed;
    inset: 62px 0 0 0;
    background: rgba(0,0,0,0.4);
    z-index: 98;
  }
  .toc.open ~ .toc-backdrop { display: block; }

  pre { font-size: 12px; }
  table { font-size: 13px; }
}

/* ===========================================================
   Desktop (>= 768px) — TOC siempre visible, topbar oculta
   =========================================================== */
@media (min-width: 768px) {
  .topbar { display: none; }
  .toc-backdrop { display: none !important; }
}

/* Print */
@media print {
  .topbar, .toc, .toc-backdrop, .menu-toggle { display: none !important; }
  .layout { grid-template-columns: 1fr; }
  main { padding: 0; }
  img { box-shadow: none; page-break-inside: avoid; }
  .part { page-break-after: always; }
}
  </style>
</head>
<body>
  <header class="topbar">
    <button class="menu-toggle" aria-label="Abrir menú" id="menu-toggle">☰</button>
    <h1><strong>Mercantil AWM</strong> — Instructivo del Planificador</h1>
  </header>
  <div class="layout">
    <nav class="toc" id="toc">
      <div class="toc-header">Contenido</div>
      <ol>${toc}</ol>
    </nav>
    <div class="toc-backdrop" id="toc-backdrop"></div>
    <main>
      <div class="banner">
        <strong>Instructivo del Planificador Patrimonial — Mercantil AWM.</strong>
        Material de capacitación + ficha de consulta rápida para el equipo
        comercial. Generado: ${generatedAt}.
      </div>
      ${body}
    </main>
  </div>
  <script>
    // Drawer toggle (móvil)
    (function () {
      const toc = document.getElementById('toc');
      const backdrop = document.getElementById('toc-backdrop');
      const toggle = document.getElementById('menu-toggle');
      function close() {
        toc.classList.remove('open');
      }
      toggle.addEventListener('click', () => toc.classList.toggle('open'));
      backdrop.addEventListener('click', close);
      // Cerrar drawer al click en un link del TOC.
      toc.querySelectorAll('a').forEach((a) => a.addEventListener('click', close));
    })();
    // Active link highlight via IntersectionObserver.
    (function () {
      const links = document.querySelectorAll('.toc a[data-slug]');
      const map = new Map();
      links.forEach((a) => map.set(a.dataset.slug, a));
      const sections = document.querySelectorAll('.part[id]');
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              links.forEach((a) => a.classList.remove('active'));
              const a = map.get(entry.target.id);
              if (a) a.classList.add('active');
            }
          });
        },
        { rootMargin: '-30% 0px -60% 0px', threshold: 0 },
      );
      sections.forEach((s) => observer.observe(s));
    })();
  </script>
</body>
</html>`;

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

async function buildInstructivo() {
  // Limpiar y recrear OUT_DIR
  if (existsSync(OUT_DIR)) {
    await rm(OUT_DIR, { recursive: true, force: true });
  }
  await mkdir(OUT_DIR, { recursive: true });
  await mkdir(OUT_ASSETS, { recursive: true });

  // Escribir HTML
  writeFileSync(OUT_HTML, html, 'utf8');

  // Copiar assets
  let assetCount = 0;
  if (existsSync(ASSETS_SRC)) {
    const files = await readdir(ASSETS_SRC);
    for (const f of files) {
      if (f.startsWith('.') || f.startsWith('_')) continue;
      await copyFile(join(ASSETS_SRC, f), join(OUT_ASSETS, f));
      assetCount++;
    }
  }

  console.log(`[build-instructivo] ✓ HTML emitido: ${OUT_HTML}`);
  console.log(`[build-instructivo]   ${parts.length} partes, ${assetCount} assets copiados`);
  console.log(`[build-instructivo]   Abrir con: start "" "${OUT_HTML.replace(/\//g, '\\')}"`);
}

buildInstructivo().catch((err) => {
  console.error('[build-instructivo] ✗ Falló:', err);
  process.exitCode = 1;
});
