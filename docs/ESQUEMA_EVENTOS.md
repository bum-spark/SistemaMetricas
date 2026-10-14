# Esquema de eventos y contrato de la API

> **Estado:** implementado en la entrega 1 (API en `api/`). Las métricas 10.8–10.12 están
> diseñadas pero no implementadas (R-54); cada sección lo indica.
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
5. Catálogo por juego (La Casa del Bosque y juego demo)
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
  y **cuenta como aceptado**. Lo mismo si el `eventoId` se repite dentro del mismo lote: se
  guarda una vez y cuenta las dos.
- **Orden de validación de cada evento:** forma común (campos, tipos, campos desconocidos)
  → `juegoId` de la key → `tipo` en el catálogo → ventana de `timestamp` → `data` del tipo
  → IDs de `data` en el catálogo → consentimiento del jugador → sesión. El primer problema
  encontrado es el que se reporta. Los mensajes de validación salen en español.
- **Efectos de un evento aceptado** (idempotentes: un reenvío no cambia nada):
  `sesiones.ultimoEventoEn` = máximo `timestamp`; `inicio`/`fin` = `timestamp` del primer
  `sesion_inicio`/`sesion_fin` recibido; `jugadores.ultimaVez` = hora del servidor; cada
  `logro` crea un registro en `logros` (una vez por jugador).
- Errores de **toda la petición** (no llegan a validar eventos): API key inválida (401),
  body que no es objeto ni arreglo o lote vacío (400), más de 100 eventos (400), body mayor
  a 100 KB (413), rate limit (429) (S-04, S-11, R-35).
- **Reintentos del SDK:**

  | Resultado de la petición                         | ¿Reintenta?                                      |
  |--------------------------------------------------|--------------------------------------------------|
  | Fallo de red (no llegó respuesta, timeout)       | Sí, con espera creciente (backoff)               |
  | `429` (rate limit)                               | Sí, con espera creciente (backoff)               |
  | `5xx` (error del servidor)                       | Sí, con espera creciente (backoff)               |
  | Cualquier otro `4xx` (400, 401, 403, 404, 413)   | **No.** Volver a mandarlo daría el mismo error.  |
  | `201` con eventos en `rechazados`                | **No reintenta los rechazados.** Están mal; reenviarlos daría el mismo resultado. |

  Como cada evento lleva `eventoId`, reenviar un lote completo es seguro (los repetidos se
  ignoran). El SDK de `sdk-unity/` reintenta con espera creciente de 2 s a 60 s, con timeout de
  60 s por petición (R-53, [`SDK_UNITY.md`](./SDK_UNITY.md)).

### 1.4 Fin de sesión (dos relojes, R-34)

La sesión guarda dos relojes por separado, y cada uno se usa para una sola cosa:

| Campo | Reloj | Se actualiza | Se usa para |
|---|---|---|---|
| `inicio`, `fin` | cliente | `timestamp` del primer `sesion_inicio` / `sesion_fin` | duración |
| `ultimoEventoEn` | cliente | máximo `timestamp` recibido; `null` hasta el primer evento | fin inferido y duración |
| `ultimoRecibidoEn` | servidor | hora del servidor en cada ingesta con eventos de la sesión; `null` hasta el primero | decidir si la sesión ya terminó |

- **¿Terminó?** (reloj del servidor): tiene `fin`, o no se recibieron eventos en los
  últimos **30 minutos** (`ultimoRecibidoEn`, S-05). Si no, está activa y no entra en las
  métricas de duración.
- **¿Cuánto duró?** (reloj del cliente): `(fin ?? ultimoEventoEn) − inicio`. Sin `fin`, la
  sesión queda con `finInferido: true` (crash o cierre forzado).
- Nunca se mezclan: un reloj del dispositivo atrasado o adelantado no altera la duración
  (todo sale de timestamps del juego) ni cierra sesiones activas (eso lo decide el servidor).
  `creadaEn` no se usa como respaldo de `inicio`.
- **No entran en las métricas de duración** las sesiones sin `inicio` (no llegó
  `sesion_inicio`), sin eventos (`ultimoEventoEn` null) o con una duración negativa.

### 1.5 Rate limit y CORS
- **Por IP:** 300 peticiones/min por IP a los endpoints de ingesta. Es alto porque varios
  jugadores pueden compartir IP en redes de la universidad (R-10). La
  API se configura con `trust proxy` activado (1 salto, el proxy de Render/Railway) para
  leer la IP real del jugador (S-23). La IP solo se usa en memoria para contar peticiones;
  **no se guarda** en la base de datos.
- **Por API key:** tope alto de **1000 peticiones/min por key**, como protección si una key
  se filtra o un build tiene un bug que manda en bucle.
- **Login de admin:** 5 intentos **fallidos** cada 15 min por IP (S-18, S-43); los exitosos no cuentan. Configurable con `RATE_LIMIT_LOGIN_IP`.
- **Configuración:** los límites y los saltos de proxy se leen de `RATE_LIMIT_INGESTA_IP`,
  `RATE_LIMIT_INGESTA_KEY`, `RATE_LIMIT_PUBLICO_IP` y `TRUST_PROXY` (ver `.env.example`);
  los valores por defecto son los de producción. Solo se cambian para la prueba de carga o
  en local (`TRUST_PROXY=0`).
- **`GET /salud` y `GET /docs`:** sin el rate limit de ingesta ni el de login, para que el monitoreo del
  hosting pueda consultarlo seguido. Solo lleva un límite laxo de 600 peticiones/min por
  IP, para que no se pueda usar para saturar el servidor (S-26).
- CORS: solo los orígenes de `CORS_ORIGIN` (el dominio del dashboard y, si se quiere,
  `http://localhost:4200`), separados por coma. Cada origen debe ser esquema + dominio, sin
  ruta ni `/` final, y `*` no se acepta: si uno está mal escrito la API no arranca. Unity no
  usa CORS (no es navegador), salvo un build WebGL, que no está previsto.

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

