# Presentación Planner Patrimonial — 2026-05-08

> Borrador para estudiar antes de presentar. 30 minutos. Audiencia: equipo Mercantil AWM.

## Datos clave a tener a mano

| Campo | Valor |
|---|---|
| Duración | 30 minutos (incluye Q&A buffer 3 min) |
| URL planner | https://andresborrerom.github.io/mercantil-planner/ |
| URL instructivo | https://andresborrerom.github.io/mercantil-planner/instructivo/ |
| Backup local | `npm run preview` en port 4173 si se cae internet |
| PC | Diferente a la habitual — validar todo 30 min antes |

## Caso central de la demo: Pablo

Configurar este caso de cero en vivo. Es el mismo del instructivo Parte 3, así que cualquier asesor que después lea el manual va a reconocer el ejemplo.

| Parámetro | Valor |
|---|---|
| Cliente | Pablo Rodríguez (45 años, fase acumulación) |
| Capital inicial | USD 100.000 |
| Horizonte | 300 meses (25 años) |
| Modo | Real |
| Inflación | 2.5% |
| Regla | Aporte mensual USD 2.000, crecimiento anual 3% |
| Portafolio A | Balanceado (Signature) |
| Portafolio B | Crecimiento (Signature) |

---

## Estructura de los 30 minutos

### Bloque 1 — Apertura (3 min)

**Frases clave:**
- "Hasta hoy el asesor toma decisiones de portafolio para clientes con horizonte de 20-30 años basándose en planillas estáticas y juicio cualitativo. Esta herramienta cambia eso."
- "Lo que van a ver: un instrumento cuantitativo de simulación que toma 20 años de historia real del mercado, los reorganiza vía bootstrap pareado en 5.000 futuros posibles, y le da al asesor números concretos sobre lo que un cliente puede esperar."
- "30 minutos: tres demos cortas + un manual del asesor + Q&A."

**Lo que NO decir:** detalles del algoritmo bootstrap a profundidad. Eso es para el instructivo.

---

### Bloque 2 — Demo Pablo (7 min)

**Acción**: configurar caso desde cero en pantalla.

**Pasos demoables:**
1. Click preset "Ahorro / Acumulación" — anunciar: *"esto va a evolucionar a Liquidity/Longevity/Legacy alineados con Wealth Way en próximas iteraciones."*
2. Editar capital → 100.000.
3. Editar horizonte → 300.
4. Cambiar modo Nominal → Real.
5. Editar regla: amount 2.000, growth 3.
6. Click Simular.
7. **Mientras corre la simulación (~1.5 s)**: narrar el algoritmo en voz alta:
   - "Estamos remuestreando 240 bloques de 12 meses cada uno, tomados al azar de los últimos 20 años de retornos reales del mercado. 5.000 trayectorias. Determinístico — mismo seed da mismo resultado."
8. Cuando termina, leer:
   - Mediana del valor final.
   - Banda P10–P90.
   - Probabilidad de shortfall.
   - Mostrar el sample path interactivo: *"este es UN futuro posible — click cambia a otro."* Click 3-4 veces.

**Tiempo crítico**: no pasar de 7 minutos. Si te excedés, recortás algún bloque posterior.

**Riesgo**: alguien pregunta sobre la diferencia A vs B antes de que llegues a stats. Respuesta corta: *"vamos a verlo en stats en 30 segundos"* y seguir.

---

### Bloque 3 — Views + Regímenes (5 min)

**Acción**: mostrar análisis condicional sin reconfigurar.

**Pasos:**
1. Expandir card Views.
2. Tab Presets → click "Tasas suben 100 pbs (pico, 12m)".
3. Mostrar el switch Toggle/Overlay que aparece. Alternar 2 veces.
4. *"En Toggle ves solo el escenario condicionado; en Overlay ves base vs condicionado superpuestos. La probabilidad del escenario aparece arriba del fan chart."*
5. Tab Composite → click "Estanflación (12m)". Probabilidad ~5-8%.
6. Tab Sincronizados → click "Estanflación sincronizada (≥3m en 12m)". Probabilidad mucho menor (~1-3%). *"Mismo concepto, métrica más estricta — exige co-ocurrencia mensual."*
7. Expandir card Regímenes históricos. Mostrar la tabla de stats por régimen. *"Estos son los 9 regímenes históricos identificados de 2005-2025: NBER recessions, drawdowns, etc."*

