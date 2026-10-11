# Esquema de eventos y contrato de la API

> **Estado:** borrador de diseño, pendiente de aprobación. Aún no hay código.
> **Versión del esquema:** `versionEsquema: 1`
>
> Este documento es el contrato entre los juegos (cliente Unity), la API de métricas y el
> dashboard: eventos, colecciones, endpoints y consultas de cada métrica. Tiene que
> coincidir con lo que la API implementa; si cambia la implementación, se actualiza aquí en
> el mismo commit.
>
> Lo que no viene de `CLAUDE.md` ni de una revisión del equipo está marcado como
> **supuesto (S-xx)** y explicado en [`DECISIONES_ABIERTAS.md`](./DECISIONES_ABIERTAS.md).

## Contenido
1. Flujo de ingesta
2. Campos comunes de los eventos
3. Eventos genéricos
4. Eventos específicos de La Casa del Bosque
5. Catálogo por juego (y catálogo de La Casa del Bosque)
6. Colecciones e índices
7. Endpoints
8. Alta de juegos, API keys y admins (scripts)
9. Errores
10. Métricas: eventos y consultas de agregación
11. Ejemplo completo

---

## 1. Flujo de ingesta

```
Unity                                              API (/api/v1)
  │  POST /sesiones {…, consentimiento}  (X-Api-Key)   │
  │ ─────────────────────────────────────────────────▶ │  crea/actualiza jugador, crea sesión
  │ ◀──────────────────────────────── 201 {sessionId}  │
  │  POST /eventos  [sesion_inicio, nivel_inicio, …]    │
  │ ─────────────────────────────────────────────────▶ │  valida cada evento, agrega recibidoEn
  │ ◀────────────────────── 201 {aceptados, rechazados} │
  │  …                                                  │
  │  POST /eventos  [nivel_fin, logro, sesion_fin]      │
  │ ─────────────────────────────────────────────────▶ │
```

### 1.1 Autenticación del juego
Todas las peticiones de ingesta llevan el header `X-Api-Key`. La key identifica al juego.
El campo `juegoId` de cada evento es obligatorio y **debe coincidir** con el juego de la
key; si no, ese evento se rechaza con `JUEGO_NO_COINCIDE` (S-01).

### 1.2 Sesión y consentimiento
Al arrancar el juego, el cliente llama `POST /api/v1/sesiones` con `juegoId`, `playerId`,
`buildVersion`, `plataforma` y **`consentimiento`** (boolean, obligatorio) (S-02).

- El consentimiento se guarda en la colección **`jugadores`** (campo `consentimiento`) y se
  actualiza en cada `POST /sesiones` con el valor que mande el cliente.
- **`consentimiento: true`**: se crea el jugador si no existe (`primeraVez`) o se actualiza
  `ultimaVez`; se crea la sesión y la API responde `201 { sessionId }` (UUID v4 generado por
  la API). Después el cliente manda `sesion_inicio` con ese `sessionId`.
- **`consentimiento: false`** (S-16):
  - No se crea sesión. Respuesta `200 { sessionId: null, consentimiento: false }`.
  - Si el jugador **no existía**, no se guarda nada.
  - Si **ya existía**, solo se cambia su `consentimiento` a `false`. Sus datos anteriores se
    conservan hasta que se borren con el endpoint de borrado (sección 7.2).
  - Cualquier evento posterior de ese `juegoId + playerId` se rechaza con `SIN_CONSENTIMIENTO`.
  - El SDK no debe mandar eventos mientras no tenga `sessionId`.

### 1.3 Envío de eventos (aceptación parcial)
`POST /api/v1/eventos` acepta **un evento (objeto)** o **un arreglo de eventos**.

- Cada evento se valida por separado. Los válidos se guardan; los inválidos se reportan.
  La respuesta es **`201 { aceptados, rechazados: [{ indice, codigo, mensaje }] }`**.
  `indice` es la posición del evento en el arreglo (0 si se mandó un objeto).
  La respuesta es **201 aunque `aceptados` sea 0** (todos rechazados): la petición en sí
  fue válida; el detalle va en `rechazados`.
- **Duplicados:** si llega un `eventoId` que ya existe para ese juego, se ignora sin error
  y **cuenta como aceptado**.
- Errores de **toda la petición** (no llegan a validar eventos): API key inválida (401),
  body que no es objeto ni arreglo (400), más de 100 eventos (400), body mayor a 100 KB
  (413), rate limit (429) (S-04, S-11).
- **Reintentos del SDK:**

  | Resultado de la petición                         | ¿Reintenta?                                      |
  |--------------------------------------------------|--------------------------------------------------|
  | Fallo de red (no llegó respuesta, timeout)       | Sí, con espera creciente (backoff)               |
  | `429` (rate limit)                               | Sí, con espera creciente (backoff)               |
  | `5xx` (error del servidor)                       | Sí, con espera creciente (backoff)               |
  | Cualquier otro `4xx` (400, 401, 403, 404, 413)   | **No.** Volver a mandarlo daría el mismo error.  |
  | `201` con eventos en `rechazados`                | **No reintenta los rechazados.** Están mal; reenviarlos daría el mismo resultado. |

  Como cada evento lleva `eventoId`, reenviar un lote completo es seguro (los repetidos se
  ignoran). Los valores del backoff (espera inicial, máximo, número de intentos) los define
  el SDK en la entrega 2.

### 1.4 Fin de sesión
- Con `sesion_fin`: la sesión guarda `fin` = `timestamp` de ese evento.
- Sin `sesion_fin` (crash o cierre forzado): la API guarda en cada ingesta el
  `ultimoEventoEn` de la sesión. Al consultar, una sesión sin `fin` y sin eventos en los
  últimos **30 minutos** se considera terminada, con fin = `ultimoEventoEn` y
  `finInferido: true`. Las sesiones con menos de 30 min sin eventos se consideran activas y
  no entran en las métricas de duración (S-05).

### 1.5 Rate limit y CORS
- **Por IP:** 300 peticiones/min por IP a los endpoints de ingesta. Es alto porque varios
  jugadores pueden compartir IP en redes de la universidad (R-10). La
  API se configura con `trust proxy` activado (1 salto, el proxy de Render/Railway) para
  leer la IP real del jugador (S-23). La IP solo se usa en memoria para contar peticiones;
  **no se guarda** en la base de datos.
- **Por API key:** tope alto de **1000 peticiones/min por key**, como protección si una key
  se filtra o un build tiene un bug que manda en bucle.
- **Login de admin:** 5 intentos cada 15 min por IP (S-18).
- **`GET /salud`:** sin el rate limit de ingesta ni el de login, para que el monitoreo del
  hosting pueda consultarlo seguido. Solo lleva un límite laxo de 600 peticiones/min por
  IP, para que no se pueda usar para saturar el servidor (S-26).
- CORS: solo el dominio del dashboard. Unity no usa CORS (no es navegador), salvo un build
  WebGL, que no está previsto.

---

## 2. Campos comunes (todos los eventos)