**Campos que agrega el servidor** (el cliente no los manda; si manda alguno, el evento se
rechaza por la validación estricta):
- `recibidoEn`: ISO 8601 UTC, hora del servidor.
- `origen`: la ingesta real siempre guarda `"real"` (sección 6, R-32).

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
| `codigo`  | string  | sí     | Identificador corto del error (1–64 caracteres, R-36).         |
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
| `duracionEsperadaMs` | **Opcional.** Entero > 0. Duración esperada de una partida; el dashboard la usa como referencia en el KPI de duración y la omite si falta. |
| `tiposEvento`     | Lista de strings (genéricos + específicos permitidos).                                    |
| `niveles`         | `nivelId`, `nombre`, `orden`, `descripcion`, `tieneTutorial` (bool), `imagenUrl` (URL `http(s)://…` o ruta del dashboard que empieza con `/`, p. ej. `/niveles/<slug>/<nivelId>.svg`), `limites: { minX, maxX, minY, maxY }` (S-09). |
| `causasMuerte`    | `causa`, `nombre`.                                                                        |
| `logros`          | `logroId`, `nombre`, `descripcion`, `nivelId` (opcional).                                 |
| `coleccionables`  | `coleccionableId`, `nivelId`, `nombre`.                                                   |

El embudo usa `orden`; "terminar el juego" = `nivel_fin` `completado` del nivel con el
`orden` más alto.

### 5.1 Catálogo de La Casa del Bosque (definitivo)

En el seed se define **una sola constante** con este catálogo. Se ampliará después.

**Duración esperada:** `duracionEsperadaMs: 1200000` (20 min).

**Niveles** (en este orden):

| `orden` | `nivelId`           | `nombre`              | Descripción                                                                  | `tieneTutorial` |
|:-------:|---------------------|-----------------------|------------------------------------------------------------------------------|:---------------:|
| 1       | `casa_abandonada`   | Casa abandonada       | Introducción: entra al edificio y ve la cabaña. Incluye el tutorial.         | sí              |
| 2       | `hospital_cuarto`   | Cuarto de hospital    |                                                                              | no              |
| 3       | `habitacion_llamas` | Habitación en llamas  | Cuarto de los cuadros en llamas. Último nivel.                               | no              |

**Imágenes y límites (provisionales, A-07):** cada nivel trae `imagenUrl`
(`/niveles/la-casa-del-bosque/<nivelId>.svg`, servida desde `dashboard/public/`) y `limites`:
`casa_abandonada` 0–120 × 0–30, `hospital_cuarto` 0–100 × 0–30, `habitacion_llamas` 0–140 × 0–40.
Son SVG generados (`npm run imagenes-niveles`) con los peligros dibujados donde `seed-datos`
concentra las muertes; se reemplazan por las capturas y límites reales de Unity.

**Logo:** `logoUrl: /logos/la-casa-del-bosque/logo.png` (campo del juego, no del catálogo;
ver sección 6). `crear-juego` y `seed-datos` lo guardan, y `seed-datos` lo completa si falta.

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

### 5.2 Segundo juego ficticio (solo para datos de prueba)

Lo crea `seed-datos` para demostrar que el sistema es multi-juego: otro catálogo, otros
niveles y logros, y el mismo código en la API y el dashboard. No es un juego real del
estudio. Nombre, IDs y textos son propuestos (S-27).

- **Nombre:** "Faro Nocturno (demo)" · **slug:** `faro-nocturno-demo`
- **Duración esperada:** `duracionEsperadaMs: 900000` (15 min).
- **Datos de prueba:** `seed-datos` genera para este juego jugadores, sesiones y eventos con
  el mismo generador que La Casa del Bosque, pero recorriendo **su** catálogo (sus
  niveles, causas, logros y conchas). Así el dashboard muestra los dos juegos con datos
  reales y el mismo código. Si el juego no existe, `seed-datos` lo crea **sin API key**.
- **Imágenes y límites provisionales (A-07):** `muelle` 0–80 × 0–20, `escalera_faro` 0–30 × 0–90
  (vertical), `sala_lampara` 0–60 × 0–40, `azotea` 0–90 × 0–30; imágenes en
  `/niveles/faro-nocturno-demo/<nivelId>.svg`.
- **Diferencias a propósito con La Casa del Bosque:** 4 niveles en lugar de 3, otras
  causas de muerte, sin tutorial, sin `flor_recogida` ni `tutorial_completado`, y 3
  coleccionables en un nivel distinto. Así el dashboard tiene que adaptarse solo al catálogo.

| `orden` | `nivelId`        | `nombre`             | `tieneTutorial` |
|:-------:|------------------|----------------------|:---------------:|
| 1       | `muelle`         | Muelle               | no              |
| 2       | `escalera_faro`  | Escalera del faro    | no              |
| 3       | `sala_lampara`   | Sala de la lámpara   | no              |
| 4       | `azotea`         | Azotea               | no              |

**Causas de muerte:** `agua` (Agua), `caida` (Caída), `cuervo` (Cuervo).

**Logros:** `primer_paso` (Primer paso: completa el muelle), `luz_encendida` (Luz
encendida: completa la azotea), `coleccionista` (Coleccionista: encuentra las 3 conchas).

**Coleccionables:** `concha_1`, `concha_2`, `concha_3` en `muelle` (dan `coleccionista`).

**Tipos de evento:** los 10 genéricos + `coleccionable_encontrado` + `dialogo_saltado`.

> **Límite actual:** el segundo juego solo usa tipos de evento que ya existen. El catálogo
> decide *qué* tipos acepta cada juego, pero la forma del `data` de cada tipo está en los
> esquemas de validación de la API (código). Un tipo **nuevo** (por ejemplo
> `palanca_activada`) hoy requiere agregar su esquema y desplegar. Mover esos esquemas
> al catálogo está en `ARQUITECTURA.md`, "Cómo crece" (S-28).

---

## 6. Colecciones e índices

Una sola base de datos, **explícita**: su nombre viene de `MONGODB_DB` (obligatoria, sin valor por defecto) y se pasa a la conexión como `dbName`, porque el cluster de Atlas puede ser compartido con otros proyectos (R-33). Los `_id` de Mongo no se exponen; las llaves de negocio son los
campos `...Id`. Fechas en UTC.

### `juegos`

