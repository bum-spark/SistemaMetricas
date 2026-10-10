# Esquema de eventos

> **Estado:** borrador de diseño, pendiente de aprobación. Aún no hay código.
> **Versión del esquema:** `versionEsquema: 1`
>
> Este documento es el contrato entre los juegos (cliente Unity) y la API de métricas.
> Tiene que coincidir con lo que la API implementa; si cambia la implementación, se
> actualiza aquí en el mismo commit.
>
> Lo que no viene de `CLAUDE.md` está marcado como **supuesto (S-xx)** y explicado en
> [`DECISIONES_ABIERTAS.md`](./DECISIONES_ABIERTAS.md).

---

## 1. Flujo de ingesta

```
Unity                                         API (/api/v1)
  │  POST /sesiones   (X-Api-Key)                 │
  │ ────────────────────────────────────────────▶ │  crea la sesión y genera sessionId (UUID v4)
  │ ◀──────────────────────────── 201 {sessionId} │
  │  POST /eventos  [sesion_inicio, nivel_inicio…] │
  │ ────────────────────────────────────────────▶ │  valida, agrega recibidoEn, guarda
  │ ◀──────────────────────────── 201 {aceptados} │
  │  …                                             │
  │  POST /eventos  [nivel_fin, sesion_fin]        │
  │ ────────────────────────────────────────────▶ │
```

- **Autenticación:** todas las peticiones de ingesta llevan el header `X-Api-Key`. La key
  identifica al juego. El campo `juegoId` del body es obligatorio y **debe coincidir** con
  el juego de la key; si no, la API responde `403 JUEGO_NO_COINCIDE` (S-01).
- **Sesión:** al arrancar el juego, el cliente llama `POST /api/v1/sesiones` con
  `juegoId`, `playerId`, `buildVersion` y `plataforma`. La API genera un `sessionId` nuevo
  y lo devuelve. Después el cliente manda el evento `sesion_inicio` con ese `sessionId` (S-02).
  Si el jugador es nuevo (`juegoId + playerId` no existe), se crea con `primeraVez`.
- **Lotes:** `POST /api/v1/eventos` acepta **un evento (objeto)** o **un arreglo de eventos**.
  - El lote es **todo o nada**: si un evento falla la validación, no se guarda ninguno y la
    respuesta indica cuáles fallaron en `detalles` (S-03).
  - Máximo **100 eventos** por petición y **100 KB** de body (S-04).
- **Fin de sesión inferido:** si una sesión no recibe `sesion_fin` (crash o cierre forzado),
  su fin es el `timestamp` del último evento recibido y la sesión queda con
  `finInferido: true`. Una sesión se considera abandonada después de **30 minutos** sin
  eventos (S-05).

---

## 2. Campos comunes (todos los eventos)

| Campo            | Tipo                  | Oblig. | Validación                                                                                   |
|------------------|-----------------------|:------:|----------------------------------------------------------------------------------------------|
| `juegoId`        | string                | sí     | Debe coincidir con el juego de la `X-Api-Key` (S-01).                                        |
| `playerId`       | string (UUID v4)      | sí     | UUID v4 válido, generado por el cliente (PlayerPrefs en Unity).                              |
| `sessionId`      | string (UUID v4)      | sí     | Debe existir y pertenecer al mismo `juegoId + playerId`.                                     |
| `timestamp`      | string (ISO 8601 UTC) | sí     | Formato `YYYY-MM-DDTHH:mm:ss.sssZ`. Se rechaza si está a más de 24 h en el futuro o más de 7 días en el pasado (S-06). |
| `buildVersion`   | string                | sí     | 1–32 caracteres. Se sugiere semver (`1.0.3`).                                                |
| `plataforma`     | string (enum)         | sí     | `windows`, `macos`, `linux`, `webgl`, `android`, `ios` (S-07).                               |
| `tipo`           | string                | sí     | Debe estar registrado en el catálogo del juego; si no, `400 TIPO_NO_REGISTRADO`.             |
| `data`           | objeto                | sí     | Puede ser `{}`. Su contenido se valida según `tipo` (sección 3 y 4).                         |
| `versionEsquema` | entero                | sí     | Por ahora solo `1`.                                                                          |

