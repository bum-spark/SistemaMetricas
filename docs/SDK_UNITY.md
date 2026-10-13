# SDK de métricas para Unity

Cliente C# para que un juego de Estudio Xolos mande sus eventos a la API de métricas.
Implementa el contrato de [`ESQUEMA_EVENTOS.md`](./ESQUEMA_EVENTOS.md) §1–§4: sesión con
consentimiento, eventos con `eventoId` y `secuencia`, envío por lotes y reintentos.

Código en [`sdk-unity/`](../sdk-unity):

```
sdk-unity/
  package.json                     paquete de Unity (com.estudioxolos.metricas)
  Runtime/
    EstudioXolos.Metricas.asmdef
    Nucleo/                        C# puro, sin UnityEngine (cliente, cola, reintentos, JSON)
    Unity/                         XolosMetricas (MonoBehaviour), UnityWebRequest, PlayerPrefs
  Configuracion/
    xolos-metricas.example.json    ejemplo SIN valores (se copia al juego)
  Pruebas/                         pruebas del núcleo en .NET 8 y prueba e2e contra la API local
  Verificacion/                    compila el SDK contra las DLL del editor de Unity
```

---

## 1. Instalación

1. En el proyecto de Unity: **Window → Package Manager → + → Add package from disk…** y elige
   `sdk-unity/package.json`. (También sirve copiar la carpeta `sdk-unity/Runtime` dentro de
   `Assets/`.) Requiere Unity 2021.3 o superior; se compiló contra **Unity 6000.0.45f1**.
2. No necesita paquetes extra: usa `UnityWebRequest`, `PlayerPrefs` y su propio JSON.

## 2. Configuración (la API key NO va en el código ni en el repositorio)

1. Copia `sdk-unity/Configuracion/xolos-metricas.example.json` a
   **`Assets/Resources/xolos-metricas.json`** del juego.
2. Llena los valores (los entrega `npm run crear-juego`, ver `docs/DEPLOY.md`):

   | Campo | Valor |
   |---|---|
   | `urlBase` | `http://localhost:3000/api/v1` mientras desarrollas; en tu copia local, la URL de tu API desplegada |
   | `juegoId` | el `juegoId` que mostró `crear-juego` |
   | `apiKey` | la API key que mostró `crear-juego` (se muestra una sola vez) |
   | `buildVersion` | vacío = `Application.version` (Project Settings → Player → Version) |
   | `plataforma` | vacío = se detecta (`windows`, `macos`, `linux`, `android`, `ios`, `webgl`) |
   | `tamanoLote` | 20 (eventos por lote antes de enviar) |
   | `intervaloEnvioSegundos` | 10 (envía lo acumulado aunque no llegue al tamaño) |
   | `timeoutSegundos` | 60 (la API gratuita puede tardar ~1 min en despertar) |

3. Agrega al `.gitignore` **del repositorio del juego**:
   ```
   **/Resources/xolos-metricas.json
   ```
   (Este repositorio ya ignora `xolos-metricas.json`.)

> Toda API key que viaja dentro de un juego puede extraerse del build: es inevitable en un
> cliente. Por eso cada juego tiene su propia key, revocable (`npm run rotar-api-key`), y la API
> limita peticiones por IP y por key y valida estrictamente cada evento.

## 3. Uso

### 3.1 Arranque (una sola vez)

```csharp
using EstudioXolos.Metricas.Unity;
using UnityEngine;

public class ArranqueMetricas : MonoBehaviour
{
    void Start()
    {
        // El juego muestra antes su aviso de privacidad y guarda la respuesta:
        //   XolosMetricas.EstablecerConsentimiento(true | false);
        if (XolosMetricas.Consentimiento == null)
        {
            // Mostrar el aviso; al responder: EstablecerConsentimiento(...) y luego Iniciar().
            return;
        }
        XolosMetricas.Iniciar();
    }
}
```

- `Iniciar()` pide el `sessionId` (`POST /sesiones`) y manda `sesion_inicio`. Hay que llamarlo
  en cada arranque del juego: la API genera un `sessionId` nuevo cada vez.