| Campo            | Tipo                  | Oblig. | Validación                                                                                   |
|------------------|-----------------------|:------:|----------------------------------------------------------------------------------------------|
| `eventoId`       | string (UUID v4)      | sí     | UUID v4 generado por el cliente. Único por juego (índice `{ juegoId, eventoId }`).           |
| `juegoId`        | string (UUID v4)      | sí     | Debe coincidir con el juego de la `X-Api-Key` (S-01, S-10).                                  |
| `playerId`       | string (UUID v4)      | sí     | UUID v4 generado por el cliente (PlayerPrefs en Unity). El jugador debe tener consentimiento.|
| `sessionId`      | string (UUID v4)      | sí     | Debe existir y pertenecer al mismo `juegoId + playerId`.                                     |
| `secuencia`      | entero                | sí     | ≥ 1. Contador por sesión que el cliente incrementa con cada evento (ver abajo).               |
| `timestamp`      | string (ISO 8601 UTC) | sí     | Formato `YYYY-MM-DDTHH:mm:ss.sssZ`. Se rechaza si está a más de 24 h en el futuro o más de 7 días en el pasado (S-06). |
| `buildVersion`   | string                | sí     | 1–32 caracteres. Se sugiere semver (`1.0.3`).                                                |
| `plataforma`     | string (enum)         | sí     | `windows`, `macos`, `linux`, `webgl`, `android`, `ios` (S-07).                               |
| `tipo`           | string                | sí     | Debe estar en `catalogo.tiposEvento` del juego; si no, `TIPO_NO_REGISTRADO`.                 |
| `data`           | objeto                | sí     | Puede ser `{}`. Su contenido se valida según `tipo` (secciones 3 y 4).                       |
| `versionEsquema` | entero                | sí     | Por ahora solo `1`.                                                                          |

**Campo que agrega el servidor:** `recibidoEn` (ISO 8601 UTC, hora del servidor). El cliente
no lo manda; si lo manda, el evento se rechaza.

**`secuencia` (orden dentro de la sesión)**
- El cliente la empieza en 1 con el primer evento de cada sesión (normalmente
  `sesion_inicio`) y la incrementa en 1 con cada evento nuevo, sin importar el tipo.
- Sirve de **desempate**: varios eventos pueden tener el mismo `timestamp` (por ejemplo
  `nivel_fin` y `logro`). Toda consulta que necesite el orden de los eventos ordena por
  **`sessionId` y `secuencia`**, no solo por `timestamp`.
- Un reintento manda el evento con la misma `secuencia` y el mismo `eventoId`.
- **Los duplicados se siguen detectando solo por `eventoId`.** La API no exige que
  `secuencia` sea única ni consecutiva: un hueco (evento perdido) o un número repetido no
  provocan rechazo.

**Reglas generales**
- Validación estricta: cualquier campo no listado (en el evento o dentro de `data`) hace que
  se rechace el evento.
- **Ningún dato personal**: nada de nombre, correo ni texto libre del jugador. La IP no se guarda.
- Duraciones siempre en **milisegundos** (`...Ms`), enteros ≥ 0.
- IDs de catálogo (`nivelId`, `logroId`, `causa`, `coleccionableId`) en `snake_case` y deben
  existir en el catálogo del juego.

---

## 3. Eventos genéricos (cualquier juego)

### `sesion_inicio`
Se manda justo después de obtener el `sessionId`. `data`: `{}`

### `sesion_fin`
Cierre normal del juego.

| Campo    | Tipo   | Oblig. | Valores                       |
|----------|--------|:------:|-------------------------------|
| `motivo` | string | sí     | `cierre_normal`, `menu_salir` |

### `nivel_inicio`
Empieza un intento de un nivel.

| Campo     | Tipo    | Oblig. | Notas                                               |
|-----------|---------|:------:|-----------------------------------------------------|
| `nivelId` | string  | sí     | Del catálogo.                                       |
| `intento` | entero  | sí     | ≥ 1. Contador por nivel dentro de la sesión (S-08). |

### `nivel_fin`
Termina un intento. **Cada muerte cierra el intento** y reaparecer abre uno nuevo con
`intento + 1` (S-08).

| Campo        | Tipo   | Oblig. | Valores / notas                         |
|--------------|--------|:------:|-----------------------------------------|
| `nivelId`    | string | sí     | Del catálogo.                           |
| `intento`    | entero | sí     | Igual al del `nivel_inicio`.            |
| `resultado`  | string | sí     | `completado`, `muerte`, `abandono`      |
| `duracionMs` | entero | sí     | Tiempo del intento.                     |

### `muerte`

| Campo     | Tipo   | Oblig. | Notas                                                    |
|-----------|--------|:------:|----------------------------------------------------------|
| `nivelId` | string | sí     | Del catálogo.                                            |
| `intento` | entero | sí     | Intento en el que murió.                                 |
| `causa`   | string | sí     | Del catálogo de causas del juego.                        |
| `x`       | número | sí     | Posición en unidades de mundo de Unity (S-09).           |
| `y`       | número | sí     | Posición en unidades de mundo de Unity (S-09).           |

### `logro`

| Campo     | Tipo   | Oblig. | Notas          |
|-----------|--------|:------:|----------------|
| `logroId` | string | sí     | Del catálogo.  |

- **La API no calcula logros: los manda Unity.** La API solo valida que el `logroId` exista
  y lo registra.
- Un logro cuenta una vez por `juegoId + playerId`: si se repite, el evento se acepta pero
  no se crea otro registro en `logros`.

### `pausa`

| Campo        | Tipo   | Oblig. | Notas                          |
|--------------|--------|:------:|--------------------------------|
| `duracionMs` | entero | sí     | Se manda al salir de la pausa. |
| `nivelId`    | string | no     | Nivel en el que se pausó.      |

### `inactividad`

| Campo        | Tipo   | Oblig. | Notas                                              |
|--------------|--------|:------:|----------------------------------------------------|
| `duracionMs` | entero | sí     | Tiempo sin input. El umbral lo define el cliente.  |
| `nivelId`    | string | no     |                                                    |

### `error`

| Campo     | Tipo    | Oblig. | Notas                                                          |
|-----------|---------|:------:|----------------------------------------------------------------|
| `codigo`  | string  | sí     | Identificador corto del error.                                 |
| `mensaje` | string  | sí     | Máx. 500 caracteres. Sin datos personales ni rutas de usuario. |
| `fatal`   | boolean | sí     | `true` si provocó el cierre (crash).                           |

### `rendimiento`

| Campo           | Tipo   | Oblig. | Notas                         |
|-----------------|--------|:------:|-------------------------------|
| `fpsPromedio`   | número | sí     | Promedio del periodo medido.  |
| `tiempoCargaMs` | entero | no     | Si se mide una carga.         |
| `nivelId`       | string | no     |                               |

---

## 4. Eventos específicos de "La Casa del Bosque"

Solo son válidos para los juegos que los tengan en `catalogo.tiposEvento`.

### `flor_recogida`
Se recoge **la flor que permite pasar de nivel**. (Los pétalos y las piezas de carta **no**
usan este evento: usan `coleccionable_encontrado`.)

| Campo        | Tipo   | Oblig. | Notas                                        |
|--------------|--------|:------:|----------------------------------------------|
| `nivelId`    | string | sí     |                                              |
| `duracionMs` | entero | sí     | Tiempo desde el `nivel_inicio` del intento.  |

### `dialogo_saltado`

