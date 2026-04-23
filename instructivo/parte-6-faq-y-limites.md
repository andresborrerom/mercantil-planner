# Parte 6 — Preguntas frecuentes y límites de la herramienta

Esta sección recoge las preguntas más frecuentes que surgen cuando un asesor presenta la herramienta a un cliente por primera vez. Las respuestas están pensadas para usar directamente en la conversación — tono honesto, sin jerga innecesaria.

## Sobre la naturaleza de la simulación

### ¿Esto es una predicción de mi futuro?

No. Es una exploración cuantitativa de futuros **posibles**, construida sobre veinte años de historia real del mercado. Le mostramos el rango de lo que razonablemente puede pasar con su plan — el escenario típico, el optimista, el pesimista y todo lo intermedio — pero no afirmamos que vaya a pasar ninguno en particular. La herramienta responde *"¿cómo se comportaría mi plan en distintos futuros posibles?"*, no *"¿qué va a ocurrir?"*.

### ¿Por qué cinco mil escenarios y no diez mil o mil?

Cinco mil es el punto en el que las métricas principales (probabilidad de ruina, bandas de valor final, drawdown mediano) se estabilizan con un margen de error pequeño. Duplicar a diez mil mejora la precisión de los percentiles extremos pero hace la simulación notablemente más lenta sin cambiar la conversación con el cliente. Menos de dos mil sería ruidoso, especialmente en los percentiles P10 y P90 que el fan chart muestra.

### ¿Cómo están construidos esos cinco mil escenarios?

A partir de los retornos mensuales efectivamente ocurridos entre enero de 2006 y abril de 2026 para 32 ETFs representativos del universo global. Cada escenario se construye tomando **bloques de doce meses históricos** y recombinándolos aleatoriamente. Al usar bloques completos (y no meses sueltos), se preservan las **correlaciones condicionadas al régimen de mercado** — los patrones reales que vimos en crisis, recuperaciones, expansiones, shocks inflacionarios y períodos de calma.

### ¿Puede repetirse un mismo resultado dos veces?

Sí, pero es intencional. La herramienta usa una **semilla aleatoria** fija (por default 42) que hace que dos corridas con los mismos parámetros produzcan exactamente los mismos cinco mil escenarios. Esto garantiza reproducibilidad: si en una reunión mostramos un número, en otra reunión con los mismos parámetros vamos a ver el mismo número. Si se quiere explorar otra cinco mil posibles, se puede cambiar la semilla desde la configuración avanzada.

## Sobre los escenarios extremos

### ¿Qué pasa si ocurre algo peor que el 2008?

El modelo está entrenado con los peores eventos que efectivamente ocurrieron en los últimos veinte años: la crisis financiera de 2008, el shock del COVID en marzo 2020, el ajuste monetario de 2022-2024. Si el futuro entrega un evento **más severo** que todos los históricos disponibles, el plan estará bajo estrés **mayor al proyectado**. La herramienta reporta lo que cabe en la historia real, no especula sobre lo que la supera.

Por eso, en la conversación con cliente, siempre advertimos: los *tail risks* más allá del rango histórico no están cuantificados aquí. Son parte de la conversación de robustez general del plan (capital de respaldo, seguro, diversificación del patrimonio completo fuera de estos instrumentos, etc.).

### ¿La probabilidad de ruina del X% es "verdadera"?

Es la probabilidad **empírica** en la muestra de cinco mil escenarios, dado el modelo y la historia. En lenguaje técnico: *"probabilidad condicional al modelo"*. No es una estimación de la probabilidad "verdadera" del mundo real, que nadie puede calcular exactamente porque el futuro no se parece exactamente al pasado.

En la conversación con cliente, la redacción correcta es: *"según nuestro modelo, basado en veinte años de historia real, en X de cada 100 escenarios simulados su capital se agotaría antes del plazo"*. No: *"hay X% de probabilidad de que se quede sin dinero"*.

## Sobre la configuración del portafolio

### ¿Por qué hay signatures y AMCs separados?

Las **signatures** (Conservador / Balanceado / Crecimiento) son las carteras institucionales estándar de Mercantil — la receta pre-definida para cada perfil de riesgo. Los **AMCs** (Asset Management Categories) son los bloques que componen las signatures y que se pueden usar como cartera individual cuando el cliente tiene un objetivo muy específico (ej. un CDT-Proxy para el cliente tipo Diana, o un USA.Eq para exposición pura a S&P).

La herramienta permite combinar AMCs libremente en la pestaña **Custom** para clientes que requieren una mezcla a medida.

### ¿Qué son FIXED6 y FIXED9?