- Sin consentimiento (`false`) el SDK avisa a la API (no se guarda nada) y no manda eventos.
  Si se retira a mitad de partida, la cola se vacía y no se envía nada más.
- El `playerId` (UUID v4 anónimo) se crea la primera vez y se guarda en `PlayerPrefs`.
- Los eventos que ocurren mientras llega el `sessionId` se guardan y se mandan después.

### 3.2 Métodos y eventos que generan

| Método | Evento(s) | Notas |
|---|---|---|
| `NivelInicio(nivelId)` | `nivel_inicio {nivelId, intento}` | Al entrar al nivel **y al reaparecer** tras morir. El SDK lleva el `intento` (1, 2, 3…) por nivel y sesión. |
| `Muerte(nivelId, causa, posicion)` | `muerte {nivelId, intento, causa, x, y}` + `nivel_fin {resultado: "muerte", duracionMs}` | Cada muerte cierra el intento (S-08). `posicion` en unidades de mundo (`transform.position`). |
| `NivelCompletado(nivelId)` | `nivel_fin {resultado: "completado", duracionMs}` | Fuerza el envío del lote. |
| `NivelAbandonado(nivelId)` | `nivel_fin {resultado: "abandono", duracionMs}` | Salir del nivel por el menú. Fuerza el envío. |
| `Logro(logroId)` | `logro {logroId}` | La API no calcula logros: los manda el juego (R-03). |
| `PausaInicio()` / `PausaFin(nivelId)` | `pausa {duracionMs, nivelId}` | La duración la mide el SDK. |
| `Inactividad(duracionMs, nivelId)` | `inactividad {…}` | El umbral lo decide el juego. |
| `Error(codigo, mensaje, fatal)` | `error {…}` | Recorta `codigo` a 64 y `mensaje` a 500 caracteres. Sin datos personales. |
| `Rendimiento(fps, tiempoCargaMs, nivelId)` | `rendimiento {…}` | Por ejemplo al terminar cada nivel. |
| `FlorRecogida(nivelId)` | `flor_recogida {nivelId, duracionMs}` | `duracionMs` desde el `NivelInicio` del intento. |
| `TutorialCompletado(nivelId)` | `tutorial_completado {duracionMs}` | `duracionMs` desde el primer `NivelInicio` de ese nivel en la sesión (S-25). |
| `ColeccionableEncontrado(id, nivelId)` | `coleccionable_encontrado {…}` | |
| `DialogoSaltado(dialogoId, nivelId)` | `dialogo_saltado {…}` | |
| `Evento(tipo, data)` | cualquier tipo del catálogo del juego | `data` como `Dictionary<string, object>`. |
| `SalirDesdeMenu()` | `sesion_fin {motivo: "menu_salir"}` | Envía lo pendiente (máx. ~4 s) y cierra el juego. |
| (automático al cerrar) | `sesion_fin {motivo: "cierre_normal"}` | Vía `Application.wantsToQuit`: detiene el cierre, envía (máx. ~4 s) y cierra. |

Todos los eventos llevan automáticamente `eventoId` (UUID v4), `juegoId`, `playerId`,
`sessionId`, `secuencia` (1, 2, 3… por sesión), `timestamp` (UTC, `…Z`), `buildVersion`,
`plataforma` y `versionEsquema: 1`.

## 4. La Casa del Bosque: qué llamar en cada momento

IDs del catálogo en `ESQUEMA_EVENTOS.md` §5.1. Niveles en orden: `casa_abandonada` →
`hospital_cuarto` → `habitacion_llamas`; causas: `fantasma`, `lava`, `caida`.

