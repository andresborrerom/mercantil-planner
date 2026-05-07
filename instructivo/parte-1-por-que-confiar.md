# Parte 1 — Por qué puede confiar en esta herramienta

La pregunta que cada cliente se hace, aunque no siempre la formule en voz alta, es simple: *¿este plan va a funcionar?* Esta herramienta existe para que usted pueda responder esa pregunta con evidencia, no con intuición.

## Qué hay detrás del cálculo

**Veinte años de historia real del mercado.** La herramienta trabaja sobre los retornos mensuales efectivamente ocurridos entre enero de 2006 y abril de 2026 — más de veinte años que incluyen la crisis financiera de 2008, la recuperación posterior, el ciclo de tasas cero, la pandemia, el ajuste monetario de 2022-2024 y el entorno actual. No son escenarios inventados: son los retornos que los 32 ETFs representativos del universo global efectivamente entregaron mes a mes.

**Cinco mil futuros posibles por cada análisis.** Cada vez que usted oprime "Simular", el motor construye cinco mil caminos patrimoniales distintos, cada uno tomando bloques de esa historia real y recombinándolos. El cliente ve no una proyección única, sino la nube completa de lo que razonablemente puede pasar — el escenario mediano, el optimista (mejor 10%), el pesimista (peor 10%) y todo lo intermedio.

**El modelo de renta fija parte del nivel actual de tasas.** Este es un punto técnico que vale la pena explicarle al cliente cuando pregunta: *"¿pero las tasas de hoy no son distintas a las del 2008?"* Correcto. Por eso la herramienta no hace un promedio ciego de la historia: para los ETFs de renta fija, la simulación arranca desde el nivel de tasas que efectivamente rige hoy en el mercado (Treasuries de 3 meses, 5, 10 y 30 años, tomados el último día disponible) y evoluciona desde allí. El carry que el cliente va a cobrar responde al entorno actual, no al histórico.

**Las correlaciones no son estáticas — están condicionadas al régimen de mercado.** La mayoría de los modelos tradicionales de optimización de portafolios suponen una matriz de correlación única y constante entre renta variable, renta fija y mercados internacionales. La realidad no se comporta así: las correlaciones entre clases de activos cambian drásticamente según el momento del ciclo económico.

- **En crisis** (segundo semestre de 2008, marzo 2020) las correlaciones convergen al alza y la mayoría de las clases caen juntas — la diversificación clásica se debilita justo cuando más se necesita.
- **En recuperaciones con política monetaria expansiva** (2009-2013) la renta variable sube mientras la renta fija ofrece carry estable y baja volatilidad, funcionando como ancla real del portafolio.
- **En expansión económica con tasas normalizándose** (2017, 2021) los patrones se desacoplan y cada clase responde a sus propios fundamentales.
- **En shocks inflacionarios** (2022-2023) las correlaciones se invierten: renta fija y renta variable caen simultáneamente, rompiendo la diversificación clásica que los clientes asumen por defecto.
- **En fases de calma prolongada** (2013-2015, 2016-2017) la volatilidad colapsa en todas las clases y las correlaciones se estabilizan en sus niveles de largo plazo.

El motor de simulación preserva todas estas dinámicas de forma natural, porque muestrea bloques contiguos de doce meses del histórico real. Cada bloque trae consigo el patrón de correlación que efectivamente rigió en ese momento del ciclo — crisis, recuperación, expansión, shock o calma. Las cinco mil proyecciones del futuro no son extrapolaciones a partir de una matriz estática: son recombinaciones plausibles de regímenes reales que el mercado ya transitó. Eso es lo que permite que el fan chart proyecte escenarios donde, por ejemplo, aparezcan trayectorias con un 2008-like en el año 3 seguidas de un 2017-like en el año 5 — combinaciones que un modelo de matriz única simplemente no puede generar.

## Qué se verifica antes de liberar cada versión