| Campo       | Tipo   | Oblig. | Notas                                                     |
|-------------|--------|:------:|-----------------------------------------------------------|
| `dialogoId` | string | sí     | 1–64 caracteres. No se valida contra el catálogo (S-24).  |
| `nivelId`   | string | sí     |                                                           |

### `coleccionable_encontrado`
Pétalos (`hospital_cuarto`) y piezas de carta (`habitacion_llamas`).

| Campo             | Tipo   | Oblig. | Notas                                              |
|-------------------|--------|:------:|----------------------------------------------------|
| `coleccionableId` | string | sí     | Del catálogo; debe pertenecer al `nivelId` enviado. |
| `nivelId`         | string | sí     |                                                    |

### `tutorial_completado`
El tutorial está en **`casa_abandonada`**. Son avisos de controles flotantes en este orden:
**moverse → saltar → esquivar al fantasma → recoger un objeto**.

- **Disparador:** Unity manda el evento **cuando termina el último aviso** (recoger un objeto).
- En el mismo lote, Unity manda el evento `logro` con `logroId: "tutorial_superado"`.

| Campo        | Tipo   | Oblig. | Notas                                                                          |
|--------------|--------|:------:|--------------------------------------------------------------------------------|
| `duracionMs` | entero | sí     | Desde el primer `nivel_inicio` de `casa_abandonada` en la sesión hasta el disparador (S-25). |

---

## 5. Catálogo por juego

El catálogo vive en la base de datos, dentro del documento del juego (`juegos.catalogo`), y
define qué acepta la API y qué muestra el dashboard. Un segundo juego solo necesita su
propio catálogo; el frontend no cambia.

| Sección           | Campos por elemento                                                                       |
|-------------------|-------------------------------------------------------------------------------------------|
| `tiposEvento`     | Lista de strings (genéricos + específicos permitidos).                                    |
| `niveles`         | `nivelId`, `nombre`, `orden`, `descripcion`, `tieneTutorial` (bool), `imagenUrl`, `limites: { minX, maxX, minY, maxY }` (S-09). |
| `causasMuerte`    | `causa`, `nombre`.                                                                        |
| `logros`          | `logroId`, `nombre`, `descripcion`, `nivelId` (opcional).                                 |
| `coleccionables`  | `coleccionableId`, `nivelId`, `nombre`.                                                   |

El embudo usa `orden`; "terminar el juego" = `nivel_fin` `completado` del nivel con el
`orden` más alto.

### 5.1 Catálogo de La Casa del Bosque (definitivo)

En el seed se define **una sola constante** con este catálogo. Se ampliará después.

**Niveles** (en este orden):

| `orden` | `nivelId`           | `nombre`              | Descripción                                                                  | `tieneTutorial` |
|:-------:|---------------------|-----------------------|------------------------------------------------------------------------------|:---------------:|
| 1       | `casa_abandonada`   | Casa abandonada       | Introducción: entra al edificio y ve la cabaña. Incluye el tutorial.         | sí              |
| 2       | `hospital_cuarto`   | Cuarto de hospital    |                                                                              | no              |
| 3       | `habitacion_llamas` | Habitación en llamas  | Cuarto de los cuadros en llamas. Último nivel.                               | no              |

`imagenUrl` y `limites` de cada nivel están pendientes (A-07).

**Causas de muerte:** `fantasma` (Fantasma), `lava` (Lava), `caida` (Caída).

**Logros:**

| `logroId`                       | `nombre`                     | `descripcion`                                                         | Cuándo lo manda Unity                                         |
|---------------------------------|------------------------------|-----------------------------------------------------------------------|---------------------------------------------------------------|
| `tutorial_superado`             | Tutorial superado            | Completa el tutorial de controles.                                    | Junto con `tutorial_completado`.                              |
| `casa_abandonada_completada`    | Casa abandonada completada   | Completa la casa abandonada.                                          | Junto con `nivel_fin` `completado` de `casa_abandonada`.      |
| `hospital_cuarto_completado`    | Cuarto de hospital completado| Completa el cuarto de hospital.                                       | Junto con `nivel_fin` `completado` de `hospital_cuarto`.      |
| `habitacion_llamas_completada`  | Habitación en llamas completada | Completa la habitación en llamas.                                  | Junto con `nivel_fin` `completado` de `habitacion_llamas`.    |
| `la_verdad`                     | **La verdad**                | **Reconstruye la carta con todas las piezas de la habitación en llamas** | Al recoger las 4 piezas de carta (`carta_pieza_1..4`).      |

Los nombres y descripciones de todos los logros salvo `la_verdad` son propuestos (S-20).
`suelo_descubierto` es un **logro**, pero **no está en el catálogo ni en el seed**: su
`nivelId` y su disparador siguen abiertos (A-06).

**Coleccionables** (constantes del seed: 4 por nivel):

| `nivelId`           | `coleccionableId`                                            | Logro asociado |
|---------------------|--------------------------------------------------------------|----------------|
| `habitacion_llamas` | `carta_pieza_1`, `carta_pieza_2`, `carta_pieza_3`, `carta_pieza_4` | `la_verdad` al tener las 4 |
| `hospital_cuarto`   | `petalo_1`, `petalo_2`, `petalo_3`, `petalo_4`               | Ninguno por ahora |

Nombres visibles propuestos: "Pieza de carta N", "Pétalo N" (S-20).

**Tipos de evento:** los 10 genéricos + `flor_recogida`, `dialogo_saltado`,
`coleccionable_encontrado`, `tutorial_completado`.

---

## 6. Colecciones e índices

Una sola base de datos. Los `_id` de Mongo no se exponen; las llaves de negocio son los
campos `...Id`. Fechas en UTC.

### `juegos`

| Campo              | Tipo            | Notas                                                         |
|--------------------|-----------------|---------------------------------------------------------------|
| `juegoId`          | string (UUID v4)| Generado al crear el juego (S-10).                            |
| `nombre`           | string          | "La Casa del Bosque".                                         |
| `slug`             | string          | `la-casa-del-bosque`. Para URLs del dashboard.                |
| `versionActual`    | string          | Último `buildVersion` publicado.                              |
| `activo`           | boolean         | Si es `false`, la ingesta responde 401.                       |
| `fechaCreacion`    | Date            |                                                               |
| `apiKeyHash`       | string \| null  | SHA-256 de la key (S-19). `null` = key revocada.              |
| `apiKeyCreadaEn`   | Date            |                                                               |
| `catalogo`         | objeto          | Sección 5.                                                    |

Índices: `{ juegoId: 1 }` único · `{ slug: 1 }` único · `{ apiKeyHash: 1 }` único (sparse).

### `jugadores`

| Campo            | Tipo            | Notas                                          |
|------------------|-----------------|------------------------------------------------|
| `juegoId`        | string          |                                                |
| `playerId`       | string (UUID v4)|                                                |
| `consentimiento` | boolean         | Se actualiza en cada `POST /sesiones`.          |
| `cuentaId`       | null            | Reservado para vincular cuenta del foro.        |
| `primeraVez`     | Date            |                                                |
| `ultimaVez`      | Date            |                                                |

Índices: `{ juegoId: 1, playerId: 1 }` único · `{ juegoId: 1, primeraVez: 1 }`.

### `sesiones`

