# Decisiones abiertas y supuestos

Aquí se anota lo que **no** está definido en `CLAUDE.md` o en `docs/`.

- **Abierta:** el equipo tiene que decidirla. Mientras tanto no se asume nada.
- **Supuesto:** se tomó la opción más simple para no frenar el trabajo. Se puede cambiar;
  la columna "Impacto" dice qué habría que tocar.
- **Resuelta:** ya se decidió. Está en la sección 4 con la fecha y la decisión.

Última actualización: 2026-10-10

---

## 1. Abiertas (las decide el equipo)

| ID   | Decisión                                         | Qué bloquea                                                                       |
|------|--------------------------------------------------|-----------------------------------------------------------------------------------|
| A-02 | Rúbrica exacta del profesor (entrega 1)          | Puede cambiar prioridades de la sección 10 de `CLAUDE.md`.                        |
| A-03 | Hosting de la API: Render o Railway              | El deploy (día 4–5), la URL "producción" en Postman y el valor de `trust proxy` (S-23). |
| A-04 | Modo oscuro / identidad visual del estudio       | `docs/DISENO_DASHBOARD.md`.                                                       |
| A-05 | Crear `docs/DISENO_DASHBOARD.md`                 | **Todo el Angular.** No se escribe dashboard hasta que exista.                    |
| A-06 | `suelo_descubierto`: tipo de elemento del catálogo, `nivelId` y disparador | Su entrada en el catálogo. **No está en el seed** hasta que se defina. El resto de A-06 quedó resuelto (R-02). |
| A-07 | Imagen y límites de mundo (`minX, maxX, minY, maxY`) de cada nivel | El mapa de calor. Los entrega el equipo de Unity.                   |
| A-08 | ¿El SDK reintenta también ante 429 o 5xx?        | Comportamiento del SDK. Hoy solo reintenta por fallo de red (R-06). Con `eventoId` reintentar sería seguro. |

---

## 2. Supuestos tomados

| ID   | Supuesto (opción actual)                                                                                       | Alternativa                                                         | Impacto si cambia                                    |
|------|----------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------|------------------------------------------------------|
| S-01 | `juegoId` es obligatorio en cada evento y debe coincidir con el juego de la `X-Api-Key`.                       | Que la API tome el `juegoId` solo de la key.                         | Validación de ingesta y SDK de Unity.                |
| S-02 | El `sessionId` se obtiene con `POST /api/v1/sesiones`; luego se manda `sesion_inicio`.                          | Que `sesion_inicio` cree la sesión y devuelva el `sessionId`.       | Un endpoint menos o más; flujo del SDK.              |
| S-04 | Máximo 100 eventos por lote y 100 KB por body.                                                                 | Otros límites.                                                      | Solo configuración.                                  |
| S-05 | Una sesión sin eventos por 30 min se considera terminada (fin = `ultimoEventoEn`, `finInferido`). Se calcula al consultar, no hay proceso en segundo plano. | Otro umbral; un job que cierre sesiones.                          | Cálculo de duración y abandono.                      |
| S-06 | `timestamp` se rechaza si está a más de 24 h en el futuro o más de 7 días en el pasado.                        | Sin límite, o corregir con `recibidoEn`.                            | Validación; eventos guardados offline muy viejos.    |
| S-07 | `plataforma` ∈ `windows`, `macos`, `linux`, `webgl`, `android`, `ios`.                                         | Lista abierta o distinta.                                           | Enum de validación y filtros del dashboard.          |
| S-08 | `intento` cuenta por nivel dentro de la sesión, empieza en 1. Cada muerte cierra el intento (`nivel_fin` con `resultado: muerte`) y reaparecer abre otro. | Intento = cada vez que se entra al nivel; las muertes no lo cierran. | Tiempo por intento, reintentos y SDK de Unity.      |
| S-09 | `x`, `y` de la muerte en unidades de mundo de Unity; el catálogo guarda los límites del nivel para escalar a la imagen. | Coordenadas normalizadas 0–1 desde Unity.                          | Mapa de calor y catálogo de niveles.                 |
| S-10 | `juegoId` es un UUID v4 generado al crear el juego; `slug` es aparte, legible, para URLs. IDs de catálogo en `snake_case`. | `juegoId` = slug.                                                   | Seed, SDK de Unity (config del `juegoId`).           |
| S-11 | Se usa **413** para body demasiado grande, aunque §6 de `CLAUDE.md` no lo lista.                               | Responder 400.                                                      | Un código de estado.                                 |
| S-13 | El JWT del admin expira en 8 h.                                                                                | Otra duración; refresh token.                                       | Solo configuración.                                  |
| S-14 | El rate limit por IP es de **60 peticiones/min** (el método por IP + tope por key está resuelto en R-05; solo el número es supuesto). | Otro valor.                                                         | Solo configuración.                                  |
| S-15 | La cola offline (guardar eventos sin red y reenviarlos) es responsabilidad del SDK de Unity (entrega 2).       | Que la API ofrezca algo específico.                                 | Ninguno en esta entrega.                             |
| S-16 | Con `consentimiento: false`: no se crea sesión (respuesta 200 con `sessionId: null`); si el jugador no existía no se guarda nada; si existía, solo cambia `consentimiento` a `false`, sus datos se conservan hasta borrarlos y sus eventos nuevos se rechazan con `SIN_CONSENTIMIENTO`. | Borrar automáticamente los datos anteriores al retirar el consentimiento. | Lógica de `POST /sesiones` y privacidad.            |
| S-17 | El borrado de datos de un jugador lo hace un admin (JWT); Unity no puede pedirlo directamente.                 | Endpoint de borrado con `X-Api-Key` para que el jugador lo pida desde el juego. | Un endpoint más y el SDK.                     |
| S-18 | Rate limit del login de admin: 5 intentos cada 15 min por IP.                                                  | Otro valor.                                                         | Solo configuración.                                  |
| S-19 | Juegos y admins se crean solo por scripts. API key = `ak_` + 32 bytes aleatorios (base64url), guardada como SHA-256 (no bcrypt, para poder buscarla por índice). | Endpoints de admin para crear juegos; bcrypt con prefijo de búsqueda. | Scripts y middleware de API key.                   |
| S-20 | Nombres visibles propuestos: "Tutorial superado", "Casa abandonada completada", "Cuarto de hospital completado", "Habitación en llamas completada", "Pieza de carta N", "Pétalo N" (y sus descripciones). Solo `la_verdad` tiene nombre y descripción definidos por el equipo. | Los que defina el equipo.                                           | Solo textos del seed.                                |
| S-21 | Las estadísticas sin filtros de fecha usan todo el histórico.                                                  | Últimos 30 días por defecto.                                        | Valor por defecto de los filtros.                    |
| S-22 | El porcentaje de logros se calcula sobre jugadores con al menos un evento en el rango filtrado.               | Sobre todos los jugadores registrados del juego.                    | Consulta 10.5.                                       |
| S-23 | `trust proxy` = 1 salto (un proxy delante, como en Render/Railway).                                            | Otro número de saltos según el hosting final (A-03).                | Configuración de Express; si está mal, el rate limit por IP no funciona. |
| S-24 | `dialogoId` es texto libre (1–64 caracteres), no se valida contra el catálogo.                                | Agregar los diálogos al catálogo.                                   | Catálogo y validación.                               |
| S-25 | `tutorial_completado.duracionMs` = desde el primer `nivel_inicio` de `casa_abandonada` en la sesión hasta que termina el último aviso. | Medirlo desde que aparece el primer aviso.                          | SDK de Unity.                                        |

