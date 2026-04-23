# Parte 5 — Cuatro casos de cliente

> *"La volatilidad no es riesgo. Es el costo de cumplir el objetivo. El riesgo es no cumplir el objetivo."*

Esta es la idea central que atraviesa los cuatro casos de esta sección. Cada cliente tiene un objetivo distinto — acumular para el retiro, proteger un capital conservador, vivir de sus ahorros, dejar un legado — y en cada caso la herramienta sirve para cuantificar el trade-off real: cuánta volatilidad hay que aceptar para que el objetivo sea probable, y cuánto cuesta (en capital final o en probabilidad de ruina) quedarse en la "zona cómoda".

Los cuatro casos cubren las situaciones más frecuentes en la práctica del asesor comercial de Mercantil: acumulación agresiva (Pablo), acumulación conservadora — el cliente renovador de CDT (Diana), decumulación sostenible (Marta), y planificación de legado con estrategia mixta (Carlos). Cada caso muestra cómo leer la herramienta desde las dos familias de indicadores y cómo estructurar la conversación con el cliente tanto en la reunión inicial como en el seguimiento posterior.

---

## Caso 1 — Pablo, 40 años, acumulación para el retiro

### Perfil del cliente

Ingeniero de 40 años, ingreso estable, sin deudas significativas. Tiene USD 100.000 ahorrados y capacidad de aportar USD 2.000 mensuales, que espera crecer al ritmo de su salario (3% anual). Su objetivo es llegar a los 65 años con un capital suficiente para cubrir un retiro posterior de 25 años adicionales. Horizonte efectivo: 25 años.

### Configuración en la herramienta

- **Capital inicial:** USD 100.000
- **Horizonte:** 300 meses (25 años)
- **Modo:** real, inflación 2,5%
- **Regla de flujo:** aporte mensual USD 2.000, crecimiento anual 3%, mes inicio 1, sin fecha fin
- **Portafolio A:** Signature Balanceado
- **Portafolio B:** Signature Crecimiento

### Lectura — Familia A (¿llega el plan a la meta?)

La métrica central para Pablo es la **probabilidad de shortfall** — es decir, cuál es la probabilidad de que después de 25 años aportando religiosamente, termine con menos capital del que puso. Un shortfall alto es una señal de que el perfil de riesgo no está alineado con el horizonte.

- Probabilidad de shortfall Balanceado: `[A]` · Crecimiento: `[B]`
- Valor final mediano Balanceado: `[USD X]` (P10-P90: `[USD Y — Z]`)
- Valor final mediano Crecimiento: `[USD X']` (P10-P90: `[USD Y' — Z']`)

**Lectura esperada:** Crecimiento debería mostrar un valor final mediano significativamente mayor (del orden de USD 300-500K adicionales a 25 años) con un shortfall comparable o apenas mayor. Es el caso clásico donde el horizonte largo permite aprovechar el exceso de retorno de la renta variable.

### Lectura — Familia B (¿cuánto cuesta el camino?)

- Max drawdown Balanceado: `[-X%]` · Crecimiento: `[-Y%]`
- Meses negativos por año Balanceado: `[N]` · Crecimiento: `[M]`
- Peor rolling 12m Balanceado: `[-X%]` · Crecimiento: `[-Y%]`

**Lectura esperada:** Crecimiento probablemente muestra un drawdown máximo de -25% a -35% vs un -15% a -20% en Balanceado. La pregunta al cliente es si está emocionalmente preparado para ver esa magnitud de caída sin tocar el plan.

### Conversación recomendada con Pablo

> *"Pablo, su plan funciona en los dos portafolios: en ambos terminamos los 25 años por encima del capital que usted va a aportar en más del 85% de los escenarios. La pregunta no es si funciona, sino qué tanto rinde vs cuánto puede aguantar en el camino."*
>
> *"Con Crecimiento su capital final esperado es de USD `[X']`, contra USD `[X]` de Balanceado. Una diferencia de USD `[X'-X]` que, compuesta durante 25 años, representa realmente la diferencia entre llegar al retiro con un colchón grande o un colchón estrecho."*
>
> *"El costo: con Crecimiento, en algún momento de los próximos 25 años va a ver su cuenta abajo `[-Y%]` desde el pico. Con Balanceado ese peor momento es `[-X%]`, aproximadamente la mitad. Si usted siente que `[-Y%]` es tolerable — y no va a vender en pánico cuando pase — Crecimiento es el camino más eficiente. Si no, Balanceado le cuesta algo de capital final pero le compra un camino más tranquilo."*