| Campo            | Tipo            | Notas                                                     |
|------------------|-----------------|-----------------------------------------------------------|
| `sessionId`      | string (UUID v4)| Generado por la API.                                      |
| `juegoId`        | string          |                                                           |
| `playerId`       | string          |                                                           |
| `buildVersion`   | string          |                                                           |
| `plataforma`     | string          |                                                           |
| `creadaEn`       | Date            | Hora del servidor al crear la sesión.                     |
| `inicio`         | Date \| null    | `timestamp` de `sesion_inicio`.                           |
| `fin`            | Date \| null    | `timestamp` de `sesion_fin`.                              |
| `ultimoEventoEn` | Date            | `timestamp` máximo recibido; base del fin inferido.       |

`duracionMs` y `finInferido` se calculan al consultar (sección 1.4).

Índices: `{ sessionId: 1 }` único · `{ juegoId: 1, creadaEn: 1 }` ·
`{ juegoId: 1, playerId: 1 }` · `{ juegoId: 1, buildVersion: 1, plataforma: 1 }`.

### `eventos`
Los campos de la sección 2 más `recibidoEn`.

Índices:
- `{ juegoId: 1, eventoId: 1 }` **único** — descarta duplicados.
- `{ juegoId: 1, tipo: 1, timestamp: 1 }` — consultas por tipo y rango de fechas.
- `{ juegoId: 1, sessionId: 1, secuencia: 1 }` — reconstruir el orden de una sesión, abandono.
- `{ juegoId: 1, playerId: 1 }` — borrado de jugador.
- `{ juegoId: 1, tipo: 1, buildVersion: 1 }` — filtro por versión.

### `logros` (logros obtenidos)

| Campo        | Tipo   | Notas                                  |
|--------------|--------|----------------------------------------|
| `juegoId`    | string |                                        |
| `playerId`   | string |                                        |
| `logroId`    | string |                                        |
| `sessionId`  | string | Sesión en la que lo obtuvo.            |
| `obtenidoEn` | Date   | `timestamp` del evento `logro`.        |

Índices: `{ juegoId: 1, playerId: 1, logroId: 1 }` único · `{ juegoId: 1, logroId: 1 }`.

### `admins`

| Campo              | Tipo     | Notas                                             |
|--------------------|----------|---------------------------------------------------|
| `email`            | string   | En minúsculas.                                    |
| `passwordHash`     | string   | bcrypt.                                           |
| `nombre`           | string   |                                                   |
| `juegosPermitidos` | string[] | Lista de `juegoId`.                               |
| `activo`           | boolean  |                                                   |
| `creadoEn`         | Date     |                                                   |
| `ultimoLogin`      | Date \| null |                                               |

Índices: `{ email: 1 }` único.

---

## 7. Endpoints

Todos con prefijo `/api/v1`. Errores con el formato de la sección 9.

### 7.0 Salud — sin auth

| Método | Ruta      | Auth | Respuesta                | Notas                                                         |
|--------|-----------|------|--------------------------|---------------------------------------------------------------|
| GET    | `/salud`  | no   | `200 { estado: "ok" }`   | Para el health check del hosting. Sin rate limit estricto (sección 1.5). No consulta datos ni expone versiones. |

### 7.1 Ingesta (la usa Unity) — auth: `X-Api-Key`

| Método | Ruta         | Body                                                                 | Respuesta                                                              |
|--------|--------------|----------------------------------------------------------------------|------------------------------------------------------------------------|
| POST   | `/sesiones`  | `{ juegoId, playerId, buildVersion, plataforma, consentimiento }`    | `201 { sessionId }` · `200 { sessionId: null, consentimiento: false }` (sección 1.2) |
| POST   | `/eventos`   | Un evento o arreglo de hasta 100 eventos (sección 2)                 | `201 { aceptados, rechazados: [{ indice, codigo, mensaje }] }`         |

### 7.2 Administración (la usa el dashboard) — auth: `Authorization: Bearer <JWT>`

Si la ruta lleva `:juegoId` y ese juego no está en `juegosPermitidos` del admin → `403 SIN_PERMISO`.

| Método | Ruta                                  | Auth | Body / query                         | Respuesta                                                                                  |
|--------|---------------------------------------|------|--------------------------------------|--------------------------------------------------------------------------------------------|
| POST   | `/auth/login`                         | no   | `{ email, password }`                | `200 { token, expiraEn, admin: { email, nombre, juegosPermitidos } }` · `401 CREDENCIALES_INVALIDAS` |
| GET    | `/auth/yo`                            | JWT  | —                                    | `200 { email, nombre, juegosPermitidos }`                                                  |
| GET    | `/juegos`                             | JWT  | `?pagina=1&limite=20`                | `200 { datos: [{ juegoId, nombre, slug, versionActual, activo, resumen: { jugadores, sesiones, tasaCompletado } }], pagina, limite, total }` — solo juegos permitidos |
| GET    | `/juegos/:juegoId`                    | JWT  | —                                    | `200 { juegoId, nombre, slug, versionActual, activo, catalogo }` (sin `apiKeyHash`)        |
| DELETE | `/jugadores/:juegoId/:playerId`       | JWT  | —                                    | `200 { eliminados: { jugador, sesiones, eventos, logros } }` · `404 JUGADOR_NO_ENCONTRADO` (S-17) |
| GET    | `/estadisticas/:juegoId/sesiones`     | JWT  | filtros comunes                      | Sección 10.1                                                                               |
| GET    | `/estadisticas/:juegoId/tiempo-nivel` | JWT  | filtros comunes                      | Sección 10.2                                                                               |
| GET    | `/estadisticas/:juegoId/embudo`       | JWT  | filtros comunes                      | Sección 10.3                                                                               |
| GET    | `/estadisticas/:juegoId/muertes`      | JWT  | filtros comunes                      | Sección 10.4                                                                               |
| GET    | `/estadisticas/:juegoId/logros`       | JWT  | filtros comunes                      | Sección 10.5                                                                               |
| GET    | `/estadisticas/:juegoId/mapa-calor`   | JWT  | filtros comunes + `nivelId` (oblig.), `celda` (número > 0, default 1) | Sección 10.6                                              |
| GET    | `/estadisticas/:juegoId/reintentos`   | JWT  | filtros comunes                      | Sección 10.7                                                                               |
| GET    | `/estadisticas/:juegoId/abandono`     | JWT  | filtros comunes                      | Sección 10.8                                                                               |
| GET    | `/estadisticas/:juegoId/tutorial`     | JWT  | filtros comunes                      | Sección 10.9                                                                               |
| GET    | `/estadisticas/:juegoId/versiones`    | JWT  | filtros comunes                      | Sección 10.10                                                                              |
| GET    | `/estadisticas/:juegoId/atencion`     | JWT  | filtros comunes                      | Sección 10.11                                                                              |
| GET    | `/estadisticas/:juegoId/rendimiento`  | JWT  | filtros comunes                      | Sección 10.12                                                                              |

**Filtros comunes** (query, todos opcionales; sin filtros = todo el histórico, S-21):
`desde`, `hasta` (ISO 8601 UTC; rango `[desde, hasta)`), `buildVersion`, `plataforma`.
Valores inválidos → `400 VALIDACION_FALLIDA`.