| Momento del juego | Llamada | Lo que llega a la API |
|---|---|---|
| Arranque, con consentimiento ya dado | `XolosMetricas.Iniciar()` | `POST /sesiones` y luego `sesion_inicio {}` |
| Entra a un nivel | `NivelInicio("casa_abandonada")` | `nivel_inicio {nivelId: "casa_abandonada", intento: 1}` |
| Termina el **último aviso** del tutorial (controles flotantes: moverse → saltar → esquivar al fantasma → recoger un objeto) | `TutorialCompletado("casa_abandonada")` y `Logro("tutorial_superado")` | `tutorial_completado {duracionMs: 55000}` + `logro {logroId: "tutorial_superado"}` |
| Lo atrapa un fantasma | `Muerte("casa_abandonada", "fantasma", transform.position)` | `muerte {…, causa: "fantasma", x: 46.2, y: 6.1, intento: 1}` + `nivel_fin {resultado: "muerte", intento: 1, duracionMs}` |
| Cae a la lava / a un hueco | `Muerte(nivel, "lava" \| "caida", posición)` | igual, con esa causa |
| Reaparece tras morir | `NivelInicio(nivelActual)` | `nivel_inicio {…, intento: 2}` |
| Salta un diálogo | `DialogoSaltado("abuela_intro", nivelActual)` | `dialogo_saltado {dialogoId, nivelId}` |
| Recoge un pétalo (cuarto de hospital) | `ColeccionableEncontrado("petalo_1", "hospital_cuarto")` | `coleccionable_encontrado {coleccionableId: "petalo_1", nivelId: "hospital_cuarto"}` |
| Recoge una pieza de carta (habitación en llamas) | `ColeccionableEncontrado("carta_pieza_3", "habitacion_llamas")` | `coleccionable_encontrado {…}` |
| Ya tiene las **4** piezas de carta | `Logro("la_verdad")` | `logro {logroId: "la_verdad"}` (nombre visible "La verdad") |
| Recoge **la flor** que abre el paso | `FlorRecogida(nivelActual)` | `flor_recogida {nivelId, duracionMs}` |
| Termina el nivel | `NivelCompletado(nivelActual)` y luego `Logro("casa_abandonada_completada")` (o `hospital_cuarto_completado`, `habitacion_llamas_completada`) | `nivel_fin {resultado: "completado", intento, duracionMs}` + `logro {…}`; se envía el lote |
| Abre / cierra el menú de pausa | `PausaInicio()` / `PausaFin(nivelActual)` | `pausa {duracionMs, nivelId}` |
| Sale al menú y cierra el juego | `XolosMetricas.SalirDesdeMenu()` | `sesion_fin {motivo: "menu_salir"}` |
| Cierra la ventana | (automático) | `sesion_fin {motivo: "cierre_normal"}` |
| Crash | (nada) | sin `sesion_fin`: la API infiere el fin (R-34) |

Los pétalos no dan logro por ahora; `suelo_descubierto` sigue abierto (A-06) y no debe mandarse
hasta que esté en el catálogo (la API lo rechazaría).

## 5. Envío, lotes y reintentos

- **Cola en memoria**, FIFO, con tope de 1 000 eventos (si se llena, se descartan los más viejos).
- **Se envía un lote** (máx. 100 eventos, el límite de la API) cuando:
  - se juntan `tamanoLote` eventos (20), o
  - pasan `intervaloEnvioSegundos` (10 s) con eventos pendientes, o
  - se completa o abandona un nivel, hay un error fatal, recién se obtuvo la sesión,
    el juego pasa a segundo plano (`OnApplicationPause`) o se cierra.
- Un solo lote en vuelo a la vez. El `eventoId` y la `secuencia` se fijan al crear el evento:
  un reintento manda exactamente lo mismo y la API descarta los duplicados.

| Respuesta | Qué hace el SDK |
|---|---|
| `201` | Quita el lote de la cola. Los `rechazados` se registran como advertencia y **nunca** se reenvían. |
| Fallo de red / timeout (API dormida) | Reintenta con **espera creciente**: 2, 4, 8, 16, 32, 60, 60… s (con *jitter* 50–100 %). |
| `429` | Igual, respetando `Retry-After` si viene (máximo 60 s). |
| `5xx` | Igual que fallo de red. |
| `401` / `403` | API key inválida o revocada / juego distinto: el SDK se deshabilita y vacía la cola. |
| Otros `4xx` (`400`, `413`…) | Descarta ese lote **sin reintentar** (reenviarlo daría el mismo error). |

- La sesión (`POST /sesiones`) se reintenta igual; mientras tanto los eventos se acumulan.
- `timeoutSegundos` = 60 por petición para tolerar el arranque en frío de la API gratuita.
- Al cerrar se espera como máximo ~4 s: con la API caída el juego no se queda colgado.