### Para el seguimiento

A 1 año: chequear que el capital efectivo esté dentro de la banda P10-P90 proyectada para el mes 12. A 3 y 5 años: recalcular shortfall probability con el capital remanente y los 22/20 años restantes. Si el shortfall proyectado subió por arriba del inicial, identificar si es por mercado atípico o por cambios del cliente (pausó aportes, por ejemplo).

---

## Caso 2 — Diana, 50 años, renovadora de CDT

### Perfil del cliente

Odontóloga exitosa de 50 años, ingresos altos pero profundamente conservadora con el dinero. A lo largo de su carrera ha acumulado USD 200.000 que durante los últimos diez años ha ido renovando en CDTs a un año, recogiendo aproximadamente 6% nominal con volatilidad percibida de cero. No confía en "el mercado de valores" — su experiencia personal es que el CDT "nunca le ha fallado". El asesor la conoció a través de una referida. Su pregunta implícita: *"¿vale la pena cambiar una estrategia que me ha funcionado?"* Horizonte: 15 años hasta la edad de retiro que tiene planificada (65).

Este es el caso más sutil de la cartera: el cliente que cree que no tiene riesgo, cuando en realidad tiene el riesgo invisible del costo de oportunidad compuesto durante quince años. El trabajo del asesor no es convencerla — es mostrarle con números reales la otra cara de la decisión.

### Configuración en la herramienta

- **Capital inicial:** USD 200.000
- **Horizonte:** 180 meses (15 años)
- **Modo:** real, inflación 2,5% (relevante para mostrar el efecto silencioso de la inflación sobre el CDT)
- **Flujos:** ninguno (Diana no aporta ni retira; es *buy-and-hold*)
- **Portafolio A:** Custom mix — **CashST 50% + GlFI 50%** (aproximación del comportamiento "CDT + cash" disponible en el universo actual de AMCs). Composición efectiva: 30% BIL + 20% SPTS + 5% UST13 + 12,5% DMG7 + 17,5% IG + 5% HY + 10% FIXED6.
- **Portafolio B:** Signature Crecimiento

> **Nota técnica para el equipo comercial:** el Custom mix CashST 50% + GlFI 50% es la representación más cercana disponible hoy en la UI para simular un portafolio "mitad cash mitad FIXED6". Una mejora futura sería agregar un AMC "CDT-Proxy" con 50% CashST + 50% FIXED6 puro, para tener una entrada directa desde el selector. Por ahora, el Custom mix propuesto es suficientemente preciso y la volatilidad esperada queda por debajo del 3% anual — indistinguible en la práctica de un CDT renovado.

### Lectura — Familia A (¿llega el plan a la meta?)

La métrica central para Diana es el **valor final** en términos reales — es decir, cuánto poder adquisitivo tendrá su capital dentro de quince años en ambos escenarios. El truco pedagógico aquí es mostrarle que el CDT renovado "gana" en apariencia (nominal) pero pierde en sustancia (real), mientras Crecimiento tiene un camino más agitado pero llega a un destino materialmente mejor.

- Valor final mediano CDT-Proxy (real): `[USD X]`
- Valor final mediano Crecimiento (real): `[USD X']`
- Diferencia en capital final: `[USD X' - X]`
- Probabilidad de shortfall (terminar con menos de los USD 200.000 iniciales en términos reales):
  - CDT-Proxy: `[α%]` — probablemente bajo pero no cero, por el efecto de la inflación mordiendo un rendimiento nominal modesto.
  - Crecimiento: `[β%]`

**Lectura esperada:** con 5-5,5% nominal y 2,5% de inflación, el CDT-Proxy rinde apenas 2,5-3% real. A quince años eso lleva los USD 200.000 iniciales a aproximadamente USD 290.000 reales — un crecimiento de 45% de poder adquisitivo, no malo pero tampoco transformador. Crecimiento, con retornos reales esperados del orden de 5-6%, lleva el capital a aproximadamente USD 450.000-500.000 reales — una diferencia de USD 160.000-210.000 que Diana literalmente "paga" por no tolerar ver su cuenta rojo en algún momento.

