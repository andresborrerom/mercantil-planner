# Planificador Patrimonial — Mercantil AWM

## Manual operativo y guía de conversación con cliente

> *El riesgo real no es la volatilidad. Es no cumplir el objetivo.*

---

## A quién está dirigido este documento

Equipo comercial de Mercantil AWM — asesores senior y junior. El instructivo cumple dos funciones simultáneas:

- **Material de capacitación** para el asesor que se acerca a la herramienta por primera vez. Cubre desde el racional metodológico (por qué los resultados son confiables) hasta el manejo operativo paso a paso.
- **Ficha de consulta rápida** durante la reunión con cliente. Las partes 4, 4c y 5 están redactadas para que el asesor pueda releerlas en treinta segundos antes de entrar a la sala.

El asesor arma el portafolio **junto con el cliente**, en vivo y con la herramienta abierta en pantalla. Esa es la forma esperada de uso. Las frases en *cursiva entre comillas* son sugerencias literales para usar con el cliente.

---

## Qué encuentra dentro

| Parte | Contenido |
|---|---|
| 1 | Por qué puede confiar en esta herramienta — el racional metodológico que el asesor usa para responder *"¿este modelo es serio?"*. |
| 2 | Mapa de la herramienta — un recorrido visual por la pantalla, zona por zona, para ubicar cada control. |
| 3 | Los cuatro pasos operativos — el flujo que el asesor sigue en cada reunión: configurar, simular, conversar, cerrar. |
| 4 | Los nueve indicadores del panel de stats, agrupados por familia (¿llega el plan? / ¿cuánto cuesta el camino?), con frase-modelo para cada uno. |
| 4b | Seguimiento futuro — cómo usar la herramienta para monitorear el plan reunión tras reunión, no sólo en la primera. |
| 4c | Manejo de views — el análisis condicional. Diez presets built-in y cómo traducirlos a conversaciones útiles. |
| 5 | Cuatro casos de cliente trabajados de punta a punta: Pablo (acumulación agresiva), Diana (CDT renovado), Marta (decumulación sostenible), Carlos (legado con estrategia mixta). |
| 6 | Preguntas frecuentes que surgen en la primera presentación al cliente, con respuestas redactadas para usar directamente. |
| 7 | Troubleshooting — qué hacer cuando algo no funciona. |

---

## Versión y vigencia

- Documento generado a partir de la rama `feature/pdf-cierre` del Planificador Patrimonial.
- Cambios cubiertos al cierre del 2026-05-06: motor extendido con tail risk (CVaR_5 / CVaR_95 / P5 / P95), sección E del PDF de cierre cableada, synchronized views (Fase C.4) disponibles, modal "Generar plan personal de inversión" en `ExportBar`.
- Pendientes que se incorporan a este instructivo cuando se activen: auth con Cloudflare Access (compra del dominio en curso), comparativo A vs B en la sección D4 del PDF, importación drag-and-drop de PDF para rehidratar el estado.

La fuente de verdad técnica del estado del producto vive en `progreso-planner.md` (bitácora append-only del subproyecto) y `INSTRUCCIONES-PLANNER.md` (spec). Este instructivo refleja lo que el asesor ve en pantalla; ante cualquier discrepancia, manda lo que la herramienta efectivamente hace.

---

[SCREENSHOT — portada visual del PDF: logo Mercantil AWM en alta resolución, tagline *"Planificador Patrimonial — manual del asesor comercial"*, y la versión/fecha de cierre del documento. A capturar cuando el logo y la paleta corporativa final estén entregados.]

---

## Una frase para cerrar la portada

> *"Esta herramienta no decide por usted ni reemplaza su juicio. Lo que hace es cuantificar las consecuencias de cada decisión que usted y el cliente toman juntos, sobre veinte años de historia real del mercado y cinco mil futuros simulados. El resto — la conversación, la lectura del cliente, la decisión final — sigue siendo suyo."*