| Campo              | Tipo            | Notas                                                         |
|--------------------|-----------------|---------------------------------------------------------------|
| `juegoId`          | string (UUID v4)| Generado al crear el juego (S-10).                            |
| `nombre`           | string          | "La Casa del Bosque".                                         |
| `slug`             | string          | `la-casa-del-bosque`. Para URLs del dashboard.                |
| `logoUrl`          | string (opcional)| Logo del juego para el dashboard: ruta `/logos/<slug>/logo.png` (con el slug del propio juego; el archivo vive en `dashboard/public/`) o URL `https://…`; máx. 500 caracteres. Sin logo, el dashboard muestra un avatar con la inicial. No forma parte del catálogo. La Casa del Bosque: `/logos/la-casa-del-bosque/logo.png`; Faro Nocturno (demo): sin logo. |
| `versionActual`    | string          | Último `buildVersion` publicado.                              |
| `activo`           | boolean         | Si es `false`, la ingesta responde 401.                       |
| `fechaCreacion`    | Date            |                                                               |
| `apiKeyHash`       | string \| null  | SHA-256 de la key (S-19). `null` = key revocada.              |
| `apiKeyCreadaEn`   | Date            |                                                               |
| `catalogo`         | objeto          | Sección 5.                                                    |

Índices: `{ juegoId: 1 }` único · `{ slug: 1 }` único · `{ apiKeyHash: 1 }` único **parcial**
(solo cuando es texto: varios juegos pueden tener la key revocada en `null`).

### `jugadores`

| Campo            | Tipo            | Notas                                          |
|------------------|-----------------|------------------------------------------------|
| `juegoId`        | string          |                                                |
| `playerId`       | string (UUID v4)|                                                |
| `consentimiento` | boolean         | Se actualiza en cada `POST /sesiones`.          |
| `cuentaId`       | null            | Reservado para vincular cuenta del foro.        |
| `primeraVez`     | Date            |                                                |
| `ultimaVez`      | Date            |                                                |
| `origen`         | `"real"` \| `"seed"` | Default `"real"`. Ver "Campo `origen`" al final de esta sección. |

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
| `ultimoEventoEn` | Date \| null    | Reloj del **cliente**: máximo `timestamp` recibido; `null` hasta el primer evento. Solo para fin inferido y duración. |
| `ultimoRecibidoEn` | Date \| null  | Reloj del **servidor**: hora de la última ingesta con eventos; `null` hasta la primera. Solo para decidir si terminó (S-05). |
| `origen`         | `"real"` \| `"seed"` | Default `"real"`.                                      |

`duracionMs` y `finInferido` se calculan al consultar (sección 1.4).

Índices: `{ sessionId: 1 }` único · `{ juegoId: 1, inicio: 1 }` ·
`{ juegoId: 1, playerId: 1 }` · `{ juegoId: 1, buildVersion: 1, plataforma: 1 }`.
(`{ juegoId, inicio }` reemplazó a `{ juegoId, creadaEn }` en la etapa 7: el rango de fechas de
las estadísticas de sesiones filtra por `inicio` y el `explain()` mostraba que el índice anterior
solo servía por el prefijo `juegoId`; R-49.)

### `eventos`
Los campos de la sección 2 más `recibidoEn` y `origen` (`"real"` \| `"seed"`, default `"real"`).

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
| `rol`              | `"admin"` \| `"invitado"` | Sin el campo = admin (documentos anteriores a S-67, sin migración). |
| `passwordHash`     | string \| null | bcrypt (12 rondas). `null` = invitación pendiente. |
| `nombre`           | string   | Vacío si el invitado no lo dio.                   |
| `juegosPermitidos` | string[] | Lista de `juegoId`.                               |
| `activo`           | boolean  |                                                   |
| `creadoEn`         | Date     |                                                   |
| `ultimoLogin`      | Date \| null |                                               |
| `invitadoPor`      | string \| null | Email del admin que invitó.                 |
| `invitadoEn`       | Date \| null |                                               |
| `tokenInvitacionHash` | string \| null | SHA-256 del enlace vigente (nunca el token). |
| `tokenInvitacionExpiraEn` | Date \| null | Vencimiento del enlace (72 h).       |
| `passwordCambiadaEn` | Date \| null | Los JWT emitidos antes ya no sirven.         |

Índices: `{ email: 1 }` único · `{ tokenInvitacionHash: 1 }` único parcial (solo si es string).

### Campo `origen` (R-32)

`jugadores`, `sesiones` y `eventos` llevan `origen`: `"real"` | `"seed"`, default `"real"`.

- **Ingesta real** (`POST /sesiones`, `POST /eventos`): siempre guarda `"real"`. El cliente
  no puede mandar ese campo (la validación estricta rechaza el evento).
- **`seed-datos`**: marca con `"seed"` todo lo que crea. Los datos del juego demo
  "Faro Nocturno (demo)" son siempre `"seed"`.
- **`limpiar-seed`** (sección 8): borra todo lo que tenga `origen: "seed"` (opcionalmente solo
  de un juego) y los logros obtenidos por esos jugadores. Los documentos de `juegos` no se
  tocan.
- `logros` (obtenidos) no lleva `origen`: se identifica por el jugador.
- No se agregó índice nuevo: el borrado por juego usa el prefijo `juegoId` de los índices
  existentes y el borrado global es una operación ocasional.

---

## 7. Endpoints

Todos con prefijo `/api/v1`. Errores con el formato de la sección 9.

### 7.0 Salud — sin auth

| Método | Ruta      | Auth | Respuesta                | Notas                                                         |
|--------|-----------|------|--------------------------|---------------------------------------------------------------|
| GET    | `/salud`  | no   | `200 { estado: "ok" }`   | Para el health check del hosting. Sin rate limit estricto (sección 1.5). No consulta datos ni expone versiones. |
| GET    | `/docs`   | no   | Interfaz Swagger UI      | Documentación OpenAPI 3.1 de todos los endpoints. Se genera desde los esquemas zod de validación, así no se desincroniza del código. Mismo límite laxo que `/salud` (S-26, S-29). |
| GET    | `/docs/openapi.json` | no | Documento OpenAPI en JSON | Para importarlo en Postman u otras herramientas. |

### 7.1 Ingesta (la usa Unity) — auth: `X-Api-Key`

