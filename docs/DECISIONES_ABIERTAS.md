# Decisiones abiertas y supuestos

Aquí se anota lo que **no** está definido en `CLAUDE.md` o en `docs/`.

- **Abierta:** el equipo tiene que decidirla. Mientras tanto no se asume nada.
- **Supuesto:** se tomó la opción más simple para no frenar el trabajo. Se puede cambiar;
  la columna "Impacto" dice qué habría que tocar.
- **Resuelta:** ya se decidió. Se mueve a la sección 4 con la fecha y la decisión.

Última actualización: 2026-10-09

---

## 1. Abiertas (las decide el equipo)

| ID   | Decisión                                   | Qué bloquea                                                                 |
|------|--------------------------------------------|------------------------------------------------------------------------------|
| A-01 | Nombre del estudio                         | Nada técnico: se usa la variable `APP_NAME`. Solo textos visibles y README.  |
| A-02 | Rúbrica exacta del profesor (entrega 1)    | Puede cambiar prioridades de la sección 10 de `CLAUDE.md`.                   |
| A-03 | Hosting de la API: Render o Railway        | El deploy (día 4–5) y la URL del entorno "producción" en Postman.            |
| A-04 | Modo oscuro / identidad visual del estudio | `docs/DISENO_DASHBOARD.md`.                                                  |
| A-05 | Crear `docs/DISENO_DASHBOARD.md`           | **Todo el Angular.** No se escribe dashboard hasta que exista.               |
| A-06 | Logros y coleccionables de La Casa del Bosque | El catálogo del seed y las gráficas de logros. Lo define el equipo de Unity. |

---

## 2. Supuestos tomados

| ID   | Supuesto (opción actual)                                                                                       | Alternativa                                                         | Impacto si cambia                                    |
|------|----------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------|------------------------------------------------------|
| S-01 | `juegoId` es obligatorio en cada evento y debe coincidir con el juego de la `X-Api-Key`; si no, 403.          | Que la API tome el `juegoId` solo de la key y no se mande en el body. | Validación de ingesta y SDK de Unity.               |
| S-02 | El `sessionId` se obtiene con `POST /api/v1/sesiones`; luego se manda `sesion_inicio`.                          | Que `sesion_inicio` cree la sesión y la respuesta traiga el `sessionId`. | Un endpoint menos o más; flujo del SDK.           |
| S-03 | Un lote es todo o nada: si un evento es inválido, se rechaza el lote completo.                                 | Aceptación parcial (guardar los válidos, reportar los inválidos).   | Lógica de ingesta y manejo de reintentos en Unity.   |
| S-04 | Máximo 100 eventos por lote y 100 KB por body.                                                                 | Otros límites.                                                      | Solo configuración.                                  |
| S-05 | Una sesión sin eventos por 30 min se considera terminada (`finInferido: true`, fin = último evento).          | Otro umbral, o calcularlo solo al consultar.                        | Cálculo de duración de sesión.                       |
| S-06 | `timestamp` se rechaza si está a más de 24 h en el futuro o más de 7 días en el pasado.                        | Sin límite, o corregir con `recibidoEn`.                            | Validación; eventos guardados offline muy viejos.    |
| S-07 | `plataforma` ∈ `windows`, `macos`, `linux`, `webgl`, `android`, `ios`.                                         | Lista abierta o distinta.                                           | Enum de validación y filtros del dashboard.          |
| S-08 | `intento` cuenta por nivel dentro de la sesión, empieza en 1. Cada muerte cierra el intento (`nivel_fin` con `resultado: muerte`) y reaparecer abre otro. | Intento = cada vez que se entra al nivel; las muertes no lo cierran. | Tiempo por intento, reintentos y SDK de Unity.      |
| S-09 | `x`, `y` de la muerte en unidades de mundo de Unity; el catálogo guarda los límites del nivel para escalar a la imagen. | Coordenadas ya normalizadas 0–1 desde Unity.                       | Mapa de calor y catálogo de niveles.                 |
| S-10 | IDs de catálogo en `snake_case` (`casa_abandonada`, `habitacion_llamas`, `hospital_cuarto`; causas `fantasma`, `lava`, `caida`). `juegoId` = slug del juego. | Otros nombres; `juegoId` como UUID.                                  | Seed, catálogo y SDK de Unity.                       |
| S-11 | Se usa **413** para body demasiado grande, aunque §6 de `CLAUDE.md` no lo lista.                               | Responder 400.                                                      | Un código de estado.                                 |
| S-12 | Sin `eventoId` para deduplicar: si Unity reenvía un lote, puede haber duplicados.                              | Agregar `eventoId` (UUID) al esquema e índice único.                | Esquema de evento (sería `versionEsquema: 2`) y SDK. |
| S-13 | El JWT del admin expira en 8 h.                                                                                | Otra duración; refresh token.                                       | Solo configuración.                                  |
| S-14 | Rate limit de ingesta: 60 peticiones/min por API key.                                                          | Otro límite; por IP.                                                | Solo configuración.                                  |
| S-15 | La cola offline (guardar eventos sin red y reenviarlos) es responsabilidad del SDK de Unity (entrega 2).       | Que la API ofrezca algo específico para eso.                        | Ninguno en esta entrega.                             |

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

_(Vacío por ahora.)_

| ID | Decisión | Fecha | Quién |
|----|----------|-------|-------|