---

## 3. Fuera de alcance (y por qué)

| Métrica / función                      | Por qué no se incluye                                                                       |
|----------------------------------------|---------------------------------------------------------------------------------------------|
| Monetización (ARPU, conversión)        | El juego es gratuito y no tiene compras; no hay nada que medir.                            |
| Adquisición (fuentes, campañas)        | No hay campañas ni tiendas con atribución; el proyecto no lo necesita.                     |
| Retención D1 / D7 / D30                | Es una experiencia lineal de ~20 min pensada para jugarse una vez; volver no es la meta.   |
| Vista comparativa entre juegos         | Solo si sobra tiempo (`CLAUDE.md` §9). Hoy hay un solo juego.                              |

---

## 4. Resueltas

| ID   | Decisión                                                                                                         | Antes      | Fecha      | Quién  |
|------|------------------------------------------------------------------------------------------------------------------|------------|------------|--------|
| R-01 | Nombre del estudio: **Estudio Xolos**. Es el valor por defecto de `APP_NAME`; en el código se sigue leyendo de `APP_NAME`. | A-01 | 2026-10-10 | Equipo |
| R-02 | Catálogo de La Casa del Bosque: niveles `casa_abandonada` → `hospital_cuarto` → `habitacion_llamas`; logros `tutorial_superado`, `casa_abandonada_completada`, `hospital_cuarto_completado`, `habitacion_llamas_completada`, `la_verdad` ("La verdad"); coleccionables `carta_pieza_1..4` (habitación en llamas, dan `la_verdad`) y `petalo_1..4` (hospital, sin logro); 4 por nivel; disparador de `tutorial_completado`; flor ≠ coleccionables. Detalle en `ESQUEMA_EVENTOS.md` §4 y §5.1. Queda abierto solo `suelo_descubierto` (A-06). | A-06 | 2026-10-10 | Equipo |
| R-03 | Los logros los manda Unity (los de completar nivel junto con `nivel_fin` `completado`; `tutorial_superado` junto con `tutorial_completado`). La API no los calcula. | — | 2026-10-10 | Equipo |
| R-04 | Lotes con **aceptación parcial**: `201 { aceptados, rechazados: [{ indice, codigo, mensaje }] }`.                 | S-03 (todo o nada) | 2026-10-10 | Equipo |
| R-05 | Rate limit **por IP** con `trust proxy` activado, más un tope de **1000 req/min por API key** (la key la comparten todos los jugadores). | S-14 (por key) | 2026-10-10 | Equipo |
| R-06 | El SDK reintenta solo por fallo de red, nunca por un rechazo.                                                     | —          | 2026-10-10 | Equipo |
| R-07 | `eventoId` (UUID v4, obligatorio) en los campos comunes, índice único `{ juegoId, eventoId }`. Un duplicado se ignora sin error y cuenta como aceptado. | S-12 (sin `eventoId`) | 2026-10-10 | Equipo |
| R-08 | `consentimiento` se recibe en `POST /sesiones` y se guarda en `jugadores`. Qué pasa si es `false`: S-16.          | —          | 2026-10-10 | Equipo |
| R-09 | Se documentan colecciones, endpoints de admin, alta de juegos/API keys por script (key hasheada, mostrada una sola vez) y la agregación de cada métrica. | — | 2026-10-10 | Equipo |