**Forma de respuesta de `/estadisticas/*`:**
`200 { juegoId, filtros: { desde, hasta, buildVersion, plataforma }, datos: … }`

JWT: expira en 8 h (S-13); payload `{ sub: email, juegosPermitidos }`.

---

## 8. Alta de juegos, API keys y admins (scripts)

No hay endpoints para crear juegos ni admins: se hace con scripts en `/scripts` que se
corren a mano con acceso a la base de datos (S-19).

| Script                   | Qué hace                                                                                                      |
|--------------------------|---------------------------------------------------------------------------------------------------------------|
| `crear-admin`            | Crea el primer admin con `ADMIN_EMAIL`, `ADMIN_PASSWORD` y `ADMIN_NOMBRE` del `.env`. Hashea con bcrypt. No hace nada si el email ya existe. |
| `crear-juego`            | Crea un juego con su catálogo (para La Casa del Bosque, la constante de la sección 5.1). Genera la API key y la **muestra una sola vez** en consola. |
| `rotar-api-key <slug>`   | Genera una key nueva, reemplaza el hash (la anterior deja de servir al instante) y la muestra una sola vez.    |
| `revocar-api-key <slug>` | Pone `apiKeyHash: null`. El juego deja de poder mandar datos; los datos guardados se conservan.               |
| `seed-datos`             | Genera jugadores, sesiones y eventos de prueba que llenan el dashboard.                                        |

**API key:**
- Formato: prefijo `ak_` + 32 bytes aleatorios en base64url (generados con `crypto.randomBytes`).
- Se guarda solo su **SHA-256** en `juegos.apiKeyHash`. Al recibir una petición, la API
  calcula el SHA-256 de la key recibida y la busca por ese índice. (Se usa SHA-256 y no
  bcrypt porque la key es aleatoria y larga, y así se puede buscar por índice; S-19.)
- La key en claro no se guarda en ningún lado del sistema. Si se pierde, se rota.
- Cada juego tiene su propia key: revocar una no afecta a los demás.

---

## 9. Errores

Formato uniforme:

```json
{ "error": { "codigo": "VALIDACION_FALLIDA", "mensaje": "…", "detalles": [] } }
```

### 9.1 Errores de toda la petición

| HTTP | `codigo`                   | Cuándo                                                       |
|:----:|----------------------------|--------------------------------------------------------------|
| 400  | `VALIDACION_FALLIDA`       | Body o query mal formados (no es objeto/arreglo, falta campo en `/sesiones`, filtro inválido). |
| 400  | `LOTE_DEMASIADO_GRANDE`    | Más de 100 eventos (S-04).                                   |
| 401  | `API_KEY_INVALIDA`         | Falta la `X-Api-Key`, no existe, fue revocada o el juego está inactivo. |
| 401  | `NO_AUTENTICADO`           | Falta el JWT, es inválido o expiró.                          |
| 401  | `CREDENCIALES_INVALIDAS`   | Login con email o contraseña incorrectos.                    |
| 403  | `SIN_PERMISO`              | El admin no tiene ese juego en `juegosPermitidos`.           |
| 403  | `JUEGO_NO_COINCIDE`        | En `/sesiones`, `juegoId` distinto al de la key (S-01).      |
| 404  | `JUEGO_NO_ENCONTRADO`      | `:juegoId` no existe.                                        |
| 404  | `JUGADOR_NO_ENCONTRADO`    | Borrado de un `playerId` que no existe.                      |
| 413  | `PAYLOAD_DEMASIADO_GRANDE` | Body mayor a 100 KB (S-04, S-11).                            |
| 429  | `LIMITE_EXCEDIDO`          | Rate limit (sección 1.5).                                    |

### 9.2 Rechazos por evento (dentro de `rechazados` en `POST /eventos`)

| `codigo`               | Cuándo                                                         |
|------------------------|----------------------------------------------------------------|
| `VALIDACION_FALLIDA`   | Falta un campo, tipo incorrecto, campo desconocido, ID de catálogo inexistente. |
| `TIPO_NO_REGISTRADO`   | `tipo` no está en el catálogo del juego.                       |
| `JUEGO_NO_COINCIDE`    | `juegoId` distinto al de la key.                               |
| `SESION_NO_ENCONTRADA` | `sessionId` no existe para ese jugador y juego.                |
| `SIN_CONSENTIMIENTO`   | El jugador tiene `consentimiento: false`.                      |

Un `eventoId` duplicado **no** es un rechazo: se ignora y cuenta como aceptado.

---

## 10. Métricas: eventos y consultas de agregación

`F` = filtro base que se aplica a `eventos`:

```js
F = { juegoId, timestamp: { $gte: desde, $lt: hasta }, buildVersion, plataforma }
// las claves sin valor se omiten
```

Las consultas son pipelines de agregación de MongoDB. Donde hace falta el orden de los
niveles o el total de coleccionables, se toma de `juegos.catalogo`.

- **Versión de MongoDB:** `$median` requiere **MongoDB 7.0 o superior**. Atlas debe usar
  7.0+, y los tests de agregación corren contra un MongoDB en memoria fijado a 7.0 o
  superior (no la versión por defecto de la librería).
- **Orden de eventos:** cuando una consulta depende del orden (por ejemplo 10.8), se ordena
  por `{ sessionId: 1, secuencia: 1 }` (sección 2).

### Resumen

| #     | Métrica (CLAUDE.md §8)         | Eventos y campos                                                   |
|-------|--------------------------------|--------------------------------------------------------------------|
| 10.1  | Sesiones y duración            | `sesiones` (`inicio`, `fin`, `ultimoEventoEn`)                     |
| 10.2  | Tiempo por nivel (por intento) | `nivel_fin.duracionMs`, `nivelId`, `intento`                       |
| 10.3  | Embudo de progresión           | `nivel_inicio`, `nivel_fin` `completado` + `catalogo.niveles.orden`|
| 10.4  | Muertes por nivel y causa      | `muerte.nivelId`, `muerte.causa`                                   |
| 10.5  | Logros (% de jugadores)        | `logro.logroId`                                                    |
| 10.6  | Mapa de calor de muertes       | `muerte.x`, `muerte.y` + `catalogo.niveles.limites`                |
| 10.7  | Reintentos por nivel           | `nivel_inicio.intento`, `nivel_fin.resultado`                      |
| 10.8  | Abandono por nivel             | Último evento de nivel de cada sesión                              |
| 10.9  | Completado del tutorial        | `tutorial_completado` vs `nivel_inicio` del nivel con tutorial     |
| 10.10 | Versión del build y plataforma | `sesiones.buildVersion`, `sesiones.plataforma`                     |
| 10.11 | Proxies de atención            | `inactividad`, `pausa`, `dialogo_saltado`, `coleccionable_encontrado` |
| 10.12 | Rendimiento                    | `rendimiento`, `error` con `fatal: true`, sesiones con fin inferido |

### 10.1 Sesiones y duración
Sobre `sesiones`. Compara contra los ~20 min esperados.

