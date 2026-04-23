# Parte 4c — Manejo de Views

## Qué es un view y para qué sirve en reunión con cliente

Un **view** es una hipótesis sobre el mercado: *"las tasas suben 100 pbs en los próximos 12 meses"*, *"el portafolio cae más de 20% en algún momento del primer año"*, *"el mercado se comporta como el tercio superior de todos los escenarios posibles"*. La herramienta tiene la capacidad de tomar cualquiera de estas hipótesis y responder dos preguntas con los cinco mil escenarios ya simulados:

1. **¿Qué probabilidad tiene ese view de ocurrir?** — medida como la fracción de los cinco mil escenarios simulados en los que la hipótesis se cumple.

2. **Si ese view se materializa, ¿cómo se comporta el portafolio del cliente?** — medido recalculando las nueve métricas del panel (Familia A y Familia B) restringidas al subconjunto de escenarios que cumplen el view.

La gran ventaja es que **el cálculo no introduce supuestos adicionales**. Los views simplemente filtran los escenarios que la herramienta ya generó a partir de veinte años de historia real del mercado, preservando las correlaciones condicionadas al régimen (ver Parte 1).

Para el cliente, los views permiten tres tipos de conversación que antes eran difíciles de cuantificar:

- **"¿Qué pasa si…?"** — estrés concreto: *"si el próximo año es como 2008, ¿cómo me afecta?"*
- **"¿Qué pasa si no…?"** — costos de oportunidad: *"si me pierdo un rally del 20%, ¿cuánto dejo sobre la mesa?"*
- **"¿Qué tan probable es eso?"** — ponderar la preocupación del cliente: un view con 1% de probabilidad merece una conversación distinta a uno con 25%.

## Principio rector

> **Un view no es una predicción. Es una sonda.** La herramienta responde "si esto pasara, así reacciona el portafolio" — no responde "esto va a pasar". La probabilidad reportada es la frecuencia empírica del view en la muestra simulada, dado el modelo y la historia 2006-2026. No es una estimación de probabilidad futura "verdadera".

Esto es importante transmitirlo al cliente antes de mostrar cualquier view. La honestidad metodológica protege la relación: si el view se materializa, el cliente vio las consecuencias; si no se materializa, nunca se lo presentó como promesa.

## Los nueve presets built-in

La herramienta viene con nueve views pre-configurados, agrupados en dos bloques: cuatro sobre tasas, cinco sobre el comportamiento del portafolio.

### Views sobre tasas (yield TNX, 10 años)

Todos los views de tasas usan el yield a 10 años (TNX) como referencia porque es el más conversado con clientes: *"las tasas de 10 años están en X%"* es el reporte estándar en prensa financiera.

#### 1. Tasas suben 100 pbs (pico, 12m)

**Condición:** En algún momento de los próximos 12 meses, el yield TNX toca un nivel 100 pbs o más arriba del nivel actual.

**Cuándo usarlo:** Cliente con exposición significativa a renta fija (GlFI, CashST, CDT-Proxy, cualquier signature de perfil conservador). Es el view clásico de estrés para bonos.

**Qué mostrar:** la probabilidad empírica del view, y dentro de ese subconjunto el delta en valor final y en max drawdown vs el base case. Si el portafolio es RF-heavy, esperá ΔFinal negativo y ΔMDD más severo.

**Frase al cliente:** *"La probabilidad de que las tasas toquen +100 pbs en algún momento de los próximos 12 meses es del X%, según el modelo. En esos escenarios, su portafolio recibe un impacto adicional de aproximadamente USD Y respecto al caso base. ¿Cuánto pesa este escenario en su decisión?"*

#### 2. Tasas cierran +100 pbs (12m)

**Condición:** El yield TNX al cierre del mes 12 está 100 pbs o más arriba del nivel actual.

**Diferencia con el anterior:** este view es más restrictivo. Muchos escenarios "tocan +100 pbs en algún momento" pero terminan revirtiendo. Este view captura sólo los que terminan sostenidos arriba. Por eso su probabilidad suele ser la mitad o menos que la del pico.

**Cuándo usarlo:** para conversar el **escenario sostenido**, no el pico temporal. Útil cuando el cliente pregunta *"¿y si las tasas se quedan altas?"* — no sólo que suban, sino que se queden.

**Frase al cliente:** *"El escenario de 'tasas suben y se quedan' ocurre en Y% de las simulaciones — es la mitad de frecuente que el escenario 'tasas tocan el pico temporalmente'. En este subconjunto más duro, el impacto es de USD Z."*

#### 3. Tasas bajan 100 pbs (pico, 12m)

**Condición:** En algún momento de los próximos 12 meses, el yield TNX toca un nivel 100 pbs o más abajo del nivel actual.

**Cuándo usarlo:** para conversar el escenario **opuesto**: el recorte de Fed (recesión, crisis, política monetaria expansiva). Útil para clientes RF-heavy que **se benefician** de tasas bajando (vía efecto duración).