Son dos "activos sintéticos" que representan **retornos determinísticos**: FIXED6 paga 6% nominal anual sin volatilidad; FIXED9 paga 9% nominal anual sin volatilidad. No son ETFs que se pueden comprar — son la forma de modelar en la cartera el componente de retorno garantizado de algunos productos estructurados de Mercantil. Varios AMCs los llevan embebidos (GlFI tiene 20% FIXED6; los AMCs de crédito tienen FIXED9).

### ¿Qué no está modelado dentro de los portafolios?

- **Costos de transacción y comisiones de gestión.** Los resultados son brutos — el asesor debe explicar al cliente que el retorno efectivo se verá reducido por la comisión de Mercantil, el spread de los ETFs, y cualquier costo de custodia adicional.
- **Cambios regulatorios** (nuevos impuestos, restricciones de inversión, modificaciones de régimen tributario) que podrían afectar el retorno neto del cliente.
- **Eventos específicos del cliente** — liquidez inesperada, cambio de estado civil con impacto patrimonial, gastos extraordinarios no planificados. Estos se incorporan re-corriendo el plan con las nuevas reglas de flujo.

## Sobre la lectura de resultados

### ¿Qué diferencia hay entre TWR y XIRR?

**TWR (Time-Weighted Return)** responde *"¿cómo rindió la estrategia?"*. Ignora cuándo el cliente aportó o retiró. Es la métrica estándar para comparar portafolios entre sí.

**XIRR (Money-Weighted Return)** responde *"¿cuánto ganó el cliente efectivamente?"*. Tiene en cuenta el timing de cada aporte y retiro. Es el número que el cliente ve en su estado de cuenta anual y el que realmente refleja su experiencia financiera.

Los dos pueden diferir cuando el cliente aporta sistemáticamente en mercados alcistas (XIRR < TWR, porque los aportes tardíos compran caro) o en bajistas (XIRR > TWR, el clásico *dollar-cost averaging*).

### ¿Por qué el Max Drawdown no depende de mis aportes y retiros?

Porque el Max Drawdown es una métrica del **manager**, no del cliente. Mide la peor caída pico-a-valle que tuvo la **estrategia** durante la ventana — independiente de que el cliente haya aportado o retirado en el medio. Si lo mezcláramos con los flujos del cliente, un cliente que retira agresivo hasta arruinarse vería "drawdown −100%" aunque la caída fuera suya (del bolsillo) y no del portafolio (del mercado). Separar las dos cosas permite conversaciones más honestas: *"la estrategia cayó un X% en ese momento; las decisiones de flujo son otra capa".*

### ¿Qué es un "view" en la herramienta?

Un view es una hipótesis sobre el mercado — *"las tasas suben 100 pbs en 12 meses"*, *"el portafolio cae más de 20%"*, *"el mercado se comporta como el tercio superior histórico"*. La herramienta toma esa hipótesis, identifica cuántos de los cinco mil escenarios simulados la cumplen (→ probabilidad empírica del view) y recalcula las métricas sobre ese subconjunto (→ impacto esperado si el view se materializa). Ver Parte 4c del instructivo para el detalle de los nueve presets disponibles y cómo usarlos en conversación.

## Honestidad metodológica

### ¿Qué sesgos puede tener la simulación?

- **Sesgo de supervivencia** en los ETFs: trabajamos con ETFs que existen hoy y tienen historia suficiente. Los ETFs que cerraron o fusionaron durante el período no están incluidos.
- **Sesgo del período histórico**: 2006-2026 es un período que incluye una gran crisis (2008), una pandemia (2020) y un shock inflacionario (2022), pero también QE masivo y veinte años sin guerra mundial, hiperinflación extrema, o colapso del sistema monetario. Si alguno de esos eventos ocurriera, estaría fuera del entrenamiento.
- **Imputación de proxies para ETFs jóvenes**: 11 de los 32 ETFs tienen parte de su histórico completado con datos de un ETF similar (ver documentación técnica). El impacto es mínimo en la simulación porque los proxies son de la misma clase de riesgo.
- **Sin modelo de costos**: como se mencionó arriba, el retorno bruto sobrestima el retorno efectivo del cliente.

### ¿Cuándo NO debería usarse esta herramienta?

- Para clientes con horizonte menor a 36 meses: el bootstrap estadístico necesita ventanas de al menos algunos años para que las métricas agregadas sean informativas. Para plazos muy cortos, un análisis puntual del spread actual y la curva de tasas es más útil.
- Para productos derivados o estructurados complejos que no sean replicables como combinación lineal de los 32 ETFs del universo.
- Para análisis de muy corto plazo (semanas o meses individuales): la granularidad del modelo es mensual.
- Para decisiones tácticas de trading: la herramienta es estratégica, no táctica.