```js
const limite = new Date(Date.now() - 30 * 60 * 1000); // S-05
db.sesiones.aggregate([
  { $match: { juegoId, creadaEn: { $gte: desde, $lt: hasta }, buildVersion, plataforma } },
  { $match: { $or: [ { fin: { $ne: null } }, { ultimoEventoEn: { $lt: limite } } ] } }, // solo terminadas
  { $addFields: {
      finInferido: { $eq: ["$fin", null] },
      duracionMs: { $subtract: [ { $ifNull: ["$fin", "$ultimoEventoEn"] }, { $ifNull: ["$inicio", "$creadaEn"] } ] } } },
  { $facet: {
      totales: [ { $group: { _id: null, sesiones: { $sum: 1 },
                   jugadores: { $addToSet: "$playerId" },
                   promedioMs: { $avg: "$duracionMs" },
                   medianaMs: { $median: { input: "$duracionMs", method: "approximate" } },
                   inferidas: { $sum: { $cond: ["$finInferido", 1, 0] } } } },
                 { $addFields: { jugadores: { $size: "$jugadores" } } } ],
      distribucion: [ { $bucket: { groupBy: "$duracionMs",
                        boundaries: [0, 300000, 600000, 900000, 1200000, 1500000, 1800000, 2700000, 3600000],
                        default: "mas_de_60_min", output: { sesiones: { $sum: 1 } } } } ] } }
])
```
`datos`: `{ sesiones, jugadores, promedioMs, medianaMs, inferidas, distribucion: [{ desdeMs, sesiones }] }`

### 10.2 Tiempo por nivel (por intento)

```js
db.eventos.aggregate([
  { $match: { ...F, tipo: "nivel_fin" } },
  { $group: { _id: { nivelId: "$data.nivelId", resultado: "$data.resultado" },
              intentos: { $sum: 1 },
              promedioMs: { $avg: "$data.duracionMs" },
              medianaMs: { $median: { input: "$data.duracionMs", method: "approximate" } } } }
])
```
`datos`: por `nivelId` (en orden del catálogo): `{ nivelId, completado: {intentos, promedioMs, medianaMs}, muerte: {…}, abandono: {…} }`.
El tiempo del intento que completó el nivel es el que responde "¿qué nivel está largo?".

### 10.3 Embudo de progresión

```js
db.eventos.aggregate([
  { $match: { ...F, $or: [ { tipo: "nivel_inicio" },
                           { tipo: "nivel_fin", "data.resultado": "completado", "data.nivelId": ultimoNivelId } ] } },
  { $group: { _id: { paso: { $cond: [ { $eq: ["$tipo", "nivel_fin"] }, "terminaron", "$data.nivelId" ] },
                     playerId: "$playerId" } } },
  { $group: { _id: "$_id.paso", jugadores: { $sum: 1 } } }
])
```
`ultimoNivelId` = nivel con el `orden` más alto. El servicio ordena los pasos con el catálogo.
`datos`: `[{ paso: "casa_abandonada", jugadores }, { paso: "hospital_cuarto", … }, { paso: "habitacion_llamas", … }, { paso: "terminaron", … }]`, cada uno con `porcentaje` respecto al primero.

### 10.4 Muertes por nivel y causa

```js
db.eventos.aggregate([
  { $match: { ...F, tipo: "muerte" } },
  { $group: { _id: { nivelId: "$data.nivelId", causa: "$data.causa" }, muertes: { $sum: 1 },
              jugadores: { $addToSet: "$playerId" } } },
  { $project: { muertes: 1, jugadores: { $size: "$jugadores" } } }
])
```
`datos`: `[{ nivelId, causa, muertes, jugadores, muertesPorJugador }]`.

### 10.5 Logros (% de jugadores)
Se calcula desde `eventos` (no desde `logros`) para que funcionen los filtros de versión y
plataforma.

```js
db.eventos.aggregate([
  { $match: { ...F, tipo: "logro" } },
  { $group: { _id: { logroId: "$data.logroId", playerId: "$playerId" } } },
  { $group: { _id: "$_id.logroId", jugadores: { $sum: 1 } } }
])
// denominador: jugadores distintos con al menos un evento en F (S-22)
db.eventos.distinct("playerId", F).length
```
`datos`: un elemento por cada logro del catálogo (aunque nadie lo tenga):
`[{ logroId, nombre, jugadores, porcentaje }]`.

### 10.6 Mapa de calor de muertes

```js
db.eventos.aggregate([
  { $match: { ...F, tipo: "muerte", "data.nivelId": nivelId } },
  { $group: { _id: { cx: { $floor: { $divide: ["$data.x", celda] } },
                     cy: { $floor: { $divide: ["$data.y", celda] } },
                     causa: "$data.causa" },
              muertes: { $sum: 1 } } }
])
```
`datos`: `{ nivelId, imagenUrl, limites, celda, celdas: [{ x: cx*celda, y: cy*celda, causa, muertes }] }`.
El dashboard escala `x, y` con `limites` sobre la imagen del nivel en un canvas.

### 10.7 Reintentos por nivel

```js
db.eventos.aggregate([
  { $match: { ...F, tipo: { $in: ["nivel_inicio", "nivel_fin"] } } },
  { $group: { _id: { sessionId: "$sessionId", nivelId: "$data.nivelId" },
              intentos: { $max: "$data.intento" },
              completado: { $max: { $cond: [ { $eq: ["$data.resultado", "completado"] }, 1, 0 ] } } } },
  { $group: { _id: { nivelId: "$_id.nivelId", completado: "$completado" },
              sesiones: { $sum: 1 },
              promedioIntentos: { $avg: "$intentos" },
              maxIntentos: { $max: "$intentos" } } }
])
```
`datos`: `[{ nivelId, pasaron: { sesiones, promedioIntentos, maxIntentos }, seRindieron: { … } }]`.

### 10.8 Abandono por nivel (drop-off)
Último evento de nivel de cada sesión que no terminó el juego. Solo sesiones terminadas
(misma regla que 10.1). Cada sesión cae en una sola categoría:

| Último evento de nivel de la sesión                                   | Categoría                      |
|-----------------------------------------------------------------------|--------------------------------|
| `nivel_fin` `completado` del **último** nivel                         | Terminó el juego (no cuenta)   |
| `nivel_fin` `completado` de un nivel que **no** es el último          | `entreNiveles`, por nivel completado (cerró después de pasar ese nivel y antes de empezar el siguiente) |
| Cualquier otro (`nivel_inicio`, `nivel_fin` con `muerte` o `abandono`) | `dentroDelNivel`, por nivel (abandonó mientras jugaba ese nivel) |
| Sin eventos de nivel                                                  | `antesDelPrimerNivel`          |