**Punto pedagógico:** si el portafolio tiene duración positiva, el ΔFinal condicional debería ser **positivo** — la tasa baja genera ganancia de capital en los bonos. Esto educa al cliente sobre el funcionamiento de la renta fija: las tasas y los precios de los bonos se mueven en direcciones opuestas.

**Frase al cliente:** *"Hay un Y% de probabilidad de que las tasas bajen 100 pbs en algún momento de los próximos 12 meses. Si ocurre, su portafolio se beneficia de aproximadamente USD Z por el efecto de la duración de sus bonos."*

#### 4. Tasas estables ±25 pbs (12m)

**Condición:** El yield TNX al cierre del mes 12 está dentro de ±25 pbs del nivel actual.

**Cuándo usarlo:** el view del "escenario calma". Cliente preocupado por movimientos bruscos. Este view selecciona los escenarios donde las tasas simplemente no se mueven materialmente.

**Qué mostrar:** el ΔFinal suele ser **positivo pero modesto** — los bonos cobran carry sin sobresaltos. La vol condicional debería ser marcadamente menor que la base.

**Frase al cliente:** *"En aproximadamente un Y% de los escenarios, las tasas se mantienen estables. En esos años, el portafolio rinde de forma más tranquila: volatilidad más baja, drawdown más contenido, carry directo."*

### Views sobre portafolio

Estos cinco views se evalúan sobre el retorno acumulado del **portafolio A** (el seleccionado a la izquierda). Para aplicarlos al portafolio B basta con duplicarlos (en la UI futura habrá un toggle; por ahora se clona el preset). La metodología es idéntica.

#### 5. Portafolio A cae −20% o más (12m)

**Condición:** El retorno acumulado del portafolio A en los próximos 12 meses es −20% o peor.

**Cuándo usarlo:** view de **estrés severo**. El número importante aquí es la probabilidad — típicamente muy baja en portafolios Balanceados (2-3%), algo mayor en Crecimiento o custom equity-tilted (5-10%). Útil para clientes que preguntan *"¿cuál es el peor escenario realista?"*

**Qué mostrar:** la probabilidad baja da tranquilidad; pero dentro de ese subconjunto, los ΔFinal y ΔMDD son severos. El cliente necesita ver los dos lados: es improbable, pero si pasa duele.

**Frase al cliente:** *"La probabilidad de una caída anual del 20% o más es del X% — es un evento raro. Pero si ocurre, el impacto sobre el capital final es de USD Y. Por eso el diseño del plan incluye un margen para este escenario: no depende de que no ocurra, sino de poder absorberlo sin romper el plan."*

#### 6. Portafolio A sube +20% o más (12m)

**Condición:** El retorno acumulado del portafolio A en los próximos 12 meses es +20% o mejor.

**Cuándo usarlo:** el view del **rally**. Especialmente útil en dos conversaciones:

- **Cliente conservador que perdería el rally**: si Diana (Caso 2 del instructivo) se queda en CDT, ¿cuánto deja sobre la mesa cuando el mercado entrega un año así? Comparar ΔFinal condicional entre un portafolio invertido y el CDT-Proxy es una forma concreta de mostrar el costo de oportunidad.

- **Cliente agresivo que espera el rally**: el view recuerda que los rallies también son episódicos — ocurren en Y% de los años, no todos los años.

**Frase al cliente:** *"Un año con +20% o mejor ocurre en el Y% de los escenarios. En un portafolio Crecimiento, ese escenario le suma USD Z al capital. En un portafolio 100% CDT, ese escenario no existe por diseño — es la otra cara del colchón cómodo."*

#### 7. Portafolio A plano (12m)

**Condición:** El retorno acumulado del portafolio A en los próximos 12 meses cae en el rango −5% a +5%.

**Cuándo usarlo:** el view del año "aburrido". Útil para calibrar la expectativa emocional del cliente: los años planos son frecuentes — ocurren en 15-25% de los escenarios — y no son una falla del plan.

**Frase al cliente:** *"Uno de cada cinco años termina siendo prácticamente plano en este portafolio. No es una señal de que algo anda mal; es parte de la distribución normal. Lo importante es qué hace el plan completo a lo largo del horizonte, no qué hace cada año individual."*

#### 8. Portafolio A en el mejor tercil (24m)

**Condición:** El retorno acumulado del portafolio A a 24 meses está entre los mejores 33% de los cinco mil escenarios simulados.

**Cuándo usarlo:** view de **escenario favorable pero realista**. A diferencia del rally +20% que es un absoluto, el tercil superior es relativo a la distribución del propio portafolio — adapta el threshold al perfil de riesgo.

**Punto pedagógico:** este view selecciona el "mejor tercio posible según el plan". No es un escenario extremo; es el escenario bueno dentro de lo razonable. Muy útil para mostrar al cliente qué significa "las cosas van bien" en términos concretos.

