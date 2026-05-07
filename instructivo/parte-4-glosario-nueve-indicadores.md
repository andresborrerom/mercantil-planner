# Parte 4 — Los nueve indicadores, uno por uno

Los indicadores se agrupan en dos familias. La primera responde si el plan llega a la meta; la segunda responde cuánto le va a costar al cliente transitar el camino. Ambas familias son igual de importantes: entender los dos lados en la reunión inicial es lo que permite después sostener al cliente durante los meses difíciles.

## Familia A — ¿Llega el plan a la meta?

> **Principio rector para las métricas de éxito:** siempre que sea posible, acompañe los porcentajes con su traducción a capital final en dólares. El retorno compuesto convierte diferencias pequeñas en tasa anual en diferencias grandes de capital terminal, y el cliente entiende el impacto en dólares de forma mucho más directa que en puntos porcentuales. La herramienta muestra el valor final mediano y la banda P10-P90 en el panel de stats para facilitar esta traducción.

### 1. Probabilidad de ruina

**Qué mide:** Porcentaje de los cinco mil caminos simulados en los que el cliente agota su capital antes de completar el horizonte del plan. Solo aplica cuando el plan incluye retiros. Es la métrica central de cualquier plan de retiro.

**En reunión inicial:** Si este número supera el nivel de tolerancia acordado con el cliente (usualmente entre 5% y 15% según perfil), el plan como está diseñado no es sostenible. Las alternativas son tres: aumentar el capital inicial, reducir el retiro mensual, o extender el horizonte. Mostrarle al cliente el trade-off con la herramienta abierta es más efectivo que explicarlo en teoría — mueva un slider y vea cómo reacciona el número.

**En seguimiento:** Recalcular anualmente con el capital remanente y el horizonte restante permite ver si el plan sigue dentro del margen. La probabilidad puede subir (si el mercado entregó menos del escenario base) o bajar (si entregó más).

**Frase al cliente:** *"De cada cien escenarios simulados, en X su capital se agotaría antes del plazo. Nuestro objetivo es mantener ese número por debajo de Y."*

### 2. Probabilidad de shortfall

**Qué mide:** Porcentaje de caminos en los que el cliente termina el horizonte con menos capital del que aportó neto (capital inicial más aportes, menos retiros). Responde la pregunta: *"¿mi plan me deja por delante o por detrás de guardar el dinero debajo del colchón?"*

**En reunión inicial:** En planes de acumulación (aportes sin retiros), esta es la métrica central. Un shortfall alto indica que el perfil de riesgo está desalineado con el horizonte — o el horizonte es corto para el riesgo tomado, o el riesgo es insuficiente para el objetivo planteado.

**En seguimiento:** Útil para reafirmar la convicción del cliente durante un mercado plano. *"Su plan está posicionado para salir adelante del colchón en 87 de cada 100 escenarios. El mal período reciente no lo ha sacado de esa banda."*

**Frase al cliente:** *"En X de cada 100 escenarios, el plan termina con menos capital del que usted aportó. Esa es la probabilidad de que la inversión haya sido peor que guardar el dinero por fuera del mercado."*

### 3. Valor final

**Qué mide:** Capital final del cliente al cierre de la ventana seleccionada, reportado como mediana (el escenario típico) acompañada de la banda entre percentil 10 (los peores 10% de los futuros) y percentil 90 (los mejores 10%).

**En reunión inicial:** Es la métrica central de los planes de legado y patrimoniales de largo plazo. Mostrarle al cliente no solo la mediana sino también la banda evita el sesgo de *"mi plan me va a dejar exactamente este número"* — la incertidumbre es parte del resultado.

**En seguimiento:** El valor efectivamente alcanzado debería caer dentro de la banda P10-P90 proyectada originalmente. Si cae por debajo, se activa una conversación de replanificación, no de pánico.

**Frase al cliente:** *"El escenario típico le deja al cierre X. Los malos escenarios (los peores 10%) lo dejan en Y, y los buenos (los mejores 10%) en Z. No es una promesa — es el rango esperado con el que vamos a monitorear."*

### 4. TWR anualizado (time-weighted)

**Qué mide:** Rentabilidad anual del portafolio, descontando el efecto de aportes y retiros. Responde: *"¿qué hizo el mercado con mi estrategia, independiente de cuándo puse dinero?"* Es la métrica estándar para comparar managers y portafolios entre sí.

**En reunión inicial:** Sirve para contextualizar el rendimiento esperado contra los benchmarks del asset class. Un Balanceado debería moverse en el rango 5-7% TWR anualizado histórico; un Crecimiento en 7-9%.

**En seguimiento:** El TWR acumulado desde el inicio del plan le dice al cliente qué hizo su estrategia, separado del impacto de sus flujos. Si el TWR está por encima del proyectado pero el XIRR (ver 5) por debajo, el timing de los aportes le está restando rendimiento.

**Frase al cliente:** *"Independiente de cuándo usted puso o retiró dinero, su estrategia rindió X% anual. Ese es el rendimiento del portafolio como tal."*

### 5. XIRR (money-weighted)

