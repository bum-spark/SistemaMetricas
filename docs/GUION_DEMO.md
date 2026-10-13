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
| 0:00–0:40 | **Login** | "Solo entran admins del estudio, con JWT; no hay registro público. El chip confirma que la API está despierta." | Chip "API: en línea"; entrar con el admin. |
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

## Plan B

| Problema | Qué hacer |
|---|---|
| **La API está dormida** (el chip dice "API: despertando…", o el login tarda) | Seguir hablando del Login y la arquitectura mientras despierta (~1 min). El dashboard muestra "El servidor se está despertando, puede tardar un minuto" después de 8 s. No recargar a cada rato. |
| **La API no responde después de ~90 s** (chip "API: sin conexión") | Pasar a la demo local (abajo) o a las capturas. |
| **No hay red** | Demo local, con todo en la computadora: (1) MongoDB local; (2) en `api/`: `npm run dev`; (3) `npm run crear-admin` y `npm run seed-datos` si la base está vacía; (4) en `dashboard/`: `npm start` y abrir http://localhost:4200. Prepararlo y probarlo **antes** del día de la demo. |
| **Nada funciona** | Recorrer las capturas de `docs/capturas/` (01-login … 08-segundo-juego), que tienen los mismos datos del seed, y la documentación de `docs/`. |
| **El dashboard publicado no carga** | Probar `npm run start:produccion` en `dashboard/` (usa la API real desde `http://localhost:4200`, que está en `CORS_ORIGIN`). |