### Lectura — Familia B (¿cuánto cuesta el camino?)

- Max drawdown CDT-Proxy: `[-X%]` (probablemente entre -1% y -3%, virtualmente imperceptible)
- Max drawdown Crecimiento: `[-Y%]` (probablemente -30% a -40% en escenarios como 2008 o 2022 replicados)
- Meses negativos por año CDT-Proxy: `[N]` (muy pocos, típicamente 1-2)
- Meses negativos por año Crecimiento: `[M]` (4-5)
- Peor rolling 12m CDT-Proxy: `[-X%]` (cercano a 0%)
- Peor rolling 12m Crecimiento: `[-Y%]` (-25% a -30%)

La asimetría es enorme. El CDT-Proxy es prácticamente plano. Crecimiento tiene un camino dramáticamente más volátil. Esta es la conversación central.

### Conversación recomendada con Diana

> *"Diana, empecemos por una cosa: su estrategia de CDT ha funcionado. No ha perdido dinero. Eso no tiene por qué cambiar si usted no quiere."*
>
> *"Lo que la herramienta nos permite hacer es poner números sobre el costo de mantener esa estrategia, para que la decisión sea suya con la información completa. En términos nominales, los USD 200.000 se convierten en aproximadamente USD `[monto_cdt_nominal]` en quince años con el CDT. En términos reales — descontando la inflación — eso son USD `[monto_cdt_real]` en poder adquisitivo de hoy. Una ganancia real modesta."*
>
> *"En el otro extremo, un portafolio Crecimiento le lleva esos mismos USD 200.000 a aproximadamente USD `[monto_crec_real]` reales. Una diferencia de USD `[diff]` en términos de lo que usted realmente podrá comprar. Es el equivalente a `[diff/(5*12)]` mil dólares al mes durante los primeros cinco años de su retiro."*
>
> *"El precio: con Crecimiento va a ver su cuenta en algún momento abajo `[-Y%]` desde el pico. Probablemente más de una vez en los quince años. Con el CDT eso nunca pasa. Esa es la decisión: USD `[diff]` adicionales de poder adquisitivo a cambio de tolerar caídas temporales de hasta `[-Y%]` sin vender en pánico."*
>
> *"No hay respuesta correcta. Hay clientes que valoran el USD `[diff]` extra y están emocionalmente preparados para el camino. Hay clientes que valoran más la tranquilidad total y están dispuestos a pagar ese precio. Ambas decisiones son legítimas. Lo importante es que sea una decisión informada, no una decisión por defecto."*

### Para el seguimiento

El valor de esta conversación está en que, una vez documentada, Diana queda anclada a una decisión con ojos abiertos. Si decide quedarse en CDT, perfecto — es su derecho y ahora lo hace sabiendo el costo. Si decide migrar parcialmente (por ejemplo, 70% CDT / 30% Crecimiento como transición), el asesor puede re-correr el plan con esa mezcla y mostrarle el nuevo trade-off.

A un año: si Diana migró a un portafolio invertido y el mercado tuvo un año difícil, el anclaje a esta conversación es fundamental. *"Diana, usted sabía que esto podía pasar. Veníamos midiendo hasta `[-Y%]` de caída máxima y estamos en `[-X%]`. Su capital sigue en la banda P10-P90 proyectada. El plan sigue en curso."* A tres años: recalcular con horizonte restante (12 años) y ver si el trade-off sigue siendo coherente con sus objetivos.

---

## Caso 3 — Marta, 65 años, retiro sostenible

### Perfil del cliente

Recientemente jubilada, sin ingresos laborales. Acumuló USD 500.000 durante su vida laboral. Necesita retirar USD 4.000 mensuales en poder adquisitivo de hoy (modo real) para sostener su nivel de vida. Expectativa de vida planificada: 25 años (hasta los 90). Este es el caso más delicado: una vez empieza a retirar, los primeros años son críticos — un mal mercado combinado con retiros agresivos puede dañar el plan irremediablemente (*sequence-of-returns risk*).

### Configuración en la herramienta

