# Guion de la demo (5–7 minutos)

Sistema de métricas de **Estudio Xolos**: los juegos mandan eventos a una API, la API los
guarda en MongoDB y el dashboard muestra qué cambiar en cada juego.

Los números de este guion salen del seed (`npm run seed-datos`, semilla 42, 300 jugadores en
La Casa del Bosque y 150 en Faro Nocturno). Si la base tiene otros datos, lee las cifras de la
pantalla: la historia es la misma.

---

## Antes de empezar (10 minutos antes)

1. **Despierta la API** (plan gratuito de Render): abre
   https://xolos-analytics-api.onrender.com/api/v1/salud y espera `{"estado":"ok"}`. La
   primera vez puede tardar ~1 minuto. Vuelve a abrirla 2–3 minutos antes de presentar.
2. Abre el dashboard publicado y deja la pestaña en el **login**. El chip de arriba a la
   derecha debe decir **"API: en línea"**.
3. Ten abiertas, en otras pestañas: la documentación (`/api/v1/docs`) y `docs/capturas/` por
   si algo falla (plan B).
4. Cierra notificaciones y pon el navegador a ~1280 px de ancho.

---

## Recorrido

| Tiempo | Pantalla | Qué decir (pregunta que responde) | Qué mostrar con el seed |
|---|---|---|---|
| 0:00–0:40 | **Login** | "Entran el equipo del estudio y sus invitados, con JWT; no hay registro público. El chip confirma que la API está despierta." | Chip "API: en línea"; entrar con el admin. |
| 0:40–1:20 | **Juegos** | "La plataforma es multi-juego: cada juego manda sus eventos con su propia API key." | Dos tarjetas: La Casa del Bosque (300 jugadores, 326 sesiones, 31 % completado) y Faro Nocturno (demo) sin logo, con su inicial. |
| 1:20–2:20 | **Resumen** de La Casa del Bosque | "¿Cuánto juega la gente comparado con lo esperado y dónde se pierde?" | Duración mediana **20:45** contra **~20:00** esperado; **31 %** termina (93 de 300). Mayor caída: **Cuarto de hospital → Habitación en llamas, −36 %** (76 jugadores), con insignias "Mayor fuga" y "Alta". Pasar el puntero por la insignia para mostrar la regla y la n. |
| 2:20–3:00 | **Progresión** | "¿Dónde se pierde la gente, paso por paso?" | Embudo 300 → 209 → 133 → 93 y la tabla con % del paso anterior. |
| 3:00–3:50 | **Niveles** | "¿Qué nivel está largo o confuso?" | Más largo al completarlo: **Habitación en llamas (08:50)**. Más sesiones rendidas: **Cuarto de hospital (37 %)**, insignia "Fricción alta". Pasada limpia: 49 % de las sesiones pasan un nivel al primer intento. |
| 3:50–5:00 | **Muertes** + mapa de calor | "¿Qué está injusto o mal diseñado? ¿En qué punto exacto fallan?" | 545 muertes; causa más letal **Fantasma (53 %)**; nivel más mortal **Cuarto de hospital (41 %)**. En el mapa, Cuarto de hospital con celda de 5: la zona más caliente cerca de **X 62, Y 2** (caídas). Cambiar la pestaña a "Fantasma" para ver cómo se mueve el calor. |
| 5:00–5:40 | **Logros** | "¿Qué es muy fácil o muy difícil?" | "Tutorial superado" 95 % (Común) contra "La verdad" 4.3 % (Muy raro): el secreto de la carta casi nadie lo encuentra. |
| 5:40–6:20 | **Filtros** | "¿Un cambio de build mejoró o empeoró algo?" | Volver al Resumen y filtrar **Build 1.0.0**: el embudo se pone en rojo (caídas "Crítica"). Cambiar a **1.0.1**: mejora. Mostrar que el filtro queda en la URL (se puede compartir). |
| 6:20–7:00 | **Segundo juego** y cierre | "Un juego nuevo aparece sin tocar el frontend: todo sale de su catálogo." | Cambiar a Faro Nocturno con el selector: 4 niveles, otras causas, todo funciona. Cerrar con la documentación OpenAPI (`/api/v1/docs`) y la prueba de carga del README (≈ 2 270 eventos/s de ingesta en local). |

Frases de cierre: "Escalable (multi-juego, API sin estado, plan de crecimiento medido),
completo (ingesta, estadísticas, dashboard, Postman, SDK de Unity), bien integrado (el mismo
catálogo alimenta API y dashboard) y con visión de futuro (qué quedó fuera y cómo crece está en
ARQUITECTURA.md)."