## 6. JSON: por qué uno propio

| Opción | Problema |
|---|---|
| `JsonUtility` | No serializa `Dictionary` ni objetos flexibles (`data` cambia según el tipo), ni `null`. |
| `System.Text.Json` | No viene con Unity: hay que agregar DLLs/paquetes y cuidar el *stripping* de IL2CPP. |
| Newtonsoft (`com.unity.nuget.newtonsoft-json`) | Funciona, pero es un paquete extra. |

El SDK trae un escritor/lector JSON mínimo (`Nucleo/Json.cs`, ~235 líneas): sin reflexión (seguro
con IL2CPP), sin paquetes, con punto decimal siempre (`InvariantCulture`) aunque el sistema del
jugador use coma, y probado contra el validador real de la API.

## 7. Pruebas

Desde `sdk-unity/`:

```bash
# Pruebas del núcleo (fuera de Unity, .NET 8, mismo C# 9 que Unity): 22 casos
dotnet run --project Pruebas

# Partida simulada de La Casa del Bosque por HTTP contra una API LOCAL
# (juego creado con crear-juego en un MongoDB local; nunca contra producción)
dotnet run --project Pruebas -- e2e http://localhost:3000/api/v1 <juegoId> <apiKey>

# Compila el SDK completo contra las DLL del editor de Unity (sin abrir Unity)
dotnet build Verificacion/CompilarConUnity.csproj -p:UnityManaged="<Unity>/Editor/Data/Managed"
```

**Qué se probó (2026-10-12):**
- Núcleo: 22/22 pruebas — JSON (incluida cultura con coma decimal), consentimiento (sin respuesta,
  `false`, retirado a mitad), `playerId` persistente, campos comunes y `secuencia`, eventos antes del
  `sessionId`, lotes por tamaño / tiempo / cambio de nivel, máximo 100 por petición, reintentos con
  espera creciente y mismos `eventoId`, `Retry-After` en 429, 5xx, 4xx sin reintento, 401 deshabilita,
  rechazados sin reenvío, intentos y duraciones de muerte/flor/tutorial/pausa, API dormida, cierre
  con límite de tiempo, cola acotada, configuración inválida y recorte de textos.
- E2E contra la API local real (MongoDB 7.0.43): una partida de los 3 niveles → 40 eventos en 4
  lotes; la API **aceptó los 39 válidos** y rechazó el evento de prueba inválido
  (`TIPO_NO_REGISTRADO`), que el SDK **no reintentó**. En la base quedaron los 39 eventos, la sesión
  con `inicio` y `fin` y los 5 logros.
- Compilación del SDK completo (núcleo + capa de Unity) contra las DLL de **Unity 6000.0.45f1**
  con C# 9: 0 errores, 0 advertencias (advertencias tratadas como errores).

**Qué NO se pudo probar (no se ejecutó Unity):**
- El comportamiento dentro del motor: ciclo de vida del `MonoBehaviour` (`Awake`, `Update`,
  `DontDestroyOnLoad`), corrutinas de espera y continuaciones de `Task` en el hilo principal.
- `UnityWebRequest` real (timeouts, `responseCode`, `Retry-After`) — en las pruebas se usó
  `HttpClient` con el mismo contrato.
- `PlayerPrefs`, `Resources.Load` del JSON de configuración y la detección de plataforma.
- El cierre con `Application.wantsToQuit` (no se dispara al salir del modo Play del editor),
  `OnApplicationPause` en móviles y builds IL2CPP / Android / iOS.
- WebGL: no se probó y la API no tiene CORS para builds web (no está previsto).

## 8. Limitaciones conocidas

- La cola vive en memoria: si el juego se cierra sin red, lo pendiente se pierde (S-15; una cola
  persistente en disco es una mejora posible).
- La sesión se pide una vez por arranque; si el jugador retira y vuelve a dar el consentimiento
  sin reiniciar, hay que llamar `Iniciar()` otra vez.
- En el editor, salir del modo Play no manda `sesion_fin`: la sesión aparece como terminada por
  inferencia (30 min sin eventos).