- **Capital inicial:** USD 500.000
- **Horizonte:** 300 meses (25 años)
- **Modo:** real, inflación 2,5%
- **Regla de flujo:** retiro mensual USD 4.000, sin crecimiento adicional (el modo real ya lo infla), mes inicio 1, sin fecha fin
- **Portafolio A:** Signature Conservador
- **Portafolio B:** Signature Balanceado

### Lectura — Familia A (¿llega el plan a la meta?)

La métrica central para Marta es la **probabilidad de ruina**: de cada 100 escenarios, en cuántos se queda sin capital antes de los 90 años.

- Probabilidad de ruina Conservador: `[A%]` · Balanceado: `[B%]`
- Valor final mediano Conservador (si no se arruina): `[USD X]`
- Valor final mediano Balanceado: `[USD X']`

**Punto central esperado — y es el corazón del mensaje del instructivo:** Balanceado puede tener menor probabilidad de ruina que Conservador en horizontes de 15+ años, porque su exceso de retorno compensa con creces la mayor volatilidad inicial. Conservador "se siente seguro" pero con tasas reales bajas puede no alcanzar para cubrir 25 años de retiros — la ruina ocurre silenciosamente en el año 18 o 20, no en el año 2.

Aquí se materializa el mantra rector: **la volatilidad no es riesgo, es el costo de cumplir el objetivo**. Un portafolio Conservador parece "menos riesgoso" pero en realidad aumenta el riesgo real (no cumplir el objetivo de sostener el retiro durante 25 años) a cambio de reducir el costo (la volatilidad visible en los extractos mensuales).

### Lectura — Familia B (¿cuánto cuesta el camino?)

- Max drawdown Conservador: `[-X%]` · Balanceado: `[-Y%]`
- Peor rolling 12m: Conservador `[-X%]` · Balanceado `[-Y%]`

**Lectura esperada:** Conservador muestra drawdowns contenidos (-8% a -12%), Balanceado puede llegar a -18% o -22%. Para una persona en retiro, esa diferencia puede ser emocionalmente decisiva — el asesor debe tomarla en serio, no minimizarla.

### Conversación recomendada con Marta

> *"Marta, necesitamos encontrar el equilibrio entre que el plan dure los 25 años y que usted pueda dormir tranquila todos esos años. Los dos objetivos a veces compiten."*
>
> *"Aquí hay algo contraintuitivo que quiero que veamos juntos. Con Conservador, el peor momento que va a vivir es una caída de `[-X%]` — muy tolerable. Pero tiene una probabilidad del `[A%]` de quedarse sin capital antes de los 90. Con Balanceado, el peor momento es `[-Y%]` — más duro — pero la probabilidad de ruina baja al `[B%]` porque el portafolio crece lo suficiente para absorber los retiros y la inflación."*
>
> *"Lo que esto significa es que el 'riesgo' en su caso no es la volatilidad que ve en el extracto mes a mes. Ese es el costo visible del plan. El riesgo real, el que la puede afectar materialmente, es quedarse sin dinero cuando tiene 85 años. Y paradójicamente, el portafolio 'más arriesgado' a corto plazo es el más seguro contra ese riesgo real."*
>
> *"Mi sugerencia: si puede aguantar ver su cuenta abajo `[-Y%]` en algún momento sin cambiar de estrategia, Balanceado es más seguro a largo plazo aunque parezca más arriesgado hoy. Si `[-Y%]` le genera insomnio genuino, Conservador es mejor, y entonces conversamos si reducimos ligeramente el retiro mensual a USD `[X]` para bajar la probabilidad de ruina a un nivel aceptable."*

### Para el seguimiento

A 1 año: crítico. Un mal primer año en decumulación es el riesgo más peligroso del plan. Si el capital efectivo cayó por debajo de la banda P10, activar conversación de reducción temporal de retiros hasta que el mercado se recupere. A 3 y 5 años: re-evaluación completa, recalculando probabilidad de ruina con capital remanente y horizonte restante. Si la probabilidad subió materialmente, es señal de renegociar el retiro mensual con Marta, no de cambiar el portafolio en pánico.

---

## Caso 4 — Carlos, HNW, legado con estrategia mixta

### Perfil del cliente