---

## Invitados (2 minutos)

Se presenta al final o cuando pregunten "¿quién más puede ver esto?". Requiere que
`DASHBOARD_URL` esté configurada en Render (si no, invitar responde un error que lo dice).

**Antes de presentar:** ten lista una **ventana privada** (o un segundo navegador) para hacer
de invitado; en esa ventana no hay sesión. Usa un correo nuevo cada vez (por ejemplo
`invitado.demo+<hora>@ejemplo.mx`): un correo ya usado responde "Ya existe una cuenta".

| Tiempo | Paso en vivo | Qué decir |
|---|---|---|
| 0:00–0:20 | Como admin, sidebar → **Invitados**. Señalar los estados (pendiente, activo, desactivado). | "Podemos dar acceso a alguien de fuera del estudio, por ejemplo al profesor, sin darle control: solo lectura de los juegos que le asignemos." |
| 0:20–0:50 | **Invitar** → correo nuevo, marcar **La Casa del Bosque** → **Crear invitación**. En el modal, **Copiar enlace**. | "El enlace se muestra una sola vez: 32 bytes aleatorios; en la base solo queda su SHA-256. Vence en 72 h y sirve una vez. No mandamos correos: el admin lo comparte por un canal privado." |
| 0:50–1:20 | En la ventana privada, pegar el enlace. Señalar la barra de direcciones (el `#token=…` desaparece). Escribir la contraseña y ver las reglas en verde → **Crear contraseña**. | "El token va después del `#`, que el navegador nunca manda al servidor, y la página lo borra de la URL en cuanto lo lee." |
| 1:20–1:40 | **Ir a iniciar sesión** con el invitado. En `/juegos` solo aparece La Casa del Bosque y no está el menú Invitados. Escribir `/invitados` en la URL: regresa a `/juegos`. | "Ve solo lo asignado. Si alguien llama a la API directo, responde 403: no depende de esconder botones." |
| 1:40–2:00 | Volver a la ventana del admin → **Desactivar** al invitado. En la ventana privada, cambiar de sección: la sesión se corta y vuelve al login. | "Desactivar corta la sesión al instante. **No hay borrado**, solo desactivar, así queda el registro de quién invitó y cuándo. Restablecer genera otro enlace e invalida el anterior." |

**Plan B de esta sección**

| Problema | Qué hacer |
|---|---|
| La API está dormida | Despiértala antes (paso 1 de "Antes de empezar"). Si invitar tarda, cuenta el modelo de seguridad mientras responde. |
| Invitar responde "configura la variable DASHBOARD_URL" | Falta la variable en Render: explicar que es la protección contra enlaces rotos y seguir con las capturas `09-invitados.png` y `10-invitacion.png`. |
| "Copiar enlace" no copia | Clic en el campo del enlace (se selecciona completo) y Ctrl+C. |
| El enlace no abre o dice "Este enlace ya no sirve" | Revisar que se copió completo (con `#token=…`). Si ya se usó o se pegó mal: **Restablecer** en la fila y abrir el nuevo; el anterior ya no sirve. |
| No hay ventana privada | Usar otro navegador. Si el enlace se abre en una pestaña normal, funciona igual (la sesión del admin vive en su pestaña), pero cierra esa pestaña antes de volver al admin. |
| Nada funciona | Capturas `09-invitados.png` y `10-invitacion.png`, y la carpeta "Invitados" de Postman (16 requests con sus pruebas). |

---

## Plan B

| Problema | Qué hacer |
|---|---|
| **La API está dormida** (el chip dice "API: despertando…", o el login tarda) | Seguir hablando del Login y la arquitectura mientras despierta (~1 min). El dashboard muestra "El servidor se está despertando, puede tardar un minuto" después de 8 s. No recargar a cada rato. |
| **La API no responde después de ~90 s** (chip "API: sin conexión") | Pasar a la demo local (abajo) o a las capturas. |
| **No hay red** | Demo local, con todo en la computadora: (1) MongoDB local; (2) en `api/`: `npm run dev`; (3) `npm run crear-admin` y `npm run seed-datos` si la base está vacía; (4) en `dashboard/`: `npm start` y abrir http://localhost:4200. Prepararlo y probarlo **antes** del día de la demo. |
| **Nada funciona** | Recorrer las capturas de `docs/capturas/` (01-login … 08-segundo-juego), que tienen los mismos datos del seed, y la documentación de `docs/`. |
| **El dashboard publicado no carga** | Probar `npm run start:produccion` en `dashboard/` (usa la API real desde `http://localhost:4200`, que está en `CORS_ORIGIN`). |