**Campo que agrega el servidor:** `recibidoEn` (ISO 8601 UTC, hora del servidor). El cliente
no lo manda; si lo manda, se rechaza.

**Reglas generales**

- Validación estricta: cualquier campo no listado (en el evento o dentro de `data`) se rechaza.
- **Ningún dato personal**: nada de nombre, correo ni texto libre del jugador. La IP no se guarda.
- Duraciones siempre en **milisegundos** (`...Ms`), enteros ≥ 0.
- IDs de catálogo (`nivelId`, `logroId`, `causa`, etc.) en `snake_case` y deben existir en el
  catálogo del juego.

---

## 3. Eventos genéricos (cualquier juego)

### `sesion_inicio`
Se manda justo después de obtener el `sessionId`.
`data`: `{}`

### `sesion_fin`
Cierre normal del juego.

| Campo    | Tipo   | Oblig. | Valores                       |
|----------|--------|:------:|-------------------------------|
| `motivo` | string | sí     | `cierre_normal`, `menu_salir` |

La duración de la sesión la calcula la API (`sesion_fin.timestamp − sesion_inicio.timestamp`).

### `nivel_inicio`
Empieza un intento de un nivel.

| Campo     | Tipo    | Oblig. | Notas                                              |
|-----------|---------|:------:|----------------------------------------------------|
| `nivelId` | string  | sí     | Del catálogo.                                      |
| `intento` | entero  | sí     | ≥ 1. Contador por nivel dentro de la sesión (S-08).|

### `nivel_fin`
Termina un intento. **Cada muerte cierra el intento** y el reaparecer abre uno nuevo con
`intento + 1` (S-08).

| Campo        | Tipo   | Oblig. | Valores / notas                         |
|--------------|--------|:------:|-----------------------------------------|
| `nivelId`    | string | sí     | Del catálogo.                           |
| `intento`    | entero | sí     | Igual al del `nivel_inicio`.            |
| `resultado`  | string | sí     | `completado`, `muerte`, `abandono`      |
| `duracionMs` | entero | sí     | Tiempo del intento.                     |

### `muerte`

| Campo     | Tipo   | Oblig. | Notas                                                         |
|-----------|--------|:------:|---------------------------------------------------------------|
| `nivelId` | string | sí     | Del catálogo.                                                 |
| `intento` | entero | sí     | Intento en el que murió.                                      |
| `causa`   | string | sí     | Del catálogo de causas del juego (ej. `fantasma`, `lava`).    |
| `x`       | número | sí     | Posición en unidades de mundo de Unity (S-09).                |
| `y`       | número | sí     | Posición en unidades de mundo de Unity (S-09).                |

### `logro`

| Campo     | Tipo   | Oblig. | Notas          |
|-----------|--------|:------:|----------------|
| `logroId` | string | sí     | Del catálogo.  |

Un mismo logro solo cuenta una vez por `juegoId + playerId`; los repetidos se aceptan pero
no suman al porcentaje.

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

| Campo     | Tipo    | Oblig. | Notas                                              |
|-----------|---------|:------:|----------------------------------------------------|
| `codigo`  | string  | sí     | Identificador corto del error.                     |
| `mensaje` | string  | sí     | Máx. 500 caracteres. Sin datos personales ni rutas de usuario. |
| `fatal`   | boolean | sí     | `true` si provocó el cierre (crash).               |

### `rendimiento`

| Campo           | Tipo   | Oblig. | Notas                         |
|-----------------|--------|:------:|-------------------------------|
| `fpsPromedio`   | número | sí     | Promedio del periodo medido.  |
| `tiempoCargaMs` | entero | no     | Si se mide una carga.         |
| `nivelId`       | string | no     |                               |