Empresario retirado de 60 años, patrimonio líquido USD 2.000.000. No necesita retiros para mantener su nivel de vida (cubierto por otros activos). Objetivo: dejar el mejor legado posible a sus herederos en los próximos 30 años, con un retiro puntual de USD 500.000 en el año 10 para transferir a su hijo mayor como capital semilla de un negocio. Horizonte: 30 años.

### El caso como demostración del alcance de la herramienta

Los tres casos anteriores usan la herramienta con un par de portafolios fijos durante todo el horizonte. Carlos es diferente: su situación pide una **estrategia mixta por fases** — mantenerlo agresivo mientras el horizonte es largo, reducir riesgo cerca del retiro puntual del año 10 para no comprometer la transferencia al hijo, y volver a posición agresiva después del retiro porque quedan 20 años adicionales de horizonte.

Esto no se modela en una sola corrida, pero la herramienta permite analizarlo perfectamente con **tres corridas secuenciales**. Cada corrida toma menos de dos segundos y el resultado combinado muestra el paisaje completo de la estrategia. Lo vemos paso a paso.

### Fases de la estrategia propuesta

| Fase | Años | Portafolio | Razón |
|---|---|---|---|
| Fase 1 | 0-7 | Equity-tilted | Horizonte largo permite capturar retorno compuesto |
| Fase 2 | 7-10 | Balanceado | Proteger el capital antes de la transferencia de USD 500K |
| Fase 3 | 10-30 | Equity-tilted | Vuelven 20 años de horizonte largo tras la transferencia |

*Custom mix "Equity-tilted" sugerido:* 70% USA.Eq + 20% GlSec.Eq + 10% GlFI. Esto le da al portafolio ~90% exposición a renta variable global con un pequeño colchón de renta fija.

### Configuración — Corrida 1 (Fase 1: años 0-7)

- **Capital inicial:** USD 2.000.000
- **Horizonte:** 84 meses (7 años)
- **Modo:** nominal
- **Flujos:** ninguno en esta corrida
- **Portafolio A:** Custom equity-tilted (70% USA.Eq + 20% GlSec.Eq + 10% GlFI)
- **Portafolio B:** Signature Balanceado (referencia de comparación)

**Objetivo de esta corrida:** conocer el capital esperado al final del año 7 si Carlos se mantiene agresivo los primeros siete años. Se anota la **mediana del valor final** — llamémosla `C_año7` — para usarla como capital inicial de la segunda corrida.

### Configuración — Corrida 2 (Fase 2: años 7-10)

- **Capital inicial:** `C_año7` (resultado de la Corrida 1, aproximadamente USD `[valor_medio_año7]`)
- **Horizonte:** 36 meses (3 años)
- **Modo:** nominal
- **Flujos:** ninguno todavía (el retiro puntual es al cierre de esta fase)
- **Portafolio A:** Signature Balanceado
- **Portafolio B:** Custom equity-tilted (mantener referencia de comparación)

**Objetivo de esta corrida:** proteger el capital durante los tres años inmediatamente anteriores al retiro puntual. Se anota la mediana del capital al final del año 10 — llamémosla `C_año10`. Al final de esta fase se ejecuta la transferencia: **capital post-transferencia = `C_año10 − USD 500.000`**.

### Configuración — Corrida 3 (Fase 3: años 10-30)

- **Capital inicial:** `C_año10 − USD 500.000`
- **Horizonte:** 240 meses (20 años)
- **Modo:** nominal
- **Flujos:** ninguno
- **Portafolio A:** Custom equity-tilted
- **Portafolio B:** Signature Balanceado (referencia)

**Objetivo de esta corrida:** medir el legado final al año 30. Se anota la mediana del valor final y la banda P10-P90.

### Lectura combinada — Familia A

Tras las tres corridas, el asesor tiene:

- Capital mediano al año 7 (pre-derisking): `[USD A]`
- Capital mediano al año 10 (pre-transferencia): `[USD B]`
- Transferencia al hijo: USD 500.000
- Capital mediano al año 10 (post-transferencia): `[USD B − 500K]`
- Capital mediano al año 30 (legado final): `[USD C]` — banda P10-P90: `[USD D — E]`

**Comparación con la alternativa simple (Balanceado 30 años continuos):** corremos una cuarta simulación para contraste: portafolio A = Balanceado 100%, horizonte 360 meses, con el retiro único de USD 500.000 en mes 120. Obtenemos el capital mediano al año 30 bajo estrategia simple: `[USD F]`.