| Método | Ruta         | Body                                                                 | Respuesta                                                              |
|--------|--------------|----------------------------------------------------------------------|------------------------------------------------------------------------|
| POST   | `/sesiones`  | `{ juegoId, playerId, buildVersion, plataforma, consentimiento }`    | `201 { sessionId }` · `200 { sessionId: null, consentimiento: false }` (sección 1.2) |
| POST   | `/eventos`   | Un evento o arreglo de hasta 100 eventos (sección 2)                 | `201 { aceptados, rechazados: [{ indice, codigo, mensaje }] }`         |

### 7.2 Administración (la usa el dashboard) — auth: `Authorization: Bearer <JWT>`

Si la ruta lleva `:juegoId`: si no es UUID v4 → `400`; si no está en `juegosPermitidos` del admin → `403 SIN_PERMISO`; si está permitido pero ya no existe → `404`.

`resumen.tasaCompletado` = jugadores distintos con `nivel_fin` `completado` del último nivel (mayor `orden`) ÷ jugadores del juego, entre 0 y 1 (R-46). `jugadores`, `sesiones` y `tasaCompletado` respetan el parámetro `origen` (por defecto `todos`: reales y seed; R-48).

| Método | Ruta                                  | Auth | Body / query                         | Respuesta                                                                                  |
|--------|---------------------------------------|------|--------------------------------------|--------------------------------------------------------------------------------------------|
| POST   | `/auth/login`                         | no   | `{ email, password }`                | `200 { token, expiraEn, admin: { email, nombre, rol, juegosPermitidos } }` · `401 CREDENCIALES_INVALIDAS` |
| GET    | `/auth/yo`                            | JWT  | —                                    | `200 { email, nombre, rol, juegosPermitidos }` — `rol`: `admin` \| `invitado`             |
| GET    | `/juegos`                             | JWT  | `?pagina=1&limite=20&origen=todos`   | `200 { datos: [{ juegoId, nombre, slug, logoUrl, versionActual, activo, resumen: { jugadores, sesiones, tasaCompletado } }], pagina, limite, total, origen }` — solo juegos permitidos; `origen` = `real` \| `seed` \| `todos` (default) decide qué datos cuenta el resumen |
| GET    | `/juegos/:juegoId`                    | JWT  | —                                    | `200 { juegoId, nombre, slug, logoUrl, versionActual, activo, catalogo, filtros: { buildVersions, plataformas }, contieneDatosSeed }` (sin `apiKeyHash`). `logoUrl` es `null` si el juego no tiene logo (igual en `GET /juegos`). `contieneDatosSeed` = `true` si el juego tiene jugadores, sesiones o eventos con `origen: "seed"` (el dashboard puede avisar que hay datos de prueba). `catalogo` incluye `duracionEsperadaMs` si existe. `filtros` = valores distintos de `buildVersion` y `plataforma` en `sesiones` del juego, ordenados, para llenar los selectores del dashboard. |
| DELETE | `/jugadores/:juegoId/:playerId`       | JWT  | —                                    | `200 { eliminados: { jugador, sesiones, eventos, logros } }` · `404 JUGADOR_NO_ENCONTRADO` (S-17). **Solo rol admin** (invitado → `403 SIN_PERMISO`) |
| GET    | `/estadisticas/:juegoId/sesiones`     | JWT  | filtros comunes                      | Sección 10.1                                                                               |
| GET    | `/estadisticas/:juegoId/tiempo-nivel` | JWT  | filtros comunes                      | Sección 10.2                                                                               |
| GET    | `/estadisticas/:juegoId/embudo`       | JWT  | filtros comunes                      | Sección 10.3                                                                               |
| GET    | `/estadisticas/:juegoId/muertes`      | JWT  | filtros comunes                      | Sección 10.4                                                                               |
| GET    | `/estadisticas/:juegoId/logros`       | JWT  | filtros comunes                      | Sección 10.5                                                                               |
| GET    | `/estadisticas/:juegoId/mapa-calor`   | JWT  | filtros comunes + `nivelId` (oblig.), `celda` (número > 0, default 1) | Sección 10.6                                              |
| GET    | `/estadisticas/:juegoId/reintentos`   | JWT  | filtros comunes                      | Sección 10.7                                                                               |
| GET    | `/estadisticas/:juegoId/abandono`     | JWT  | filtros comunes                      | Sección 10.8 — **no implementado en la entrega 1** (R-54)                                  |
| GET    | `/estadisticas/:juegoId/tutorial`     | JWT  | filtros comunes                      | Sección 10.9 — **no implementado en la entrega 1** (R-54)                                  |
| GET    | `/estadisticas/:juegoId/versiones`    | JWT  | filtros comunes                      | Sección 10.10 — **no implementado en la entrega 1**                                         |
| GET    | `/estadisticas/:juegoId/atencion`     | JWT  | filtros comunes                      | Sección 10.11 — **no implementado en la entrega 1** (R-54)                                 |
| GET    | `/estadisticas/:juegoId/rendimiento`  | JWT  | filtros comunes                      | Sección 10.12 — **no implementado en la entrega 1**                                         |

**Filtros comunes** (query, todos opcionales; sin filtros = todo el histórico, S-21):
`desde`, `hasta` (ISO 8601 UTC; rango `[desde, hasta)`), `buildVersion`, `plataforma`,
**`origen`** (`real` \| `seed` \| `todos`; por defecto `todos`, R-48). Valores inválidos o
`desde >= hasta` → `400 VALIDACION_FALLIDA`. El esquema está en
`api/src/estadisticas/filtros.ts` (`esquemaFiltrosEstadisticas`).

`origen` se aplica sobre el campo `origen` de `eventos`, `sesiones` y `jugadores` (§6): con
`real` el dashboard muestra solo la ingesta del juego; con `seed`, solo los datos de prueba.

**Forma de respuesta de `/estadisticas/*`:**
`200 { juegoId, filtros: { desde, hasta, buildVersion, plataforma, origen }, datos: … }`

