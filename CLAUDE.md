# Plataforma de analítica para videojuegos — Estudio Xolos

## 1. Contexto
Proyecto de la materia de sistemas propietarios. Estudio de videojuegos ficticio que
construye una **plataforma de métricas multi-juego**: cada juego del estudio manda
eventos a la API y los administradores ven estadísticas por juego en un dashboard.

Primer juego registrado: **"La Casa del Bosque"** (Unity, 2D plataformero narrativo sobre
el duelo infantil, ~20 min, lineal, un solo jugador). Tres niveles, en este orden:
casa abandonada (`casa_abandonada`) → cuarto de hospital (`hospital_cuarto`) → habitación
en llamas (`habitacion_llamas`). Mecánicas: saltar, esquivar fantasmas, evitar
caer a la lava, recolectar una flor para pasar de nivel.

### Los 3 entregables del curso (este repo es el ENTREGA 1)
1. **Sistema de métricas** (este repo): API + MongoDB + dashboard Angular + colección Postman. Fecha: **lunes 19 de octubre de 2026**.
2. Juego en Unity con el SDK/cliente de métricas integrado (otro repo).
3. Página web del estudio: proceso de desarrollo, equipo y foro (otro repo).

Nombre del estudio: **Estudio Xolos**. En el código se lee siempre de la variable de
configuración `APP_NAME` (valor por defecto "Estudio Xolos"); nunca escribirlo a mano.

## 2. Reglas de trabajo para Claude (importante)
- **No inventes requisitos.** Si algo no está en este archivo o en `docs/`, pregunta o
  márcalo como supuesto en `docs/DECISIONES_ABIERTAS.md` y sigue con la opción más simple.
- Trabaja por etapas y espera revisión: diseño → modelos → endpoints → tests → siguiente.
  No generes código sobre un diseño que no haya sido aprobado.
- No instales dependencias nuevas sin decir cuáles y por qué.
- Cambios pequeños, un commit por tarea, mensajes en español con formato
  `tipo: descripción` (feat, fix, docs, test, chore).
- Cada endpoint nuevo lleva: validación, test y su request en la colección de Postman.
- Nunca pongas secretos en el repo. Usa `.env` y mantén `.env.example` actualizado.
- Antes de dar algo por terminado, corre tests y lint y dime el resultado real.
- Si una decisión contradice este archivo, avísame antes de hacerlo.

## 3. Stack
- **API**: Node.js + Express + Mongoose. TypeScript (modo estricto).
- **BD**: MongoDB Atlas, UNA sola base de datos con varias colecciones (no una BD por tema).
- **Dashboard**: Angular (última versión estable), gráficas con una librería ligera
  (ej. ngx-charts o Chart.js). Mapa de calor con canvas sobre la imagen del nivel.
- **Pruebas**: Jest + Supertest para la API. Postman para pruebas manuales y demo.
- **Deploy**: MongoDB Atlas (gratis) + API en Render o Railway + dashboard en
  Netlify/Vercel/Firebase Hosting. Deploy temprano (hacia el día 4–5 de 10).

## 4. Estructura del repositorio (monorepo)
```
/api            Express + Mongoose
/dashboard      Angular
/postman        colección y entornos exportados (local y producción)
/docs           ESQUEMA_EVENTOS.md, DECISIONES_ABIERTAS.md, DISENO_DASHBOARD.md
/scripts        seed de admin y de datos de prueba
CLAUDE.md
```

## 5. Decisiones de arquitectura (ya tomadas)
### Multi-juego
- Colección `juegos`: juegoId, nombre, slug, versionActual, activo, fechaCreacion, apiKeyHash.
- TODO documento de sesiones, eventos, jugadores y logros lleva `juegoId`.
- **API key por juego** (guardada hasheada), revocable de forma independiente.
- Niveles y logros viven en la BD (catálogo por juego), NO escritos fijos en Angular.
- El dashboard debe poder mostrar un segundo juego sin cambiar código del frontend.
- Jugador identificado por la pareja `juegoId + playerId`.
- Admins con campo `juegosPermitidos` (un solo rol por ahora, pero el campo existe).

### Jugadores y sesiones
- **Sin login de jugadores.** Jugador anónimo con UUID generado por el cliente (Unity,
  PlayerPrefs) y enviado como `playerId`.
- Campos de jugador: playerId, juegoId, consentimiento (bool), cuentaId (null, reservado
  para vincular una cuenta del foro en el futuro), primeraVez, ultimaVez.
- "Sesión" = una sesión de juego (abrir a cerrar). La API genera un `sessionId` nuevo en
  cada arranque. Si la sesión no se cierra bien (crash o cierre forzado), se infiere el
  fin con el último evento recibido.

### Seguridad
- **Dashboard**: login de admin con JWT (expiración razonable), contraseñas con bcrypt,
  rutas `/estadisticas/*` protegidas. Primer admin por script seed, SIN registro público.
- **Ingesta (la usa Unity)**: header `X-Api-Key`, validación estricta del esquema
  (rechazar tipos desconocidos, campos faltantes, payloads grandes), rate limiting
  (express-rate-limit), CORS solo para el dominio del dashboard.
