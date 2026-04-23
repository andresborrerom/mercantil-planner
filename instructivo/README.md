# Instructivo del Planificador Patrimonial — fuente Markdown

Carpeta de trabajo para el **instructivo comercial en PDF** del Planificador Patrimonial de Mercantil SFI. Los archivos `.md` de esta carpeta son la fuente de contenido; el PDF final se genera con Pandoc (ver sección de build al final).

## Audiencia y contexto de uso

- Equipo comercial completo (asesores senior + junior), usando el instructivo como material de capacitación y como ficha de consulta rápida.
- Contexto típico: el asesor arma el portafolio **junto con el cliente** en una reunión en vivo, con la herramienta abierta en pantalla.
- Principio rector: *"el riesgo real no es la volatilidad, es no cumplir el objetivo"*. El instructivo explica cada indicador bajo esa lente y, en paralelo, documenta el costo del camino (vol, drawdown, meses negativos) para generar un contrato emocional explícito con el cliente que facilite el seguimiento posterior.

## Índice

| Parte | Archivo | Estado |
|---|---|---|
| 0 | Portada e índice del PDF | pendiente |
| 1 | `parte-1-por-que-confiar.md` — generar confianza sin jargon | borrador v1 |
| 2 | `parte-2-mapa-herramienta.md` — overview visual del flow | pendiente |
| 3 | `parte-3-los-cuatro-pasos.md` — manual operativo paso a paso | pendiente |
| 4 | `parte-4-glosario-nueve-indicadores.md` — 9 métricas con uso inicial + uso en seguimiento | borrador v1 |
| 4b | `parte-4b-seguimiento-futuro.md` — cómo usar la tool para monitorear | pendiente |
| 4c | `parte-4c-manejo-de-views.md` — análisis condicional: presets, lectura y conversación | borrador v1 |
| 5 | `parte-5-casos-cliente.md` — Pablo / Diana / Marta / Carlos | borrador v1 |
| 6 | `parte-6-faq-y-limites.md` | borrador v1 |
| 7 | `parte-7-troubleshooting.md` | borrador v1 |

## Convenciones

- **Moneda**: USD con separador de miles por punto y decimal por coma (ej. `USD 1.200.000` o `USD 2,7 millones`).
- **Porcentajes**: un decimal cuando aporta (`7,5%`), sin decimal cuando no (`5%`).
- **Puntos porcentuales**: escribir "puntos porcentuales" o "pp" para diferenciar de porcentajes relativos.
- **Tono con el cliente**: siempre "usted". Las frases sugeridas al cliente van en *cursiva entre comillas*.
- **Tono con el asesor (lector del instructivo)**: neutral profesional, léxico bogotano.

## Stack de producción (open-source)

- **Fuente**: Markdown (`.md`) en esta carpeta.
- **Screenshots**: Greenshot (captura con anotaciones) — https://getgreenshot.org
- **GIFs**: ScreenToGif — https://www.screentogif.com
- **Diagramas vectoriales**: Inkscape — https://inkscape.org
- **Edición de imágenes**: GIMP — https://www.gimp.org
- **Generación del PDF**: Pandoc + LaTeX (MiKTeX en Windows).
- **Fuentes**: Inter (UI) + IBM Plex Serif (texto largo), ambas con licencia OFL.

## Build del PDF (cuando esté completo)

```bash
cd instructivo/
pandoc portada.md parte-1-*.md parte-2-*.md ... \
       -o instructivo-planificador-mercantil.pdf \
       --pdf-engine=xelatex \
       --toc \
       --number-sections \
       -V mainfont="IBM Plex Serif" \
       -V sansfont="Inter"
```

Los screenshots y GIFs viven en `instructivo/assets/` y se referencian con paths relativos desde los `.md`.

## Flujo de trabajo

1. Completar todos los borradores de contenido en Markdown.
2. Tomar screenshots y GIFs con la herramienta abierta en vivo — usar casos reales del archivo `parte-5-*` para que los visuales matcheen los ejemplos del texto.
3. Revisión editorial final (un solo asesor senior lee el PDF completo y anota).
4. Build con Pandoc, revisión visual del PDF.
5. Distribución interna al equipo comercial.