JWT: HS256 firmado con `JWT_SECRET`, expira en 8 h (S-13), emisor `xolos-analytics-api`, payload `{ sub: email }`. Los permisos (`juegosPermitidos`) y el estado del admin **no** van en el token: se releen de la base en cada petición, así desactivar un admin o quitarle un juego surte efecto al instante (S-42). Token ausente, inválido, de otro emisor, con `alg: none` o expirado → `401 NO_AUTENTICADO` (el mensaje distingue "expiró"). Login: mismo `401 CREDENCIALES_INVALIDAS` ("Correo o contraseña incorrectos.") para email inexistente, contraseña incorrecta, cuenta pendiente (invitación sin aceptar) o desactivada, con tiempo de respuesta equivalente (siempre se compara contra un hash bcrypt de 12 rondas). Un JWT emitido antes del último cambio de contraseña (`passwordCambiadaEn`) → `401 NO_AUTENTICADO`.

**Roles (S-67).** `admin` e `invitado`. El invitado es de **solo lectura sobre sus juegos**: usa `GET /juegos`, `/juegos/:juegoId`, `/estadisticas/*` y `/auth/yo` igual que un admin (filtrados por sus `juegosPermitidos`), y recibe `403 SIN_PERMISO` en `DELETE /jugadores/...` y en todo `/invitados`. `crear-juego` y `seed-datos` dan cada juego nuevo solo a los admins activos, nunca a invitados.

### 7.3 Invitados — auth: JWT de rol admin, salvo las dos rutas públicas

| Método | Ruta | Auth | Body / query | Respuesta |
|--------|------|------|--------------|-----------|
| POST   | `/invitados` | admin | `{ email, nombre?, juegos: [juegoId, …] }` (al menos uno) | `201 { invitado, enlace, expiraEn }` — el enlace se responde **una sola vez** · `403` si asigna un juego que el admin no tiene · `409 CORREO_YA_REGISTRADO` |
| GET    | `/invitados` | admin | `?pagina=1&limite=20` | `200 { datos: [invitado], pagina, limite, total }` — solo cuentas `rol: "invitado"`, sin enlaces |
| PATCH  | `/invitados/:email` | admin | `{ juegos?, activo? }` (al menos uno) | `200 invitado`. Desactivar invalida el enlace pendiente y corta la sesión al instante; reactivar no revive el enlace. Los juegos que el admin no tiene se conservan |
| POST   | `/invitados/:email/restablecer` | admin | — | `200 { invitado, enlace, expiraEn }` — enlace nuevo; el anterior deja de servir · `409 INVITADO_DESACTIVADO` |
| GET    | `/auth/invitacion/validar` | no | header `X-Invitacion-Token` | `200 { email, nombre, expiraEn }` · `400 INVITACION_INVALIDA` |
| POST   | `/auth/invitacion/aceptar` | no | `{ token, password }` | `200 { email }` · `400 VALIDACION_FALLIDA` (contraseña de menos de 12) · `400 INVITACION_INVALIDA` |

`invitado` = `{ email, nombre, estado: "pendiente" | "activo" | "desactivado", juegos, invitadoPor, invitadoEn, ultimoAcceso, enlaceExpiraEn }`; `enlaceExpiraEn` es `null` si no hay enlace vigente.

- **`DASHBOARD_URL` en producción:** obligatoria y no local. Si falta o es `localhost`, `POST /invitados` y `/restablecer` responden `500 DASHBOARD_URL_NO_CONFIGURADA` con un mensaje que dice qué variable configurar, **antes** de crear la cuenta o el token. En desarrollo, sin valor se usa el primer origen de `CORS_ORIGIN`.
- **Enlace:** `<DASHBOARD_URL>/invitacion#token=<43 caracteres base64url>` (32 bytes aleatorios). El token va en el **fragmento**, que el navegador no manda al servidor; la página lo lee y lo borra de la URL. Se guarda solo su SHA-256, vence a las **72 h** y es de **un solo uso**: `aceptar` crea la contraseña (bcrypt, 12 rondas) y consume el token en la misma operación atómica.
- **Errores genéricos:** token inexistente, mal formado, vencido, usado, invalidado o de una cuenta desactivada → el mismo `400 INVITACION_INVALIDA` con el mismo mensaje. `aceptar` calcula el bcrypt antes de buscar el token, así que tarda lo mismo en todos los casos.
- **Rate limit:** `validar` y `aceptar` comparten un límite de **10 peticiones por IP cada 15 min** (`RATE_LIMIT_INVITACION_IP`), contando todas.
- **Límites del admin:** solo asigna juegos que él tiene; sobre su propia cuenta → `403`; sobre otro admin (con o sin `rol`) → `404 INVITADO_NO_ENCONTRADO` (estos endpoints solo ven invitados).
- **Restablecer** no borra la contraseña actual: sigue valiendo hasta que se use el enlace nuevo; al usarlo, las sesiones anteriores dejan de servir.

---

## 8. Alta de juegos, API keys y admins (scripts)

No hay endpoints para crear juegos ni admins: se hace con scripts en `/scripts` que se
corren a mano con acceso a la base de datos (S-19). Se ejecutan desde `/api` con
`npm run <script> -- <opciones>`.

**Reglas de todos los scripts:**
- Antes de escribir imprimen el host y el **nombre de la base de datos** (`MONGODB_DB`), **sin credenciales**.
- Si la URI no es local (`localhost`, `127.0.0.1`, `::1`), exigen `--confirmar`.
- Ningún secreto en los logs (contraseñas, URI completa, API keys); los mensajes de error
  se censuran. La API key se muestra **una sola vez**.