```js
const limite = new Date(Date.now() - 30 * 60 * 1000); // S-05
db.eventos.aggregate([
  { $match: { ...F, tipo: { $in: ["nivel_inicio", "nivel_fin"] } } },
  { $sort: { sessionId: 1, secuencia: 1 } },   // secuencia desempata eventos con el mismo timestamp
  { $group: { _id: "$sessionId",
              ultimoNivel: { $last: "$data.nivelId" },
              ultimoTipo: { $last: "$tipo" },
              ultimoResultado: { $last: "$data.resultado" } } },
  // solo sesiones terminadas
  { $lookup: { from: "sesiones", localField: "_id", foreignField: "sessionId", as: "sesion" } },
  { $unwind: "$sesion" },
  { $match: { $or: [ { "sesion.fin": { $ne: null } }, { "sesion.ultimoEventoEn": { $lt: limite } } ] } },
  { $addFields: {
      completoNivel: { $and: [ { $eq: ["$ultimoTipo", "nivel_fin"] }, { $eq: ["$ultimoResultado", "completado"] } ] } } },
  { $match: { $nor: [ { completoNivel: true, ultimoNivel: ultimoNivelId } ] } },   // terminaron el juego
  { $group: { _id: { categoria: { $cond: ["$completoNivel", "entreNiveles", "dentroDelNivel"] },
                     nivelId: "$ultimoNivel" },
              sesiones: { $sum: 1 } } }
])
```
`antesDelPrimerNivel` = sesiones terminadas (consulta de 10.1) − sesiones que aparecen en
esta consulta o que terminaron el juego. `porcentaje` es sobre las sesiones terminadas.

`datos`:
```js
{ sesionesTerminadas,
  antesDelPrimerNivel: { sesiones, porcentaje },
  dentroDelNivel: [{ nivelId, sesiones, porcentaje }],   // abandono dentro de ese nivel
  entreNiveles:   [{ nivelId, sesiones, porcentaje }] }  // nivelId = nivel que acababa de completar
```

### 10.9 Completado del tutorial

```js
const nivelTutorial = catalogo.niveles.find(n => n.tieneTutorial).nivelId; // casa_abandonada
const iniciaron = db.eventos.distinct("playerId", { ...F, tipo: "nivel_inicio", "data.nivelId": nivelTutorial }).length;
db.eventos.aggregate([
  { $match: { ...F, tipo: "tutorial_completado" } },
  { $group: { _id: "$playerId", duracionMs: { $min: "$data.duracionMs" } } },
  { $group: { _id: null, completaron: { $sum: 1 },
              medianaMs: { $median: { input: "$duracionMs", method: "approximate" } } } }
])
```
`datos`: `{ nivelId, iniciaron, completaron, porcentaje, medianaMs }`.

### 10.10 Versión del build y plataforma

```js
db.sesiones.aggregate([
  { $match: { juegoId, creadaEn: { $gte: desde, $lt: hasta } } },
  { $group: { _id: { buildVersion: "$buildVersion", plataforma: "$plataforma" },
              sesiones: { $sum: 1 }, jugadores: { $addToSet: "$playerId" },
              sessionIds: { $push: "$sessionId" } } }
])
```
Por cada grupo se agrega la tasa de completado: sesiones con `nivel_fin` `completado` de
`ultimoNivelId` ÷ sesiones. Además, todos los demás endpoints aceptan `buildVersion` y
`plataforma` como filtro, para comparar una versión contra otra.
`datos`: `[{ buildVersion, plataforma, sesiones, jugadores, duracionMedianaMs, tasaCompletado }]`.

### 10.11 Proxies de atención

```js
// inactividad y pausas por nivel
db.eventos.aggregate([
  { $match: { ...F, tipo: { $in: ["inactividad", "pausa"] } } },
  { $group: { _id: { tipo: "$tipo", nivelId: "$data.nivelId" },
              veces: { $sum: 1 }, totalMs: { $sum: "$data.duracionMs" } } }
])
// diálogos saltados
db.eventos.aggregate([
  { $match: { ...F, tipo: "dialogo_saltado" } },
  { $group: { _id: { nivelId: "$data.nivelId", dialogoId: "$data.dialogoId" }, veces: { $sum: 1 } } }
])
// coleccionables encontrados por jugador (vs disponibles en el catálogo)
db.eventos.aggregate([
  { $match: { ...F, tipo: "coleccionable_encontrado" } },
  { $group: { _id: { nivelId: "$data.nivelId", playerId: "$playerId" },
              encontrados: { $addToSet: "$data.coleccionableId" } } },
  { $group: { _id: "$_id.nivelId",
              jugadores: { $sum: 1 },
              promedioEncontrados: { $avg: { $size: "$encontrados" } },
              jugadoresConTodos: { $sum: { $cond: [ { $eq: [ { $size: "$encontrados" }, disponibles ] }, 1, 0 ] } } } }
])
```
`disponibles` = coleccionables del nivel en el catálogo (4 en `hospital_cuarto` y 4 en
`habitacion_llamas`; en la consulta real se pasa un mapa `nivelId → disponibles`).
`datos`: `{ inactividad: […], pausas: […], dialogosSaltados: […], coleccionables: [{ nivelId, disponibles, jugadores, promedioEncontrados, jugadoresConTodos }] }`.

### 10.12 Rendimiento

```js
db.eventos.aggregate([
  { $match: { ...F, tipo: "rendimiento" } },
  { $group: { _id: { plataforma: "$plataforma", nivelId: "$data.nivelId" },
              fpsPromedio: { $avg: "$data.fpsPromedio" },
              cargaPromedioMs: { $avg: "$data.tiempoCargaMs" } } }
])
db.eventos.aggregate([
  { $match: { ...F, tipo: "error", "data.fatal": true } },
  { $group: { _id: { buildVersion: "$buildVersion", codigo: "$data.codigo" }, crashes: { $sum: 1 } } }
])
```
También se reportan las sesiones con `finInferido` (de 10.1) como posible indicador de crash.
`datos`: `{ fps: […], crashes: […], sesionesFinInferido }`.

---

## 11. Ejemplo completo

Partida corta en `casa_abandonada`: termina el tutorial, muere una vez con un fantasma,
recoge la flor y cierra. Antes, `POST /api/v1/sesiones` respondió:

```json
// request
{ "juegoId": "8c4f2a1e-5d3b-4f7a-9e2c-1b6d8a0f3e57", "playerId": "3f1c9a2e-7b4d-4e8a-9c1f-2d6b8e0a5f71",
  "buildVersion": "1.0.0", "plataforma": "windows", "consentimiento": true }
// 201
{ "sessionId": "b7e2d4c1-0a9f-4b3e-8d2c-6f1a5e9b3c08" }
```

Lote enviado a `POST /api/v1/eventos` (todos los eventos llevan los mismos `juegoId`,
`playerId`, `sessionId`, `buildVersion`, `plataforma` y `versionEsquema`; `secuencia` va
de 1 a 11). Fíjate en los eventos 9 y 10: `nivel_fin` y `logro` tienen el mismo
`timestamp`, y es `secuencia` la que define el orden:

