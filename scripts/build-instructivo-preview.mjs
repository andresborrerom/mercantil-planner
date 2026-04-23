/**
 * build-instructivo-preview.mjs — genera un HTML interim del instructivo.
 *
 * Concatena los .md existentes en `instructivo/` (en orden canónico del
 * README.md) y los renderea a un único HTML con CSS legible. Pensado como
 * preview rápido antes del build final del PDF con Pandoc + LaTeX.
 *
 * Output: `instructivo/_preview.html` (gitignored). Abrir en browser con:
 *   start "" "instructivo\_preview.html"   (Windows)
 *
 * Uso: `npm run preview:instructivo`
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const INSTRUCTIVO_DIR = join(__dirname, '..', 'instructivo');
const OUTPUT = join(INSTRUCTIVO_DIR, '_preview.html');

// Orden canónico según instructivo/README.md. Partes pendientes se omiten
// silenciosamente (se listan en el TOC con tag "pendiente" al final).
const PARTS_ORDERED = [
  { file: 'README.md', title: 'Índice y convenciones' },
  { file: 'parte-1-por-que-confiar.md', title: 'Parte 1 — Por qué confiar' },
  { file: 'parte-2-mapa-herramienta.md', title: 'Parte 2 — Mapa de la herramienta' },
  { file: 'parte-3-los-cuatro-pasos.md', title: 'Parte 3 — Los cuatro pasos' },
  { file: 'parte-4-glosario-nueve-indicadores.md', title: 'Parte 4 — Glosario de los 9 indicadores' },
  { file: 'parte-4b-seguimiento-futuro.md', title: 'Parte 4b — Seguimiento futuro' },
  { file: 'parte-4c-manejo-de-views.md', title: 'Parte 4c — Manejo de views' },
  { file: 'parte-5-casos-cliente.md', title: 'Parte 5 — Casos de cliente' },
  { file: 'parte-6-faq-y-limites.md', title: 'Parte 6 — FAQ y límites' },
  { file: 'parte-7-troubleshooting.md', title: 'Parte 7 — Troubleshooting' },
];

// Configuración de marked — github-flavored con headings anchors.
marked.use({
  gfm: true,
  breaks: false,
});

function slugify(s) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function renderPart(file, title) {
  const path = join(INSTRUCTIVO_DIR, file);
  if (!existsSync(path)) {
    return {
      file,
      title,
      status: 'pendiente',
      html: `<section id="${slugify(title)}" class="part pending">
        <h1>${title}</h1>
        <p class="pending-note"><strong>Pendiente.</strong> Este archivo (<code>${file}</code>) todavía no se ha escrito.</p>
      </section>`,
    };
  }
  const md = readFileSync(path, 'utf8');
  const body = marked.parse(md);
  return {
    file,
    title,
    status: 'ok',
    html: `<section id="${slugify(title)}" class="part">${body}</section>`,
  };
}

const parts = PARTS_ORDERED.map((p) => renderPart(p.file, p.title));

const toc = parts
  .map((p) => {
    const anchor = slugify(p.title);
    const tag = p.status === 'pendiente'
      ? ' <span class="badge badge-pending">pendiente</span>'
      : '';
    return `<li><a href="#${anchor}">${p.title}</a>${tag}</li>`;
  })
  .join('\n');

const body = parts.map((p) => p.html).join('\n');

const generatedAt = new Date().toISOString().replace('T', ' ').slice(0, 19);

const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<title>Instructivo del Planificador Patrimonial — preview</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  :root {
    --navy: #213A7D;
    --navy-deep: #1a2e63;
    --orange: #E97031;
    --ink: #1f2937;
    --slate: #64748b;
    --line: #e5e7eb;
    --mist: #f8fafc;
    --amber-bg: #fffbeb;
    --amber-ink: #92400e;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: "IBM Plex Serif", "Georgia", serif;
    font-size: 16px;
    line-height: 1.6;
    color: var(--ink);
    background: #fff;
  }
  .layout {
    display: grid;
    grid-template-columns: 280px 1fr;
    max-width: 1280px;
    margin: 0 auto;
    gap: 32px;
    padding: 24px;
  }
  nav.toc {
    position: sticky;
    top: 24px;
    align-self: start;
    max-height: calc(100vh - 48px);
    overflow-y: auto;
    border-right: 1px solid var(--line);
    padding-right: 16px;
    font-family: "Inter", "Segoe UI", sans-serif;
    font-size: 14px;
  }
  nav.toc h2 {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--slate);
    margin: 0 0 8px;
  }
  nav.toc ol { list-style: decimal; padding-left: 20px; margin: 0; }
  nav.toc li { margin: 6px 0; }
  nav.toc a {
    color: var(--navy);
    text-decoration: none;
  }
  nav.toc a:hover { text-decoration: underline; }
  .badge {
    display: inline-block;
    font-size: 10px;
    padding: 2px 6px;
    border-radius: 10px;
    margin-left: 4px;
    font-family: "Inter", sans-serif;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .badge-pending {
    background: var(--amber-bg);
    color: var(--amber-ink);
    border: 1px solid var(--amber-ink);
  }
  main {
    max-width: 780px;
    min-width: 0;
  }
  .banner {
    background: var(--mist);
    border: 1px solid var(--line);
    border-left: 4px solid var(--orange);
    padding: 12px 16px;
    font-family: "Inter", sans-serif;
    font-size: 13px;
    color: var(--slate);
    margin-bottom: 32px;
  }
  .banner strong { color: var(--ink); }
  .part {
    border-bottom: 1px solid var(--line);
    padding-bottom: 48px;
    margin-bottom: 48px;
  }
  .part.pending {
    background: var(--amber-bg);
    border-left: 4px solid var(--amber-ink);
    padding: 16px 20px;
    border-radius: 6px;
    border-bottom: none;
    margin-bottom: 32px;
  }
  .pending-note { margin: 0; color: var(--amber-ink); }
  h1, h2, h3, h4 {
    font-family: "Inter", "Segoe UI", sans-serif;
    color: var(--navy);
    line-height: 1.25;
    margin-top: 1.8em;
    margin-bottom: 0.5em;
  }
  h1 { font-size: 28px; border-bottom: 2px solid var(--navy); padding-bottom: 8px; margin-top: 0; }
  h2 { font-size: 22px; }
  h3 { font-size: 18px; }
  h4 { font-size: 16px; color: var(--slate); }
  p, ul, ol { margin: 0.8em 0; }
  code {
    font-family: "Consolas", "Monaco", monospace;
    background: var(--mist);
    padding: 1px 5px;
    border-radius: 3px;
    font-size: 0.9em;
  }
  pre {
    background: var(--mist);
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 12px 16px;
    overflow-x: auto;
    font-size: 13px;
  }
  pre code { background: none; padding: 0; }
  blockquote {
    border-left: 3px solid var(--orange);
    padding-left: 16px;
    color: var(--slate);
    margin: 1em 0;
    font-style: italic;
  }
  table {
    border-collapse: collapse;
    width: 100%;
    margin: 1em 0;
    font-size: 14px;
    font-family: "Inter", sans-serif;
  }
  th, td {
    border: 1px solid var(--line);
    padding: 8px 12px;
    text-align: left;
  }
  th { background: var(--mist); font-weight: 600; color: var(--navy); }
  hr { border: none; border-top: 1px solid var(--line); margin: 2em 0; }
  a { color: var(--orange); }
  strong { color: var(--ink); }
</style>
</head>
<body>
  <div class="layout">
    <nav class="toc">
      <h2>Contenido</h2>
      <ol>${toc}</ol>
    </nav>
    <main>
      <div class="banner">
        <strong>Preview HTML interim.</strong> Este archivo se generó desde los
        markdown de <code>instructivo/</code> con marked. Parts marcadas
        <span class="badge badge-pending">pendiente</span> aún no se escribieron.
        El PDF final se construye con Pandoc + LaTeX; este HTML es solo para
        lectura y revisión editorial. Generado: ${generatedAt}.
      </div>
      ${body}
    </main>
  </div>
</body>
</html>`;

writeFileSync(OUTPUT, html, 'utf8');

const okCount = parts.filter((p) => p.status === 'ok').length;
const pendingCount = parts.filter((p) => p.status === 'pendiente').length;
console.log(`[instructivo-preview] ✓ emitido ${OUTPUT}`);
console.log(`[instructivo-preview]   ${okCount} parts rendereadas, ${pendingCount} pendientes.`);
console.log(`[instructivo-preview] Abrir con: start "" "${OUTPUT.replace(/\//g, '\\')}"`);