---

## 4. Eventos específicos de "La Casa del Bosque"

Solo son válidos para los juegos que los tengan registrados en su catálogo.

### `flor_recogida`
Se recoge la flor que permite pasar de nivel.

| Campo        | Tipo   | Oblig. | Notas                                 |
|--------------|--------|:------:|---------------------------------------|
| `nivelId`    | string | sí     |                                       |
| `duracionMs` | entero | sí     | Tiempo desde el `nivel_inicio`.       |

### `dialogo_saltado`

| Campo       | Tipo   | Oblig. |
|-------------|--------|:------:|
| `dialogoId` | string | sí     |
| `nivelId`   | string | sí     |

### `coleccionable_encontrado`

| Campo             | Tipo   | Oblig. | Notas         |
|-------------------|--------|:------:|---------------|
| `coleccionableId` | string | sí     | Del catálogo. |
| `nivelId`         | string | sí     |               |

### `tutorial_completado`

| Campo        | Tipo   | Oblig. | Notas                            |
|--------------|--------|:------:|----------------------------------|
| `duracionMs` | entero | sí     | Tiempo en completar el tutorial. |

---

## 5. Catálogo por juego

El catálogo vive en la base de datos (no en Angular) y define qué acepta la API y qué
muestra el dashboard. Un segundo juego solo necesita su propio catálogo.

| Sección           | Contenido                                                                  |
|-------------------|----------------------------------------------------------------------------|
| `tiposEvento`     | Lista de `tipo` permitidos (genéricos + específicos).                      |
| `niveles`         | `nivelId`, `nombre`, `orden`, `imagenUrl`, límites del mundo `{minX, maxX, minY, maxY}` para el mapa de calor (S-09). |
| `causasMuerte`    | `causa`, `nombre`.                                                         |
| `logros`          | `logroId`, `nombre`, `descripcion`.                                        |
| `coleccionables`  | `coleccionableId`, `nivelId`, `nombre` (para encontrados vs disponibles). |

**Propuesta para La Casa del Bosque (S-10):**

| Nivel (`orden`) | `nivelId`           | Nombre                |
|:---------------:|---------------------|-----------------------|
| 1               | `casa_abandonada`   | Casa abandonada       |
| 2               | `habitacion_llamas` | Habitación en llamas  |
| 3               | `hospital_cuarto`   | Cuarto de hospital    |

Causas de muerte: `fantasma`, `lava`, `caida`.
Logros y coleccionables: pendientes de que el equipo de Unity los defina.

---

## 6. Errores de ingesta

Formato uniforme:

```json
{
  "error": {
    "codigo": "VALIDACION_FALLIDA",
    "mensaje": "El lote tiene 1 evento inválido.",
    "detalles": [
      { "indice": 2, "campo": "data.causa", "mensaje": "La causa 'agua' no está en el catálogo." }
    ]
  }
}
```

| HTTP | `codigo`                   | Cuándo                                                     |
|:----:|----------------------------|------------------------------------------------------------|
| 400  | `VALIDACION_FALLIDA`       | Falta un campo, tipo incorrecto, campo desconocido.        |
| 400  | `TIPO_NO_REGISTRADO`       | `tipo` no está en el catálogo del juego.                   |
| 400  | `LOTE_DEMASIADO_GRANDE`    | Más de 100 eventos (S-04).                                 |
| 401  | `API_KEY_INVALIDA`         | Falta la `X-Api-Key`, no existe o fue revocada.            |
| 403  | `JUEGO_NO_COINCIDE`        | `juegoId` distinto al de la key (S-01).                    |
| 404  | `SESION_NO_ENCONTRADA`     | `sessionId` no existe para ese jugador y juego.            |
| 413  | `PAYLOAD_DEMASIADO_GRANDE` | Body mayor a 100 KB (S-04, S-11).                          |
| 429  | `LIMITE_EXCEDIDO`          | Rate limit (S-14).                                         |