- Secretos (JWT, cadena de Mongo, API keys) solo en variables de entorno.

### Privacidad
- Ningún dato personal en ningún evento (sin nombre, correo, IP guardada).
- El aviso de privacidad se hace en el desarrollo del juego; aquí solo queda el campo
  `consentimiento` y un endpoint para borrar los datos de un `playerId`.

## 6. Convenciones técnicas
- Rutas con prefijo y versión: `/api/v1/...`
- Español para colecciones y recursos (jugadores, sesiones, eventos, logros, juegos);
  nombres de campos en camelCase.
- Fechas: ISO 8601 en **UTC**. Los eventos traen `timestamp` del cliente y la API agrega
  `recibidoEn` del servidor.
- Los IDs de jugador y sesión son UUID v4 (string). Los `_id` de Mongo no se exponen
  como llave de negocio.
- Formato de error uniforme: `{ "error": { "codigo": "...", "mensaje": "...", "detalles": [] } }`
- Códigos HTTP: 201 al crear, 400 validación, 401 sin auth, 403 sin permiso, 404,
  413 body demasiado grande, 429 rate limit.
- Respuestas de listas con paginación (`pagina`, `limite`, `total`) donde aplique.
- Ingesta por lotes: `POST /eventos` acepta un evento o un arreglo (Unity puede acumular
  y mandar varios para no saturar la red). Aceptación parcial: responde
  `201 { aceptados, rechazados: [{ indice, codigo, mensaje }] }` aunque `aceptados` sea 0.
- Índices pensados para las consultas del dashboard (juegoId + tipo + timestamp, etc.).

## 7. Esquema base de evento
Campos comunes: `juegoId`, `playerId`, `sessionId`, `timestamp`, `buildVersion`,
`plataforma`, `tipo`, `data` (flexible según el tipo), `versionEsquema`.

Eventos **genéricos** (sirven para cualquier juego): sesion_inicio, sesion_fin,
nivel_inicio, nivel_fin, muerte, logro, pausa, inactividad, error, rendimiento.
Eventos **específicos** por juego (ej. La Casa del Bosque): flor_recogida,
dialogo_saltado, coleccionable_encontrado, tutorial_completado.
Los tipos válidos por juego se registran en el catálogo; la API rechaza los no registrados.

## 8. Métricas a soportar (y qué decisión responde cada una)
**Imprescindibles**
- Sesiones y duración → ¿cuánto juega la gente comparado con lo esperado (~20 min)?
- Tiempo por nivel (por intento) → ¿qué nivel está largo o confuso?
- Embudo de progresión (empezaron → nivel 2 → nivel 3 → terminaron) → ¿dónde se pierde la gente?
- Muertes por nivel y por causa (fantasma, lava, caída) → ¿qué está injusto o mal diseñado?
- Logros (% de jugadores que lo consiguió) → ¿qué es muy fácil o muy difícil?

**Recomendables**
- Mapa de calor de muertes (x, y) → ¿en qué punto exacto fallan?
- Reintentos por nivel → ¿dónde se frustran antes de pasar o rendirse?
- Abandono por nivel (drop-off) → ¿cuál fue el último nivel visto antes de cerrar?
- Completado del tutorial → ¿se entiende la primera sala?
- Versión del build y plataforma → ¿un cambio mejoró o empeoró algo?

**Si alcanza el tiempo**
- Proxies de atención: tiempo inactivo, pausas, diálogos saltados, coleccionables
  encontrados vs disponibles.
- Rendimiento: FPS promedio, tiempos de carga, crashes.

**Fuera de alcance (documentar por qué no se incluyen):** monetización (ARPU),
adquisición y retención D1/D7/D30; no aplican a un juego gratuito de ~20 min.

## 9. Dashboard
- Login de admin.
- Pantalla principal: lista de juegos con resumen (jugadores, sesiones, tasa de completado).
- Vista por juego: embudo, tiempo por nivel, muertes por nivel/causa, mapa de calor,
  logros, filtros por versión de build y rango de fechas.
- Vista comparativa entre juegos: solo si sobra tiempo.
- El diseño visual (paleta, tipografía, componentes) se define en `docs/DISENO_DASHBOARD.md`
  ANTES de escribir Angular. Si ese archivo no existe, pregunta; no improvises un estilo.

## 10. Definición de "terminado" para la entrega 1
- [ ] API desplegada y conectada a Atlas
- [ ] Endpoints de ingesta y de estadísticas funcionando, con validación y tests
- [ ] Login de admin con JWT y rutas protegidas
- [ ] Colección de Postman exportada (entornos local y producción) con tests básicos
- [ ] Datos de prueba que llenen el dashboard (script seed)
- [ ] Dashboard con al menos: embudo, tiempo por nivel, muertes por nivel y logros
- [ ] README con instrucciones de instalación, variables de entorno y cómo correrlo
- [ ] `docs/ESQUEMA_EVENTOS.md` actualizado y coincidente con lo implementado

## 11. Decisiones abiertas (el usuario las resuelve; no las asumas)
- Requisitos exactos de la rúbrica del profesor para la entrega 1
- Proveedor final de hosting de la API
- Si el dashboard llevará modo oscuro / identidad visual del estudio
