# Parte 7 — Troubleshooting

Sección práctica para cuando algo no funciona. Organizada por síntoma.

## La herramienta no abre

### "Double-click en serve.bat y la ventana se abre y cierra inmediatamente"

Lo más probable: Node.js no está instalado o no está en el PATH del sistema. La herramienta requiere Node versión 18 o superior.

1. Verificá si Node está instalado. Abrí una ventana de consola (Win+R → `cmd`) y escribí `node --version`. Si responde con una versión (ej. `v24.14.1`), Node está bien. Si responde con *"'node' no se reconoce como comando"*, no está instalado o no está en el PATH.
2. Si no está instalado: descargá el instalador LTS desde https://nodejs.org. Durante la instalación, aceptá los defaults y asegurate de marcar la opción *"Add to PATH"*.
3. Después de instalar: **reiniciá la computadora** (o cerrá todas las ventanas de consola abiertas) para que el PATH se actualice.
4. Volvé a hacer double-click en `serve.bat`.

### "Node está instalado pero serve.bat sigue fallando"

Abrí `serve.bat` con click derecho → **Ejecutar como administrador** (a veces es un tema de permisos). Si sigue fallando, abrí una consola, navegá a la carpeta del build (`cd C:\Users\...\mercantil-planner-build`) y ejecutá `node serve.mjs` directamente. El mensaje de error te va a decir qué está fallando.

Errores comunes en `node serve.mjs`:

- `Error: EADDRINUSE address already in use :::8080` — el puerto 8080 ya está ocupado por otra aplicación. Cerrá lo que sea que esté usando ese puerto (típicamente otra instancia de la herramienta o algún otro servidor local) y volvé a intentar.
- `Error: ENOENT ... 'index.html'` — la carpeta de la herramienta no está bien. Verificá que `serve.mjs` y `index.html` estén en la misma carpeta.

### "Abrí index.html directamente con double-click y veo la pantalla pero nada funciona"

Chrome y Edge **bloquean Web Workers** cuando el HTML se abre desde `file://`. La herramienta depende de un Web Worker para correr las simulaciones, así que el archivo se tiene que servir por HTTP local. **Siempre usá `serve.bat`**, no el double-click directo a `index.html`.

## La herramienta abre pero se comporta raro

### "El fan chart está vacío y el botón Simular no hace nada"

Primero verificá en la consola del browser (F12 → pestaña "Console") si hay errores en rojo. Los errores más comunes:

- *"Worker is not defined"* o similar — el Web Worker no cargó. Cerrá la pestaña del browser, cerrá la ventana de `serve.bat`, re-abrí ambos.
- *"Cannot read property 'postMessage' of null"* — mismo síntoma, misma solución.

Si no hay errores en consola pero Simular no responde, puede ser que la pantalla no esté cargando el JS principal. Ctrl+F5 (refresh duro) fuerza a que el browser descargue los archivos nuevos en lugar de usar la caché.

### "Los pesos del custom mix no suman 100 y la herramienta no me deja simular"

La suma de pesos en la pestaña Custom debe sumar exactamente 100% (no 99.9 ni 100.1). Click en el botón **"Normalizar a 100%"** debajo de los sliders — la herramienta redistribuye proporcionalmente los pesos hasta que sumen 100.

### "La simulación tarda más de 10 segundos"

Típicamente una simulación de 5000 paths × 360 meses debería tardar 1-3 segundos en una laptop moderna. Si tarda mucho más, posibles causas:

- **Otra aplicación está consumiendo CPU al 100%** — cerrá lo que no esté usando y volvé a probar.
- **La laptop está en modo ahorro de energía** — cambiá a "alto rendimiento" en configuración de batería.
- **Horizonte muy largo + views activos** — los views agregan overhead de evaluación. Si el cliente no necesita views en esa corrida, activá sólo el que está conversando.

## El resultado me parece raro

### "El valor final mediano es menor al capital aportado neto"

Puede ser correcto. Si el portafolio tiene alta volatilidad y el horizonte es corto (< 5 años), la mediana puede caer debajo del capital aportado porque los mercados simplemente no tuvieron tiempo de compensar los drawdowns. La probabilidad de shortfall te confirma si es un escenario raro o frecuente: si el shortfall es > 30%, el perfil de riesgo está desalineado con el horizonte.

Si crees que hay un error real, verificá:
- Que el modo (nominal vs real) sea el que esperás. En modo real, los aportes se ajustan por inflación — un aporte de USD 1.000 mensual en modo real a 20 años se interpreta como "USD 1.000 de hoy", no de dólares nominales.
- Que el horizonte del plan coincida con la ventana de lectura del panel de stats. Si la ventana es más corta que el horizonte, el "valor final" es al cierre de la ventana, no del horizonte total.

### "La probabilidad de ruina es alta y el cliente no está haciendo retiros exagerados"

La probabilidad de ruina aparece sólo cuando hay **retiros programados**. Si tu plan sólo tiene aportes, debería dar 0% siempre. Si tenés reglas de flujo mezcladas (aportes + retiros), verificá que los signos estén bien: los retiros deben tener signo negativo.

Si el cliente retira una cantidad razonable (ej. 4% anual) y la ruina sigue saliendo alta, puede ser que el plan esté con capital insuficiente o un portafolio demasiado conservador para el flujo solicitado. Movelo a Balanceado o agregá capital inicial y vas a ver cómo baja la probabilidad.

### "Exporto a Excel pero el archivo no abre"

Verificá que la extensión del archivo descargado sea `.xlsx` (no `.xls` ni `.xlsx.txt`). Si el browser lo descargó con un nombre raro, renombrálo. Office 2016 o superior lo abre sin problema; versiones anteriores pueden fallar.

Si el archivo abre pero está corrupto o incompleto, probablemente hubo un error de memoria durante la exportación. Intentá reducir el número de paths exportados (por default son los primeros 500 — puede que tu horizonte muy largo llene la hoja). Si persiste, reportá el bug.

## Reportar un bug

Si encontrás algo que claramente anda mal — la herramienta cuelga, arroja un error inesperado, muestra un número que no tiene sentido — mandame un mail o WhatsApp con:

1. **Qué intentaste hacer** (paso a paso, simple).
2. **Qué esperabas ver**.
3. **Qué viste realmente**.
4. **Captura de pantalla** del error o del comportamiento extraño.
5. Si hay mensaje de error en la consola del browser (F12), copiá el texto del error.

**Pocho — Head of Quantitative Research, Mercantil AWM.**