**Qué mide:** Rentabilidad anual efectiva del cliente considerando el monto y la fecha exacta de cada aporte y retiro. Es el número real que ganó el cliente, y lo que aparece en su estado de cuenta anual.

**En reunión inicial:** Si el cliente planea aportar regularmente, el XIRR puede diferir del TWR — típicamente queda por debajo en mercados alcistas (los aportes tardíos compran a precios más altos) o por encima en mercados bajistas (el clásico *dollar-cost averaging*).

**En seguimiento:** Es el número que el cliente ve en su extracto. Comparar el XIRR realizado contra el TWR del portafolio permite explicar la diferencia por timing de flujos sin discusión.

**Frase al cliente:** *"Considerando cuándo usted aportó y retiró, su rentabilidad efectiva anual fue X%. Ese es el número que aparece en su estado de cuenta."*

## Familia B — ¿Cuánto cuesta el camino?

### 6. Max Drawdown (manager-level)

**Qué mide:** La peor caída pico-a-valle que sufrió la estrategia durante la ventana seleccionada, independiente de los flujos del cliente. Es, en pocas palabras, el peor momento que el cliente va a ver en su extracto.

**En reunión inicial:** Si el plan proyecta un drawdown máximo de -18% y el cliente dice *"yo no aguanto ver mi cuenta abajo más de 10%"*, el perfil no es el adecuado. La conversación se mueve a: *"bajamos a Conservador con drawdown esperado cercano a -9%, sabiendo que a cambio el retorno esperado cae de X% a Y% anual — y, más importante para usted, que el capital final esperado al cierre del plan pasa de Z a W."*

**Siempre acompañe la diferencia en puntos porcentuales con la diferencia en capital final absoluto.** El retorno compuesto amplifica una diferencia pequeña de tasa anual en una diferencia muy grande de capital terminal, y el cliente intuitivamente entiende mejor el impacto en dólares sobre el horizonte que en puntos porcentuales.

*Ejemplo concreto:* un cliente con USD 500.000 de capital inicial y 25 años de horizonte, al pasar de 7% a 5% TWR esperado, ve su capital final mediano caer de aproximadamente USD 2,7 millones a USD 1,7 millones — una diferencia de USD 1 millón que, en términos de puntos porcentuales anuales, se pinta como "apenas 2 puntos". La herramienta ya muestra directamente el valor final mediano y la banda P10-P90 en el panel de stats; úselo en la conversación del trade-off.

**En seguimiento:** Cuando el cliente ve un -11% en su extracto, el asesor puede responder con número en mano: *"esto está dentro del rango que le anticipamos. El drawdown máximo esperado en su plan es -18%, aún no lo hemos tocado. Su plan sigue en curso."*

**Frase al cliente:** *"El peor momento que puede esperar ver en su extracto durante los próximos X años es una caída de aproximadamente Y%. No es el escenario típico — es el escenario 'mala racha' que va a aparecer en algún punto del camino."*

### 7. Volatilidad anualizada

**Qué mide:** Cuánto oscila típicamente el portafolio alrededor de su tendencia, expresado como desviación estándar anualizada de los retornos mensuales. Es la métrica tradicional que la industria usa como proxy de riesgo.

**En reunión inicial:** Sirve para posicionar el perfil del cliente dentro de las categorías estándar: volatilidad menor a 6% es Baja, entre 6-12% Media, mayor a 12% Alta. La herramienta muestra la clasificación automáticamente en el card de perfil.

**En seguimiento:** Si la volatilidad realizada difiere mucho de la proyectada, es señal de que el mercado está en un régimen atípico. No es necesariamente un problema del plan, pero sí un dato que vale la pena conversar con el cliente.

**Frase al cliente:** *"Su portafolio oscila típicamente alrededor de X% al año. Esto lo posiciona en perfil [Bajo / Medio / Alto]."*

### 8. Meses negativos por año

**Qué mide:** De cada doce meses, cuántos cerraron en números rojos, en promedio, a lo largo de todos los escenarios. Es la métrica más concreta que el cliente puede verificar él mismo en sus extractos mensuales.

**En reunión inicial:** Ayuda a calibrar la expectativa emocional del cliente: *"su portafolio va a tener 4 o 5 meses negativos al año, en promedio. No uno ni dos. El resto serán positivos, y al final del año la tendencia debería ser netamente positiva — pero los meses negativos son parte del camino."*

**En seguimiento:** Un cliente que se siente mal porque *"tuvo tres meses malos seguidos"* se tranquiliza con: *"usted sabía desde el inicio que íbamos a tener 4 a 5 meses negativos al año. Vamos 3 de 12. Dentro de lo esperado."*

**Frase al cliente:** *"De cada 12 meses, alrededor de 4 o 5 van a cerrar en negativo. No es una falla del plan, es el costo del rendimiento esperado."*

### 9. Peor rolling 12m

**Qué mide:** La peor ventana móvil de 12 meses consecutivos dentro del horizonte — el peor año móvil que vivió el portafolio. Responde directamente a: *"¿cuánto puedo perder en un mal año?"*