**Lo que importa transmitir**: el asesor no se queda con UNA proyección — puede preguntar "¿y si pasa X?" en vivo.

---

### Bloque 4 — Seguimiento (Marta) (5 min)

**Acción**: demostrar el flujo de re-corrida del plan 6-12 meses después con **drag-and-drop del PDF** — el "wow" conceptual del producto.

**Pre-requisito antes de presentar**: tener un PDF de Marta pre-generado a mano (caso Marta-original: capital 500k, retiro 4k mensual real, horizonte 25 años, portafolio A Conservador, B Balanceado). Generalo durante el checklist de 30 min antes y guardalo accesible en el escritorio.

**Pasos (camino principal — drag-and-drop):**
1. *"El PDF que el cliente recibe NO es solo un documento de lectura — es también un contenedor del state completo de la sesión. Lo arrastro sobre la herramienta…"*
2. Arrastrar el PDF de Marta sobre la ventana del navegador.
3. Aparece el overlay azul *"Soltá el PDF para rehidratar la sesión"*. Soltar.
4. Toast verde: *"Sesión rehidratada — cliente Marta (longevity). PDF del 2026-XX-XX. Presioná Simular para correr la proyección."*
5. Mostrar que portafolios A/B + plan + ventana se restauraron exactamente.
6. Editar capital actual (500k → 380k — la realidad evolucionó respecto a la proyección).
7. Click Simular → comparar contra la proyección original que el cliente recibió.

**Frase clave**: *"Esto cierra el ciclo. El PDF que generamos para el cliente es también el insumo para la siguiente reunión. No hay JSON sueltos, no hay copy-paste — el documento ES el plan."*

**Fallback si falla el drag-and-drop**: tener un JSON de config en Notepad de respaldo. Pegar en el textarea *"Pegar config JSON"* del ExportBar y click Aplicar. La herramienta lo describe como "camino fallback" en la Parte 4b del instructivo.

**Riesgos específicos:**
- *Toast de error "PDF sin metadata Mercantil"*: el PDF es de antes de hoy (sin el feature). Tener un PDF generado **hoy** del caso Marta para evitarlo.
- *Drag-and-drop no responde*: navegador con extensión que intercepta drops, o ventana del navegador no enfocada. Fallback al JSON paste.

---

### Bloque 5 — PDF + instructivo (7 min)

**PDF (4 min):**
1. Click botón naranja "Generar plan personal de inversión".
2. Llenar el modal en vivo:
   - Cliente: Pablo Rodríguez
   - Asesor: tu nombre
   - Bucket: Longevidad
   - Versión: Completa
   - Idioma: ES
   - Carta personalizada: una frase corta dedicada a Pablo (improvisar).
3. Click Generar PDF.
4. Abrir el PDF descargado en otra pantalla / pestaña.
5. Mostrar:
   - Portada con datos cliente + asesor.
   - Resumen ejecutivo.
   - Sección E: fan chart + tabla tail risk (CVaR_5/CVaR_95 a 5/10/20/30 años).
   - Narrative box.

**Instructivo (3 min):**
1. Volver al planner.
2. Click "Guía del asesor" en el header → abre instructivo en pestaña nueva.
3. Tour rápido del TOC sticky:
   - Parte 0: Portada.
   - Parte 1: Por qué confiar.
   - Parte 2: Mapa de la herramienta.
   - Parte 3: Los 4 pasos.
   - Parte 4: Los 9 indicadores.
   - Parte 4b: Seguimiento futuro.
   - Parte 5: Casos cliente (4 casos típicos con números).
   - Parte 6: FAQ.
   - Parte 7: Troubleshooting.