- **330 pruebas automáticas** sobre la matemática del motor y el módulo de cierre: cálculo de rentabilidad anualizada, TIR del cliente, drawdown máximo, probabilidad de ruina, aplicación de flujos de aporte y retiro, regla de inflación para planes reales, métricas de cola (CVaR / Expected Shortfall a horizontes 5/10/20/30 años), serializador del PDF de cierre, integridad del state container embebido. Todas deben pasar antes de liberar.
- **5 verificaciones de integridad del motor de simulación**: que dos corridas con la misma semilla produzcan resultados idénticos, que la rentabilidad mediana de un portafolio 100% S&P 500 converja al histórico realizado del índice, que una simulación completa de cinco mil caminos por treinta años termine en menos de quince segundos, que los caminos de renta fija no violen las cotas técnicas del modelo, y que el modelo de yields no produzca datos corruptos.
- **14 presets de views verificados** automáticamente sobre el motor — nueve de un solo predicado, cuatro compuestos AND/OR, y uno *synchronized* (estanflación SPY↓ Y TNX↑ co-ocurriendo mes a mes). Cada uno se evalúa en un caso de prueba representativo y reporta su probabilidad empírica.
- **Validación cruzada con Excel** del cálculo de TIR (XIRR), a cuatro decimales de precisión.
- **Round-trip metadata del PDF**: el state JSON embebido en el documento se extrae intacto, preservando floats, caracteres acentuados y los cuatro idiomas. Verificado automáticamente en cada cierre de versión.

## Qué NO es esta herramienta

Para ser honestos con el cliente, es igual de importante decir qué **no** promete:

- **No es una predicción.** Es una exploración cuantitativa de qué futuros razonables son posibles, basada en evidencia histórica. Si el futuro entrega un escenario más severo que el peor de los últimos veinte años, el plan quedará bajo estrés mayor al proyectado.
- **No modela cambios regulatorios** ni modificaciones del régimen tributario.
- **No descuenta costos de transacción ni comisiones de gestión.** Los resultados son brutos; el asesor debe explicar al cliente cómo descontar el impacto de las comisiones sobre el retorno esperado.
- **No reemplaza el juicio del asesor.** La herramienta cuantifica las consecuencias de las decisiones que el asesor y el cliente toman juntos — no decide por ellos.

## El entregable de cierre — qué recibe el cliente

Al final de cada reunión, el asesor genera el **plan personal de inversión** del cliente: un PDF profesional que documenta las decisiones tomadas, las métricas proyectadas y la metodología detrás. El documento es bilingüe (ES/EN producción, FR/DE como borrador hasta revisión nativa) y se entrega con el naming convention `cliente-bucket.pdf` — un PDF por bucket Wealth Way (Liquidez / Longevidad / Legado).

El PDF lleva embebido en su metadata el **state JSON completo** de la sesión: portafolios, reglas de flujo, ventana, parámetros del bootstrap, idioma. En sesiones futuras, importar el mismo PDF rehidrata exactamente el estado — la herramienta vuelve a la configuración que produjo ese documento. Es la forma de mantener continuidad reunión tras reunión sin re-discutir cada parámetro.

> **Diferenciador #6 sobre la industria top-tier**: la sección E del PDF (Proyecciones) reporta no sólo los percentiles centrales (P5–P95), sino también el **CVaR / Expected Shortfall** a 5/10/20/30 años — el promedio condicional de los escenarios fuera de las colas. La industria muestra el percentil; Mercantil entrega ambos. Es el lenguaje que conecta el riesgo de cola con la decisión del cliente: el percentil dice *dónde* empieza la cola; el CVaR dice *qué tan profunda* es en promedio.

## Una frase para cerrar con el cliente

> *"Lo que vamos a ver en la pantalla no es una predicción de lo que va a pasar. Es el mapa de lo que razonablemente puede pasar, construido sobre veinte años de historia real del mercado y cinco mil escenarios simulados. Nos da una base sólida para conversar sobre su plan, no una respuesta automática."*