**La comparación clave:** `[USD C]` (estrategia mixta) vs `[USD F]` (Balanceado continuo). La diferencia es lo que gana (o paga) Carlos por la sofisticación.

### Lectura combinada — Familia B

Para la estrategia mixta, el drawdown máximo esperado varía por fase:

- Fase 1 (años 0-7, equity-tilted): drawdown máximo esperado `[-X%]`
- Fase 2 (años 7-10, Balanceado): drawdown máximo en la ventana pre-transferencia `[-Y%]` (más suave — este es el punto del derisking)
- Fase 3 (años 10-30, equity-tilted): drawdown máximo esperado `[-Z%]`

**Mensaje clave:** la estrategia mixta no elimina drawdowns, pero reduce materialmente el riesgo de un drawdown severo justo antes del momento en que Carlos necesita hacer la transferencia al hijo. Ese es el único riesgo específico que estamos mitigando.

### Conversación recomendada con Carlos

> *"Carlos, su caso tiene una complicación adicional que vale la pena pensar con cuidado: usted tiene un horizonte de 30 años para el legado, pero también un compromiso en el año 10 — la transferencia a su hijo. Si le caemos con un mal mercado en el año 9 estando 100% en equity, puede llegar al año 10 con menos capital del que había planificado, y la transferencia al hijo sale de un portafolio castigado."*
>
> *"La estrategia simple sería quedarse en Balanceado los 30 años. Eso le da un legado final esperado de USD `[F]` y un drawdown máximo controlado en torno al `[-Y%]` durante todo el período."*
>
> *"La estrategia sofisticada que le propongo funciona en tres etapas. Los primeros siete años usted se mantiene agresivo — capturando el crecimiento de largo plazo. Entre los años siete y diez bajamos el riesgo gradualmente: pasamos a Balanceado. Esto protege la transferencia. Justo después del año diez, cuando el aporte al hijo ya salió, volvemos a agresivo — porque le quedan 20 años de horizonte y no tiene ningún otro compromiso de liquidez."*
>
> *"Corriendo esas tres fases en la herramienta, el legado final esperado a 30 años es de USD `[C]` — una diferencia de USD `[C-F]` versus quedarse en Balanceado continuo. Ese es el premio por la sofisticación. El costo: entre los años 0 y 7 puede ver su cuenta abajo `[-X%]` — drawdown mayor que Balanceado. Después, durante el tramo crítico 7-10, tiene la cobertura de Balanceado. Y en los últimos 20 años vuelve a la exposición agresiva."*
>
> *"La decisión es suya: USD `[C-F]` adicionales de legado a cambio de tolerar una mayor volatilidad en los primeros siete años, sabiendo que precisamente cuando más importa — la transferencia al hijo — vamos a estar protegidos."*

### Para el seguimiento

Este caso tiene tres puntos de revisión naturales que coinciden con los cambios de fase: **año 7 (transición a Balanceado), año 10 (transferencia al hijo), y año siguiente a la transferencia (regreso a equity-tilted)**. En cada uno se re-corre la herramienta con el capital efectivo remanente y el horizonte restante, y se ajusta si el mercado se desvió materialmente de lo proyectado. Si en el año 7 el capital está fuera de la banda P10-P90 original, puede valer la pena mover el inicio del derisking un año antes o un año después, dependiendo del signo de la desviación.

---

## Próximo paso

Este borrador es la versión narrativa completa de los cuatro casos. Los valores numéricos `[entre_corchetes]` se pinean después corriendo los casos en la herramienta real — el asesor configura cada caso exactamente como está documentado y toma screenshots de los resultados. Esos screenshots se vuelven el material visual del PDF final.

Pendientes para cerrar esta parte del instructivo:

1. Correr los 4 casos en la herramienta (Pablo, Diana, Marta, Carlos con sus 3 fases).
2. Pinear los valores `[X]` en el texto con los números reales.
3. Capturar screenshots del config + del fan chart + del stats panel para cada caso.
4. Capturar GIFs específicos donde el movimiento cuenta (ej. slider de ventana en Pablo, comparación 0-10 vs 10-30 en Carlos).
5. Revisión editorial final del asesor senior.