| Script                   | Qué hace                                                                                                      |
|--------------------------|---------------------------------------------------------------------------------------------------------------|
| `crear-admin [--juegos s1,s2]` | Crea el primer admin con `ADMIN_EMAIL`, `ADMIN_PASSWORD` (mín. 12 caracteres) y `ADMIN_NOMBRE` del `.env`; la contraseña nunca se pasa por línea de comandos. Hashea con bcrypt (12 rondas). Sin `--juegos`, acceso a todos los juegos existentes (S-32). No hace nada si el email ya existe. |
| `crear-juego --juego <slug> [--version x.y.z] [--sin-acceso]` | Crea un juego con su catálogo constante (`la-casa-del-bosque` §5.1 o `faro-nocturno-demo` §5.2) y su `logoUrl` si la definición lo trae (si el juego ya existe, no lo recrea: solo completa `logoUrl` cuando le falta, sin pisar un valor). Muestra el `juegoId` y la API key **una sola vez**. Por defecto agrega el juego a `juegosPermitidos` de todos los admins activos (S-32). No sobrescribe un juego existente. |
| `actualizar-juego --juego <slug> [--logo-url <ruta>]` | Modifica **solo** los campos pedidos de un juego existente (hoy: `logoUrl`), con la misma validación que la API (ruta `/logos/<slug>/logo.png` del propio juego o URL `https`). No toca catálogo, API key ni datos; si el valor ya es el mismo, no escribe. Detecta la ruta que Git Bash convierte (`C:/Program Files/Git/logos/…`) y sugiere `MSYS_NO_PATHCONV=1`. |
| `rotar-api-key --juego <slug>`   | Genera una key nueva, reemplaza el hash (la anterior deja de servir al instante) y la muestra una sola vez. También rehabilita un juego revocado. |
| `revocar-api-key --juego <slug>` | Pone `apiKeyHash: null`. El juego deja de poder mandar datos; los datos guardados se conservan.               |
| `seed-datos [--semilla n] [--jugadores n] [--referencia AAAA-MM-DD]` | Datos de prueba realistas para La Casa del Bosque (300 jugadores por defecto) y Faro Nocturno (demo) (la mitad), todos con `origen: "seed"` (ver "seed-datos" abajo). |
| `imagenes-niveles`       | Regenera las imágenes provisionales de los niveles en `dashboard/public/niveles/` (no toca la base). |
| `prueba-carga [--duracion s] [--conexiones n] [--lote n]` | Prueba de carga con autocannon (S-31): levanta la API en el mismo proceso contra una base aparte (`MONGODB_DB`, por defecto `xolos_carga`), crea un juego y un admin de prueba, mide ingesta (`POST /eventos` en lotes) y lectura (`GET /estadisticas/:id/embudo`) y **borra la base al terminar**. Se niega a correr si `MONGODB_DB` es `xolos_analytics`. Límites altos con `RATE_LIMIT_INGESTA_IP`/`RATE_LIMIT_INGESTA_KEY` para medir capacidad. |
| `limpiar-seed [--juego <slug>]` | Borra todo lo que tenga `origen: "seed"` (y los logros de esos jugadores); con `--juego`, solo de ese juego. Muestra cuántos documentos eliminó por colección. |

**API key:**
- Formato: prefijo `ak_` + 32 bytes aleatorios en base64url (generados con `crypto.randomBytes`).
- Se guarda solo su **SHA-256** en `juegos.apiKeyHash`. Al recibir una petición, la API
  calcula el SHA-256 de la key recibida y la busca por ese índice. (Se usa SHA-256 y no
  bcrypt porque la key es aleatoria y larga, y así se puede buscar por índice; S-19.)
- La key en claro no se guarda en ningún lado del sistema. Si se pierde, se rota.
- Cada juego tiene su propia key: revocar una no afecta a los demás.

### seed-datos (etapa 6)

- **Determinista:** misma `--semilla` (por defecto 42) y misma `--referencia` (por defecto la
  medianoche UTC de hoy) producen exactamente los mismos documentos (incluidos `eventoId`,
  `playerId` y `sessionId`). Los datos cubren los **14 días anteriores** a la referencia.
- **Idempotente:** antes de insertar borra el seed anterior de cada juego (como `limpiar-seed
  --juego`). Nunca toca datos con `origen: "real"` ni la API key de un juego existente.
- **Directo a la base** (sin HTTP), con los mismos tipos y campos que acepta la ingesta
  (`eventoId`, `secuencia`, `timestamp`, `recibidoEn`…); un test pasa cada evento generado por
  `validarEvento`. Las sesiones llevan `inicio`, `fin` (null si hubo crash), `ultimoEventoEn` y
  `ultimoRecibidoEn` (R-34); los logros obtenidos se insertan una vez por jugador.
- **Forma realista** (perfiles en `api/src/seed/perfiles.ts`, comprobada por tests):
  - Embudo de La Casa del Bosque ≈ 100 % → 70 % → 45 % → 30 % terminan; Faro ≈ 100 → 72 → 52 → 38 → 27 %.
  - Muertes concentradas en 2–3 zonas por nivel (≈ 90 % cerca de una zona, 10 % dispersas).
  - ≈ 10 % de sesiones con crash (sin `sesion_fin`; a veces con `error` fatal); el 75 % de
    esos jugadores reabre el juego y retoma el nivel.
  - Dos builds: 1.0.0 (primera semana) y 1.0.1 (segunda semana), con la 1.0.1 mejor
    (menos muertes y más jugadores que terminan).
  - Plataformas variadas (windows, android, webgl, macos, linux, ios) y hora del día con más
    juego por la tarde/noche.
  - Duración de sesión con mediana cercana a `duracionEsperadaMs` y cola larga (lognormal).
- Imprime el host y la base, exige `--confirmar` si la URI no es local y al final muestra el
  resumen por juego (insertados, embudo, crashes, mediana, builds).

---

## 9. Errores

Formato uniforme:

```json
{ "error": { "codigo": "VALIDACION_FALLIDA", "mensaje": "…", "detalles": [] } }
```

### 9.1 Errores de toda la petición