**Frase al cliente:** *"Si las cosas salen bien — no excepcional, simplemente bien, en el tercio superior de lo posible — el portafolio llega a USD X a dos años. Un escenario realista de éxito."*

#### 9. Portafolio A en el peor tercil (24m)

**Condición:** El retorno acumulado del portafolio A a 24 meses está entre los peores 33% de los cinco mil escenarios.

**Cuándo usarlo:** el reflejo del anterior. **Escenario desfavorable pero realista**, no catastrófico. Sirve para anclar expectativas: un año o dos en el tercil inferior es parte de lo esperado.

**Frase al cliente:** *"Si las cosas salen mal — no catastróficamente, simplemente en el tercio inferior de lo posible — el portafolio estaría en USD Y a dos años. Es incómodo, pero es parte del rango esperado. El plan debe sostenerse incluso en ese escenario."*

## Análisis asimétrico: matched vs unmatched vs base

Cada view se puede leer en tres versiones simultáneamente:

1. **Base case** — todas las cinco mil trayectorias simuladas. Lo que ya se ve en el panel de stats por default.
2. **Matched** — sólo las trayectorias que cumplen el view.
3. **Unmatched** — sólo las trayectorias que NO cumplen el view.

La herramienta muestra las tres en paralelo cuando un view está activo. Esto explicita la asimetría completa al cliente y es lo que más confianza genera en la conversación:

> *"Si el view se materializa (probabilidad X%), el impacto es A. Si no se materializa (probabilidad 1−X%), el resultado es B. El base case (C) es el promedio ponderado entre esos dos. Veamos las tres versiones."*

Un cliente que ve sólo el matched puede sobre-ponderar el peso emocional del escenario; mostrar también el unmatched y el base ancla la conversación en la totalidad de los resultados posibles.

## Cuándo un view es "confiable" estadísticamente

Un view con muy baja probabilidad condiciona sobre muy pocos paths, y las métricas condicionales se vuelven ruidosas. Regla práctica:

| nMatched | Lectura |
|---|---|
| ≥ 500 | Métricas condicionales estables. Lectura directa. |
| 100-500 | Confiable en los percentiles centrales (P50); cuidado con P10/P90 (intervalos amplios). |
| 50-100 | Señal general sí, pero advertir al cliente que el subconjunto es chico. |
| < 50 | Mostrar sólo la probabilidad del view, no las métricas condicionales (o mostrar con una bandera visible "muestra pequeña"). |

La herramienta reporta **el número de paths que cumplen el view (nMatched)** y el **error estándar de la probabilidad**. Si el error es grande respecto a la probabilidad (ej. probabilidad 2% con SE 0.5%, o SE > 20% de la magnitud de la probabilidad), hay que conversar con cautela.

## Flujo típico de una conversación con cliente usando views

En reunión con cliente, la secuencia recomendada es:

1. **Configurar el plan normalmente** — portafolios, flujos, horizonte. Correr Simular. Leer el panel base de stats.

2. **Preguntar al cliente qué le preocupa**. No empezar con un view preconcebido; escuchar. *"¿Qué escenario le quita el sueño?"* o *"¿Qué tiene que pasar para que este plan falle?"*

3. **Traducir la preocupación en un view**. Si el cliente dice *"me da miedo que las tasas sigan subiendo"* → view "Tasas cierran +100 pbs". Si dice *"me preocupa perderme el próximo rally" →* view "Portafolio sube +20%". Si dice *"no quiero quedarme en un CDT si todo sube" →* view "Mejor tercil a 24m".

4. **Activar el view** y mostrar las tres métricas: probabilidad, impacto condicional si ocurre, impacto si no ocurre.

5. **Contextualizar**. Si la probabilidad es baja, relativizar ("es improbable pero el plan puede absorberlo"). Si es alta, tomarla en serio ("esto vamos a ver con frecuencia razonable; veamos el plan bajo esa lente").

6. **Cerrar con una decisión concreta**: ajustar el portafolio, mantenerlo, o dejar el view documentado para revisión en la próxima reunión.

## Views en el seguimiento futuro

Un view activado en la reunión inicial se puede **re-correr** en cada seguimiento para medir cómo evolucionó la probabilidad a medida que el futuro se va revelando. Si la probabilidad de un view sube materialmente entre reuniones, es una señal temprana de que el régimen de mercado está acercándose al escenario de preocupación del cliente — oportunidad para ajustar antes de que se materialice.

También se puede, al cierre del año, contrastar lo que efectivamente ocurrió contra los views que se activaron en la reunión inicial. Esto convierte la herramienta en un sistema de memoria para la relación asesor-cliente: *"hace un año conversamos este view. Se materializó (o no). El plan reaccionó así."* El cliente ve un asesor que documentó el pensamiento previo, no uno que racionaliza retrospectivamente.