Respuesta exitosa: `201 { "aceptados": <n> }`.

---

## 7. Qué eventos alimentan cada métrica

| Métrica (CLAUDE.md §8)              | Eventos y campos                                                                          |
|-------------------------------------|-------------------------------------------------------------------------------------------|
| Sesiones y duración                 | `sesion_inicio`, `sesion_fin` (o último evento si `finInferido`).                         |
| Tiempo por nivel (por intento)      | `nivel_fin.duracionMs` agrupado por `nivelId` e `intento`.                                |
| Embudo de progresión                | Jugadores con `nivel_inicio` de cada nivel (por `orden`) y `nivel_fin` `completado` del último. |
| Muertes por nivel y causa           | `muerte.nivelId`, `muerte.causa`.                                                         |
| Logros (% de jugadores)             | `logro.logroId` únicos por jugador ÷ jugadores del juego.                                 |
| Mapa de calor de muertes            | `muerte.x`, `muerte.y` + límites del nivel en el catálogo.                                |
| Reintentos por nivel                | `max(intento)` por sesión y nivel.                                                        |
| Abandono por nivel (drop-off)       | Último `nivel_inicio` de la sesión sin `nivel_fin` `completado`.                          |
| Completado del tutorial             | Sesiones/jugadores con `tutorial_completado` ÷ total.                                     |
| Versión del build y plataforma      | `buildVersion`, `plataforma` (campos comunes, sirven de filtro en todo).                  |
| Proxies de atención                 | `inactividad`, `pausa`, `dialogo_saltado`, `coleccionable_encontrado` vs catálogo.        |
| Rendimiento                         | `rendimiento.fpsPromedio`, `rendimiento.tiempoCargaMs`, `error` con `fatal: true`.        |

---

## 8. Almacenamiento (diseño)

Una sola base de datos. Colecciones relacionadas con la ingesta: `juegos`, `jugadores`,
`sesiones`, `eventos`, `logros` (logros obtenidos por jugador).

Índices propuestos para `eventos`:

- `{ juegoId: 1, tipo: 1, timestamp: 1 }` — consultas por tipo y rango de fechas.
- `{ juegoId: 1, sessionId: 1, timestamp: 1 }` — reconstruir una sesión, abandono.
- `{ juegoId: 1, playerId: 1 }` — borrar los datos de un jugador.
- `{ juegoId: 1, buildVersion: 1 }` — filtro por versión.

**Borrado de un jugador:** el endpoint de privacidad elimina todos los documentos de
`jugadores`, `sesiones`, `eventos` y `logros` con ese `juegoId + playerId`.

---

## 9. Ejemplo completo (un lote)

Partida corta: inicia, muere una vez con un fantasma, recoge la flor y cierra.
(Antes, `POST /api/v1/sesiones` devolvió el `sessionId`.)