| HTTP | `codigo`                   | Cuándo                                                       |
|:----:|----------------------------|--------------------------------------------------------------|
| 400  | `VALIDACION_FALLIDA`       | Body o query mal formados (JSON roto, no es objeto/arreglo, lote vacío, campo inválido en `/sesiones`, filtro inválido). |
| 400  | `LOTE_DEMASIADO_GRANDE`    | Más de 100 eventos (S-04).                                   |
| 401  | `API_KEY_INVALIDA`         | Falta la `X-Api-Key`, no existe, fue revocada o el juego está inactivo. |
| 401  | `NO_AUTENTICADO`           | Falta el JWT, es inválido o expiró.                          |
| 401  | `CREDENCIALES_INVALIDAS`   | Login con email o contraseña incorrectos.                    |
| 400  | `INVITACION_INVALIDA`      | Enlace de invitación inexistente, vencido, usado, invalidado o de cuenta desactivada (mismo error en todos los casos). |
| 403  | `SIN_PERMISO`              | El usuario no tiene ese juego en `juegosPermitidos`; un invitado en una acción de admin; un admin que asigna un juego que no tiene o actúa sobre sí mismo. |
| 403  | `JUEGO_NO_COINCIDE`        | En `/sesiones`, `juegoId` distinto al de la key (S-01).      |
| 404  | `JUEGO_NO_ENCONTRADO`      | `:juegoId` no existe.                                        |
| 404  | `JUGADOR_NO_ENCONTRADO`    | Borrado de un `playerId` que no existe.                      |
| 404  | `INVITADO_NO_ENCONTRADO`   | `/invitados/:email` de un correo que no es de un invitado.   |
| 409  | `CORREO_YA_REGISTRADO`     | Invitar un correo que ya tiene cuenta.                       |
| 409  | `INVITADO_DESACTIVADO`     | Restablecer el enlace de un invitado desactivado.            |
| 404  | `RUTA_NO_ENCONTRADA`       | La ruta o el método no existen.                              |
| 413  | `PAYLOAD_DEMASIADO_GRANDE` | Body mayor a 100 KB (S-04, S-11).                            |
| 429  | `LIMITE_EXCEDIDO`          | Rate limit (sección 1.5).                                    |
| 500  | `DASHBOARD_URL_NO_CONFIGURADA` | En producción, invitar o restablecer sin `DASHBOARD_URL` (o con localhost). No se crea nada. |
| 500  | `ERROR_INTERNO`            | Error inesperado. El mensaje es genérico; el detalle solo va al log del servidor. |

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
| 10.1  | Sesiones y duración            | `sesiones` (`inicio`, `fin`, `ultimoEventoEn`, `ultimoRecibidoEn`) |
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
Sobre `sesiones`. Compara contra `catalogo.duracionEsperadaMs`. Las etapas de "sesión
terminada y su duración" están implementadas en `api/src/estadisticas/duracionSesiones.ts`
(`etapasSesionesTerminadas`) y las reutilizan 10.1, 10.8 y 10.12. El rango de fechas se
aplica sobre `inicio` (reloj del cliente, como el resto de las métricas).