4. Mostrar 1-2 GIFs animados (sample path o toggle/overlay).
5. *"Esto vive en GitHub Pages. El asesor lo abre desde el botón del header — siempre la última versión."*

---

### Buffer Q&A (3 min)

**Preguntas anticipables y respuestas cortas:**

| Pregunta | Respuesta |
|---|---|
| ¿Cuánto tarda el asesor en aprenderlo? | El instructivo tiene 8 partes, ~30 min de lectura + práctica con los 4 casos cliente. |
| ¿Está aprobado por riesgo/compliance? | Pendiente — el PDF es draft. Cierre formal cuando llegue el branding AWM oficial. |
| ¿Funciona offline? | El planner es estático. El instructivo está en GitHub Pages. Los assesores pueden bajar el HTML. |
| ¿Qué pasa con datos del cliente? | Nada se envía afuera. State es local. PDF se genera client-side. |
| ¿Multi-idioma? | ES y EN listos. FR y DE en draft. |

---

## Riesgos + mitigaciones

| Riesgo | Mitigación |
|---|---|
| Internet se cae | `npm run preview` corriendo local + URL `http://localhost:4173/mercantil-planner/` |
| Modal del PDF se ve cortado | Browser zoom 90% antes de empezar |
| Simulación tarda más de lo normal | Usar tiempo para narrar algoritmo (no aire muerto) |
| Browser console abierta | Ctrl+Shift+I para cerrar antes de empezar |
| Theme dark accidental | Forzar light: 🌞 toggle del header |
| Clipboard no copia el config | JSON pre-armado en Notepad como backup |
| Imágenes no cargan en instructivo | El sitio sirve assets locales — verificar 30 min antes con la URL real |

---

## Lo que querés evitar decir

- Detalles del algoritmo bootstrap a profundidad (eso va al instructivo).
- "Esto es perfecto" — siempre dejar espacio para iterar.
- Detalles de implementación (Vite, React, Playwright).
- Promesas sobre features pendientes (auth Cloudflare Access, dominio mawm-lab.com, comparativo D4) hasta que estén implementadas.

## Lo que conviene mencionar

- Que es un trabajo en proceso — pipeline definido, próximos hitos.
- Que el asesor es central: la herramienta NO decide, le da números al asesor para conversar con el cliente.
- Que el modelado es **conservador**: bootstrap pareado preserva correlaciones reales, no asume distribución normal, no extrapola más allá de la historia.

---

## Cierre — frase para terminar

*"Esta herramienta no decide por ustedes ni reemplaza su juicio. Lo que hace es cuantificar las consecuencias de cada decisión que ustedes y el cliente toman juntos, sobre veinte años de historia real del mercado y cinco mil futuros simulados. El resto — la conversación, la lectura del cliente, la decisión final — sigue siendo suyo."*

(Esa frase ya está en `parte-0-portada.md`. Coherente con la doctrina del instructivo.)

---

## Checklist 30 minutos antes

- [ ] Validar https://andresborrerom.github.io/mercantil-planner/ desde la PC de presentación.
- [ ] Validar https://andresborrerom.github.io/mercantil-planner/instructivo/ — TOC sticky, drawer en mobile, GIFs cargan.
- [ ] **Generar PDF de Marta-original** (capital 500k, retiro 4k mensual real, horizonte 25 años, A Conservador, B Balanceado) y guardarlo en el escritorio para el Bloque 4 drag-and-drop.
- [ ] **Probar drag-and-drop una vez** con ese PDF para confirmar que el toast verde aparece y el state se rehidrata correctamente.
- [ ] Browser zoom 90%, theme light, console cerrada.
- [ ] Notepad con JSON Marta de respaldo (fallback si el drag-and-drop falla).
- [ ] Pestaña Adobe Reader / Edge PDF abierta para mostrar el PDF descargado rápido en Bloque 5.
- [ ] Confirmar audio + pantalla compartida en Zoom/Teams (o el medio que uses).
- [ ] Cerrar Slack / email / notificaciones.