```json
[
  {
    "juegoId": "la-casa-del-bosque",
    "playerId": "3f1c9a2e-7b4d-4e8a-9c1f-2d6b8e0a5f71",
    "sessionId": "b7e2d4c1-0a9f-4b3e-8d2c-6f1a5e9b3c08",
    "timestamp": "2026-10-12T18:00:00.000Z",
    "buildVersion": "1.0.0",
    "plataforma": "windows",
    "tipo": "sesion_inicio",
    "data": {},
    "versionEsquema": 1
  },
  {
    "juegoId": "la-casa-del-bosque",
    "playerId": "3f1c9a2e-7b4d-4e8a-9c1f-2d6b8e0a5f71",
    "sessionId": "b7e2d4c1-0a9f-4b3e-8d2c-6f1a5e9b3c08",
    "timestamp": "2026-10-12T18:00:05.000Z",
    "buildVersion": "1.0.0",
    "plataforma": "windows",
    "tipo": "nivel_inicio",
    "data": { "nivelId": "casa_abandonada", "intento": 1 },
    "versionEsquema": 1
  },
  {
    "juegoId": "la-casa-del-bosque",
    "playerId": "3f1c9a2e-7b4d-4e8a-9c1f-2d6b8e0a5f71",
    "sessionId": "b7e2d4c1-0a9f-4b3e-8d2c-6f1a5e9b3c08",
    "timestamp": "2026-10-12T18:01:40.000Z",
    "buildVersion": "1.0.0",
    "plataforma": "windows",
    "tipo": "muerte",
    "data": { "nivelId": "casa_abandonada", "intento": 1, "causa": "fantasma", "x": 12.5, "y": -3.2 },
    "versionEsquema": 1
  },
  {
    "juegoId": "la-casa-del-bosque",
    "playerId": "3f1c9a2e-7b4d-4e8a-9c1f-2d6b8e0a5f71",
    "sessionId": "b7e2d4c1-0a9f-4b3e-8d2c-6f1a5e9b3c08",
    "timestamp": "2026-10-12T18:01:40.000Z",
    "buildVersion": "1.0.0",
    "plataforma": "windows",
    "tipo": "nivel_fin",
    "data": { "nivelId": "casa_abandonada", "intento": 1, "resultado": "muerte", "duracionMs": 95000 },
    "versionEsquema": 1
  },
  {
    "juegoId": "la-casa-del-bosque",
    "playerId": "3f1c9a2e-7b4d-4e8a-9c1f-2d6b8e0a5f71",
    "sessionId": "b7e2d4c1-0a9f-4b3e-8d2c-6f1a5e9b3c08",
    "timestamp": "2026-10-12T18:01:42.000Z",
    "buildVersion": "1.0.0",
    "plataforma": "windows",
    "tipo": "nivel_inicio",
    "data": { "nivelId": "casa_abandonada", "intento": 2 },
    "versionEsquema": 1
  },
  {
    "juegoId": "la-casa-del-bosque",
    "playerId": "3f1c9a2e-7b4d-4e8a-9c1f-2d6b8e0a5f71",
    "sessionId": "b7e2d4c1-0a9f-4b3e-8d2c-6f1a5e9b3c08",
    "timestamp": "2026-10-12T18:04:12.000Z",
    "buildVersion": "1.0.0",
    "plataforma": "windows",
    "tipo": "flor_recogida",
    "data": { "nivelId": "casa_abandonada", "duracionMs": 150000 },
    "versionEsquema": 1
  },
  {
    "juegoId": "la-casa-del-bosque",
    "playerId": "3f1c9a2e-7b4d-4e8a-9c1f-2d6b8e0a5f71",
    "sessionId": "b7e2d4c1-0a9f-4b3e-8d2c-6f1a5e9b3c08",
    "timestamp": "2026-10-12T18:04:12.000Z",
    "buildVersion": "1.0.0",
    "plataforma": "windows",
    "tipo": "nivel_fin",
    "data": { "nivelId": "casa_abandonada", "intento": 2, "resultado": "completado", "duracionMs": 150000 },
    "versionEsquema": 1
  },
  {
    "juegoId": "la-casa-del-bosque",
    "playerId": "3f1c9a2e-7b4d-4e8a-9c1f-2d6b8e0a5f71",
    "sessionId": "b7e2d4c1-0a9f-4b3e-8d2c-6f1a5e9b3c08",
    "timestamp": "2026-10-12T18:04:30.000Z",
    "buildVersion": "1.0.0",
    "plataforma": "windows",
    "tipo": "sesion_fin",
    "data": { "motivo": "menu_salir" },
    "versionEsquema": 1
  }
]
```

> El valor `"la-casa-del-bosque"` de `juegoId` es ilustrativo; el formato real del
> `juegoId` está en S-10.