```json
[
  { "eventoId": "a1f0c3d2-0000-4000-8000-000000000001", "juegoId": "8c4f2a1e-5d3b-4f7a-9e2c-1b6d8a0f3e57", "playerId": "3f1c9a2e-7b4d-4e8a-9c1f-2d6b8e0a5f71", "sessionId": "b7e2d4c1-0a9f-4b3e-8d2c-6f1a5e9b3c08", "secuencia": 1, "timestamp": "2026-10-12T18:00:00.000Z", "buildVersion": "1.0.0", "plataforma": "windows", "versionEsquema": 1,
    "tipo": "sesion_inicio", "data": {} },
  { "eventoId": "a1f0c3d2-0000-4000-8000-000000000002", "juegoId": "8c4f2a1e-5d3b-4f7a-9e2c-1b6d8a0f3e57", "playerId": "3f1c9a2e-7b4d-4e8a-9c1f-2d6b8e0a5f71", "sessionId": "b7e2d4c1-0a9f-4b3e-8d2c-6f1a5e9b3c08", "secuencia": 2, "timestamp": "2026-10-12T18:00:05.000Z", "buildVersion": "1.0.0", "plataforma": "windows", "versionEsquema": 1,
    "tipo": "nivel_inicio", "data": { "nivelId": "casa_abandonada", "intento": 1 } },
  { "eventoId": "a1f0c3d2-0000-4000-8000-000000000003", "juegoId": "8c4f2a1e-5d3b-4f7a-9e2c-1b6d8a0f3e57", "playerId": "3f1c9a2e-7b4d-4e8a-9c1f-2d6b8e0a5f71", "sessionId": "b7e2d4c1-0a9f-4b3e-8d2c-6f1a5e9b3c08", "secuencia": 3, "timestamp": "2026-10-12T18:01:00.000Z", "buildVersion": "1.0.0", "plataforma": "windows", "versionEsquema": 1,
    "tipo": "tutorial_completado", "data": { "duracionMs": 55000 } },
  { "eventoId": "a1f0c3d2-0000-4000-8000-000000000004", "juegoId": "8c4f2a1e-5d3b-4f7a-9e2c-1b6d8a0f3e57", "playerId": "3f1c9a2e-7b4d-4e8a-9c1f-2d6b8e0a5f71", "sessionId": "b7e2d4c1-0a9f-4b3e-8d2c-6f1a5e9b3c08", "secuencia": 4, "timestamp": "2026-10-12T18:01:00.000Z", "buildVersion": "1.0.0", "plataforma": "windows", "versionEsquema": 1,
    "tipo": "logro", "data": { "logroId": "tutorial_superado" } },
  { "eventoId": "a1f0c3d2-0000-4000-8000-000000000005", "juegoId": "8c4f2a1e-5d3b-4f7a-9e2c-1b6d8a0f3e57", "playerId": "3f1c9a2e-7b4d-4e8a-9c1f-2d6b8e0a5f71", "sessionId": "b7e2d4c1-0a9f-4b3e-8d2c-6f1a5e9b3c08", "secuencia": 5, "timestamp": "2026-10-12T18:01:40.000Z", "buildVersion": "1.0.0", "plataforma": "windows", "versionEsquema": 1,
    "tipo": "muerte", "data": { "nivelId": "casa_abandonada", "intento": 1, "causa": "fantasma", "x": 12.5, "y": -3.2 } },
  { "eventoId": "a1f0c3d2-0000-4000-8000-000000000006", "juegoId": "8c4f2a1e-5d3b-4f7a-9e2c-1b6d8a0f3e57", "playerId": "3f1c9a2e-7b4d-4e8a-9c1f-2d6b8e0a5f71", "sessionId": "b7e2d4c1-0a9f-4b3e-8d2c-6f1a5e9b3c08", "secuencia": 6, "timestamp": "2026-10-12T18:01:40.000Z", "buildVersion": "1.0.0", "plataforma": "windows", "versionEsquema": 1,
    "tipo": "nivel_fin", "data": { "nivelId": "casa_abandonada", "intento": 1, "resultado": "muerte", "duracionMs": 95000 } },
  { "eventoId": "a1f0c3d2-0000-4000-8000-000000000007", "juegoId": "8c4f2a1e-5d3b-4f7a-9e2c-1b6d8a0f3e57", "playerId": "3f1c9a2e-7b4d-4e8a-9c1f-2d6b8e0a5f71", "sessionId": "b7e2d4c1-0a9f-4b3e-8d2c-6f1a5e9b3c08", "secuencia": 7, "timestamp": "2026-10-12T18:01:42.000Z", "buildVersion": "1.0.0", "plataforma": "windows", "versionEsquema": 1,
    "tipo": "nivel_inicio", "data": { "nivelId": "casa_abandonada", "intento": 2 } },
  { "eventoId": "a1f0c3d2-0000-4000-8000-000000000008", "juegoId": "8c4f2a1e-5d3b-4f7a-9e2c-1b6d8a0f3e57", "playerId": "3f1c9a2e-7b4d-4e8a-9c1f-2d6b8e0a5f71", "sessionId": "b7e2d4c1-0a9f-4b3e-8d2c-6f1a5e9b3c08", "secuencia": 8, "timestamp": "2026-10-12T18:04:12.000Z", "buildVersion": "1.0.0", "plataforma": "windows", "versionEsquema": 1,
    "tipo": "flor_recogida", "data": { "nivelId": "casa_abandonada", "duracionMs": 150000 } },
  { "eventoId": "a1f0c3d2-0000-4000-8000-000000000009", "juegoId": "8c4f2a1e-5d3b-4f7a-9e2c-1b6d8a0f3e57", "playerId": "3f1c9a2e-7b4d-4e8a-9c1f-2d6b8e0a5f71", "sessionId": "b7e2d4c1-0a9f-4b3e-8d2c-6f1a5e9b3c08", "secuencia": 9, "timestamp": "2026-10-12T18:04:12.000Z", "buildVersion": "1.0.0", "plataforma": "windows", "versionEsquema": 1,
    "tipo": "nivel_fin", "data": { "nivelId": "casa_abandonada", "intento": 2, "resultado": "completado", "duracionMs": 150000 } },
  { "eventoId": "a1f0c3d2-0000-4000-8000-00000000000a", "juegoId": "8c4f2a1e-5d3b-4f7a-9e2c-1b6d8a0f3e57", "playerId": "3f1c9a2e-7b4d-4e8a-9c1f-2d6b8e0a5f71", "sessionId": "b7e2d4c1-0a9f-4b3e-8d2c-6f1a5e9b3c08", "secuencia": 10, "timestamp": "2026-10-12T18:04:12.000Z", "buildVersion": "1.0.0", "plataforma": "windows", "versionEsquema": 1,
    "tipo": "logro", "data": { "logroId": "casa_abandonada_completada" } },
  { "eventoId": "a1f0c3d2-0000-4000-8000-00000000000b", "juegoId": "8c4f2a1e-5d3b-4f7a-9e2c-1b6d8a0f3e57", "playerId": "3f1c9a2e-7b4d-4e8a-9c1f-2d6b8e0a5f71", "sessionId": "b7e2d4c1-0a9f-4b3e-8d2c-6f1a5e9b3c08", "secuencia": 11, "timestamp": "2026-10-12T18:04:30.000Z", "buildVersion": "1.0.0", "plataforma": "windows", "versionEsquema": 1,
    "tipo": "sesion_fin", "data": { "motivo": "menu_salir" } }
]
```

Respuesta si todo es válido:

```json
{ "aceptados": 11, "rechazados": [] }
```

Respuesta si el evento de índice 4 trajera `"causa": "agua"` (no está en el catálogo):

```json
{ "aceptados": 10,
  "rechazados": [ { "indice": 4, "codigo": "VALIDACION_FALLIDA", "mensaje": "data.causa 'agua' no está en el catálogo del juego." } ] }
```

Si el SDK reenvía el mismo lote por un fallo de red, la respuesta es otra vez
`{ "aceptados": 11, "rechazados": [] }` y no se guarda nada nuevo (los `eventoId` ya existen).