**En reunión inicial:** Complementa al drawdown porque tiene ventana fija (12 meses). Muchos clientes piensan en términos de año calendario — esta métrica responde la pregunta natural *"¿cuánto puedo perder en un año?"* sin ambigüedades de ventana.

**En seguimiento:** Si el cliente tuvo un mal año y pregunta *"¿qué tan malo fue?"*, comparar con el peor rolling 12m proyectado pone el resultado en perspectiva: *"Su peor año móvil fue -8%. El peor año posible según el plan era -15%. Dentro del rango."*

**Frase al cliente:** *"En el peor año móvil que puede esperar, su portafolio puede caer hasta X%. Es el escenario 'el peor año que me puede tocar vivir'. Si eso le genera incomodidad, ajustamos el perfil ahora, no durante la crisis."*

---

## Anexo — Métricas de cola disponibles en la sección E del PDF

Las nueve métricas anteriores viven en el **panel de stats** de la herramienta y son las que el asesor lee durante la reunión. Adicional a ellas, el motor calcula dos métricas de cola que **no aparecen en el panel de stats** pero que el cliente recibe en la sección E (Proyecciones) del PDF de cierre. Vale la pena que el asesor las conozca para responder preguntas que pueda hacer el cliente al leer el documento en su casa.

### CVaR_5 (Conditional Value at Risk al 5%)

**Qué mide:** El **promedio del valor patrimonial** del cliente en los escenarios que terminan **debajo del percentil 5**, evaluado a horizontes de 5, 10, 20 y 30 años (filtrado al horizonte del plan). Mientras el P5 dice *"dónde empieza la cola izquierda"*, el CVaR_5 dice *"qué tan profunda es en promedio"*.

**Cuándo importa:** Cuando el cliente pregunta *"y si el escenario es muy malo, ¿qué tan malo es?"*. La respuesta honesta no es el P5 (que es el techo de la cola, no su media), sino el CVaR_5. Para un plan a 20 años, el P5 puede mostrar USD 800.000 y el CVaR_5 USD 600.000 — la diferencia entre *"el peor 5% empieza acá"* y *"el peor 5% en promedio termina acá"*.

**Frase al cliente:** *"En el 5% de escenarios menos favorables, su capital final estaría debajo de USD X (eso es el percentil 5). En esos escenarios, el resultado promedio es USD Y. Para sus efectos prácticos, planee como si el peor caso razonable fuera ese promedio — el percentil sólo le dice dónde empieza la cola, no qué tan profunda es."*

### CVaR_95 (Conditional Value at Risk al 95%)

**Qué mide:** El **promedio del valor patrimonial** en los escenarios que terminan **por encima del percentil 95**. Es el "upside esperado en escenarios excepcionales" — útil para mostrar al cliente el lado positivo del rango de incertidumbre con la misma metodología que el lado negativo.

**Cuándo importa:** Conversaciones de planeación de legado o de capital máximo. El cliente que pregunta *"y si todo me sale bien, ¿hasta dónde puedo llegar?"* recibe una respuesta no inflada — el CVaR_95 es un número honesto, basado en el promedio condicional, no en el escenario más extremo individual.

**Frase al cliente:** *"En el 5% de escenarios más favorables, su capital final estaría por encima de USD X. En esos escenarios excepcionales, el resultado promedio es USD Y. Es el lado bueno del rango — pero contra el cual no recomiendo planear, igual que no recomiendo planear contra el peor extremo individual."*

### Por qué estas dos métricas son un diferenciador

La industria top-tier (Vanguard PAS, UBS Wealth Way, JPM Private Bank, Schwab CMA) reporta probabilidad de éxito o percentiles centrales, pero raramente entrega el CVaR / Expected Shortfall al cliente final. Es una métrica que Basel III exige a bancos institucionales y que la academia (Cogneau-Zakamouline 2013, entre otros) recomienda para wealth retail, pero que la práctica comercial todavía no estandarizó. El PDF de cierre de Mercantil entrega la tríada completa — percentiles centrales, CVaR de colas, y meses negativos esperados al año — en lenguaje cliente. Es un punto que el asesor puede mencionar explícitamente como rigor metodológico diferenciado.

> **Asset pendiente — captura manual.** La sección E del PDF de cierre (Proyecciones) muestra la tabla *"Riesgo de cola por horizonte"* con las cinco filas (P95, CVaR_95, Mediana, P5, CVaR_5) y las columnas 5/10/20/30 años (recortadas según el horizonte del plan). Para incluir el screenshot acá: abrir `research/samples/pocho-longevity.es.pdf` con Adobe Reader o el visor de Edge, navegar a la página 3 ("Proyecciones"), capturar la tabla con Greenshot y guardar como `instructivo/assets/parte-4-anexo-cvar.png`. Después editar este archivo para reemplazar este aviso por `![Tabla de riesgo de cola por horizonte en la sección E del PDF de cierre, mostrando P95, CVaR_95, Mediana, P5 y CVaR_5 a 5/10/20 años](assets/parte-4-anexo-cvar.png)`.