```js
const limite = new Date(Date.now() - 30 * 60 * 1000); // S-05, reloj del servidor
db.sesiones.aggregate([
  { $match: { juegoId, inicio: { $gte: desde, $lt: hasta }, buildVersion, plataforma } },
  // etapasSesionesTerminadas(ahora):
  { $match: { inicio: { $ne: null }, ultimoEventoEn: { $ne: null } } },                    // sin inicio o sin eventos: fuera
  { $match: { $or: [ { fin: { $ne: null } }, { ultimoRecibidoEn: { $lt: limite } } ] } },   // ¿terminó? (servidor)
  { $addFields: {
      finInferido: { $eq: ["$fin", null] },
      duracionMs: { $subtract: [ { $ifNull: ["$fin", "$ultimoEventoEn"] }, "$inicio" ] } } }, // ¿cuánto duró? (cliente)
  { $match: { duracionMs: { $gte: 0 } } },
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
- `promedioMs` y `medianaMs`: enteros en ms, `null` si no hay sesiones terminadas.
- `distribucion`: siempre los 9 grupos (`desdeMs` = 0, 5, 10, 15, 20, 25, 30, 45 y 60 min), con
  0 en los vacíos; el último incluye todo lo que dura 60 min o más.

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
`datos`: un elemento por nivel del catálogo, en su `orden`: `{ nivelId, completado: {intentos, promedioMs, medianaMs}, muerte: {…}, abandono: {…} }`; un resultado sin intentos da `{ intentos: 0, promedioMs: null, medianaMs: null }`.
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
`datos`: `[{ paso: "casa_abandonada", jugadores, porcentaje }, …, { paso: "terminaron", jugadores, porcentaje }]`: un paso por nivel del catálogo (en su `orden`, aunque tenga 0) más `terminaron`. `porcentaje` = respecto al primer paso, 0–100 con un decimal (0 si el primero es 0).

### 10.4 Muertes por nivel y causa

```js
db.eventos.aggregate([
  { $match: { ...F, tipo: "muerte" } },
  { $group: { _id: { nivelId: "$data.nivelId", causa: "$data.causa" }, muertes: { $sum: 1 },
              jugadores: { $addToSet: "$playerId" } } },
  { $project: { muertes: 1, jugadores: { $size: "$jugadores" } } }
])
```
`datos`: `[{ nivelId, causa, muertes, jugadores, muertesPorJugador }]`, solo combinaciones con muertes, ordenadas por `orden` del nivel y por la posición de la causa en el catálogo (para asignar colores estables). `jugadores` = jugadores distintos que murieron así; `muertesPorJugador` = muertes ÷ jugadores, con dos decimales.

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
`datos`: un elemento por cada logro del catálogo, en su orden (aunque nadie lo tenga):
`[{ logroId, nombre, jugadores, porcentaje }]`; `porcentaje` 0–100 con un decimal.

#### Implementación, precisión y rendimiento (etapa 7)

- Código: `api/src/estadisticas/imprescindibles.ts` (10.1–10.5), con los filtros de
  `contexto.ts` (`filtroEventos` = F, `filtroSesiones`) y la ruta genérica
  `api/src/rutas/estadisticas.ts`. Las sesiones terminadas usan `etapasSesionesTerminadas` (R-34).
- **Medianas:** `$median` con `method: "approximate"`. En MongoDB 7.0 devuelve la **mediana
  inferior exacta** (el elemento en la posición ⌈n/2⌉) hasta ~1000 valores por grupo; por
  encima usa t-digest (error medido: 0.004 % con 5000 valores).
- **Tests de valores exactos:** un "oráculo" en JS plano (`api/tests/estadisticas/oraculo.ts`)
  calcula cada métrica desde los documentos del seed (semilla fija) sin MongoDB; cada endpoint
  debe coincidir exactamente, con y sin filtros, para los dos catálogos y en casos borde.
- **`explain()` con el seed completo** (300 + 150 jugadores, ~9 500 eventos, MongoDB 7.0.43
  local): ninguna consulta hace `COLLSCAN`; todas usan `IXSCAN` (eventos: `{ juegoId, tipo,
  timestamp }` o `{ juegoId, tipo, buildVersion }`; sesiones: `{ juegoId, inicio }` o
  `{ juegoId, buildVersion, plataforma }`); docs examinados ≈ claves examinadas; la más lenta
  tardó 21 ms en el servidor (embudo sin filtros).
- **Tiempo por HTTP** (API local, 20 peticiones después de una en frío, mediana / máximo):

  | Endpoint | Filtros | 1.ª | Mediana | Máximo |
  |---|---|---:|---:|---:|
  | sesiones | — | 19.8 ms | 10.5 ms | 15.3 ms |
  | tiempo-nivel | — | 12.2 ms | 12.5 ms | 14.6 ms |
  | embudo | — | 16.8 ms | 16.3 ms | 17.5 ms |
  | muertes | — | 8.9 ms | 9.7 ms | 11.7 ms |
  | logros | — | 10.8 ms | 10.3 ms | 11.6 ms |
  | embudo | build + plataforma | 16.8 ms | 10.4 ms | 15.4 ms |
  | sesiones | rango 3 días | 7.7 ms | 7.6 ms | 8.8 ms |

  | mapa-calor | `nivelId=casa_abandonada` | 26.7 ms | 12.0 ms | 18.1 ms |
  | mapa-calor | `nivelId=habitacion_llamas&celda=5` | 9.8 ms | 9.7 ms | 12.0 ms |
  | reintentos | — | 22.4 ms | 19.4 ms | 24.8 ms |
  | reintentos | `buildVersion=1.0.1` | 15.0 ms | 14.0 ms | 17.4 ms |

  Con Atlas M0 y Render hay que sumar la latencia de red (y el arranque en frío del plan gratuito).

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
`datos`: `{ nivelId, imagenUrl, limites, celda, totalMuertes, celdas: [{ x: cx*celda, y: cy*celda, causa, muertes }] }`.
- `nivelId` obligatorio y del catálogo del juego (si no, `400 VALIDACION_FALLIDA`); `celda` > 0 y ≤ 1000 (default 1).
- `x`, `y` = esquina inferior izquierda de la celda en unidades de mundo (puede ser negativa si
  el juego mandó coordenadas fuera de los límites); una entrada por celda **y causa**, ordenadas
  por x, y y posición de la causa en el catálogo. `imagenUrl` y `limites` salen del catálogo
  (`null` si faltan); `totalMuertes` = suma de `celdas`.
- `explain()` (seed completo): usa `{ juegoId, tipo, timestamp }` (o `{ juegoId, tipo,
  buildVersion }` con ese filtro) y filtra el nivel en FETCH: examina todas las muertes del juego
  (545 en La Casa del Bosque) en ≤ 10 ms. A 10x, un índice `{ juegoId, tipo, "data.nivelId" }`
  evitaría leer las muertes de otros niveles (no hace falta hoy).
El dashboard escala `x, y` con `limites` sobre la imagen del nivel en un canvas.

### 10.7 Reintentos por nivel

```js
db.eventos.aggregate([
  { $match: { ...F, tipo: { $in: ["nivel_inicio", "nivel_fin"] } } },
  { $group: { _id: { sessionId: "$sessionId", nivelId: "$data.nivelId" },
              intentos: { $max: "$data.intento" },
              completado: { $max: { $cond: [ { $eq: ["$data.resultado", "completado"] }, 1, 0 ] } } } },
  { $facet: {
      resumen: [ { $group: { _id: { nivelId: "$_id.nivelId", completado: "$completado" },
                             sesiones: { $sum: 1 },
                             promedioIntentos: { $avg: "$intentos" },
                             maxIntentos: { $max: "$intentos" } } } ],
      // grupo = índice en GRUPOS_INTENTOS = [1, 2, 4, 7] según el intento máximo
      distribucion: [ { $group: { _id: { nivelId: "$_id.nivelId", completado: "$completado",
                                         grupo: { $switch: { branches: [ /* ≥7 → 3, ≥4 → 2, ≥2 → 1 */ ], default: 0 } } },
                                  sesiones: { $sum: 1 } } } ] } }
])
```
`datos`: `[{ nivelId, pasaron: { sesiones, promedioIntentos, maxIntentos, distribucion }, seRindieron: { … } }]`: un elemento por nivel del catálogo; `promedioIntentos` con dos decimales; un grupo vacío da `{ sesiones: 0, promedioIntentos: null, maxIntentos: null, distribucion }` con los grupos en 0.
- `distribucion`: sesiones según su **intento máximo** en el nivel, siempre con los 4 grupos y en
  este orden: `[{ minimo: 1, maximo: 1, sesiones }, { minimo: 2, maximo: 3, … }, { minimo: 4,
  maximo: 6, … }, { minimo: 7, maximo: null, … }]` (`maximo: null` = sin tope). La suma de los
  grupos es igual a `sesiones`. Los límites viven en una sola constante de la API
  (`GRUPOS_INTENTOS`, S-63); los nombres de los grupos ("pasada limpia", "fricción alta"…) los
  pone el dashboard.
- "Pasaron" = la sesión tuvo un `nivel_fin` `completado` de ese nivel; si no, "se rindieron"
  (incluye sesiones con crash, aunque el jugador lo complete después en otra sesión).
- `explain()` (seed completo): `IXSCAN` sobre `{ juegoId, tipo, timestamp }` (o `{ juegoId, tipo,
  buildVersion }`), 2 323 eventos en 13 ms.

### 10.8 Abandono por nivel (drop-off)

> **No implementado en la entrega 1** (R-54): el endpoint no existe (`404 RUTA_NO_ENCONTRADA`). El diseño queda documentado para la siguiente entrega.
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
  { $match: { $or: [ { "sesion.fin": { $ne: null } }, { "sesion.ultimoRecibidoEn": { $lt: limite } } ] } }, // reloj del servidor (R-34)
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

> **No implementado en la entrega 1** (R-54): el endpoint no existe (`404 RUTA_NO_ENCONTRADA`). El diseño queda documentado para la siguiente entrega.

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

> **No implementado en la entrega 1**: el endpoint no existe (`404 RUTA_NO_ENCONTRADA`). El diseño queda documentado para la siguiente entrega.

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

> **No implementado en la entrega 1** (R-54): el endpoint no existe (`404 RUTA_NO_ENCONTRADA`). El diseño queda documentado para la siguiente entrega.

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

> **No implementado en la entrega 1**: el endpoint no existe (`404 RUTA_NO_ENCONTRADA`). El diseño queda documentado para la siguiente entrega.

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
