// SDK de métricas de Estudio Xolos — núcleo sin dependencias de Unity.
// Implementa el flujo de docs/ESQUEMA_EVENTOS.md §1: sesión con consentimiento, eventos con
// eventoId y secuencia, envío por lotes (por tamaño, por tiempo y forzado al cambiar de nivel o
// cerrar) y reintentos con espera creciente solo ante fallo de red, 429 y 5xx.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Threading.Tasks;

namespace EstudioXolos.Metricas
{
    public enum EstadoCliente
    {
        SinIniciar,       // falta llamar Iniciar (o falta el consentimiento).
        IniciandoSesion,  // esperando el sessionId de la API (los eventos se acumulan).
        Activo,           // con sessionId: los eventos se envían.
        Deshabilitado,    // sin consentimiento, configuración inválida o API key rechazada.
        Cerrado,          // se mandó sesion_fin.
    }

    public enum ResultadoEnvio { NadaQueEnviar, Enviado, ReintentarDespues, Descartado, Deshabilitado }

    public sealed class ClienteMetricas
    {
        public const string ClaveJugador = "xolos.metricas.playerId";
        public const string ClaveConsentimiento = "xolos.metricas.consentimiento";
        private const int MaxCodigoError = 64;
        private const int MaxMensajeError = 500;

        private readonly ConfiguracionMetricas config;
        private readonly ITransporte transporte;
        private readonly IAlmacen almacen;
        private readonly IReloj reloj;
        private readonly IRegistro registro;
        private readonly Random azar;
        private readonly ColaEventos cola;

        private int secuencia;
        private readonly Dictionary<string, int> intentoPorNivel = new Dictionary<string, int>();
        private readonly Dictionary<string, DateTime> inicioIntentoPorNivel = new Dictionary<string, DateTime>();
        private readonly Dictionary<string, DateTime> primerInicioPorNivel = new Dictionary<string, DateTime>();
        private DateTime? inicioPausa;

        private bool enviando;
        private bool forzarEnvio;
        private int reintentosEnvio;
        private DateTime proximoIntento = DateTime.MinValue;
        private DateTime ultimoEnvio;

        public ClienteMetricas(ConfiguracionMetricas config, ITransporte transporte, IAlmacen almacen, IReloj reloj, IRegistro registro, Random azar = null)
        {
            this.config = config ?? throw new ArgumentNullException(nameof(config));
            this.transporte = transporte;
            this.almacen = almacen;
            this.reloj = reloj;
            this.registro = registro;
            this.azar = azar ?? new Random();
            cola = new ColaEventos(config.MaxEventosEnCola);
            Estado = EstadoCliente.SinIniciar;
        }

        public EstadoCliente Estado { get; private set; }
        public string PlayerId { get; private set; }
        public string SessionId { get; private set; }
        public int EventosEnCola { get { return cola.Cantidad; } }
        public int EventosDescartados { get { return cola.Descartados; } }
        public bool Enviando { get { return enviando; } }

        // ---------- Consentimiento (CLAUDE.md §5 Privacidad) ----------

        // null = todavía no se le preguntó al jugador: el juego debe mostrar el aviso de privacidad.
        public bool? Consentimiento
        {
            get
            {
                var v = almacen.Leer(ClaveConsentimiento);
                return v == "1" ? true : v == "0" ? (bool?)false : null;
            }
        }

        public void EstablecerConsentimiento(bool acepta)
        {
            almacen.Guardar(ClaveConsentimiento, acepta ? "1" : "0");
            if (!acepta)
            {
                // Sin consentimiento no se manda nada más; lo pendiente se descarta.
                cola.Vaciar();
                if (Estado == EstadoCliente.Activo || Estado == EstadoCliente.IniciandoSesion) Estado = EstadoCliente.Deshabilitado;
            }
        }

        // ---------- Sesión ----------

        // Pide un sessionId a la API (POST /sesiones). Reintenta con espera creciente ante fallo de
        // red, 429 o 5xx (p. ej. la API gratuita "dormida"); los eventos se acumulan mientras tanto.
        public async Task<bool> IniciarAsync()
        {
            if (Estado == EstadoCliente.Activo || Estado == EstadoCliente.IniciandoSesion) return Estado == EstadoCliente.Activo;
            var problemas = config.Problemas();
            if (problemas.Count > 0)
            {
                registro.Error("Configuración inválida, el SDK queda deshabilitado: " + string.Join("; ", problemas));
                Estado = EstadoCliente.Deshabilitado;
                return false;
            }
            var consentimiento = Consentimiento;
            if (consentimiento == null)
            {
                registro.Advertencia("Falta el consentimiento del jugador: llama EstablecerConsentimiento antes de Iniciar.");
                return false;
            }

            AsegurarPlayerId();
            SessionId = null;
            secuencia = 0;
            intentoPorNivel.Clear();
            inicioIntentoPorNivel.Clear();
            primerInicioPorNivel.Clear();
            if (consentimiento == true)
            {
                Estado = EstadoCliente.IniciandoSesion;
                Encolar("sesion_inicio", new Dictionary<string, object>());
            }

            var cuerpo = new Dictionary<string, object>
            {
                { "juegoId", config.JuegoId },
                { "playerId", PlayerId },
                { "buildVersion", config.BuildVersion },
                { "plataforma", config.Plataforma },
                { "consentimiento", consentimiento.Value },
            };
            var intento = 0;
            while (true)
            {
                var r = await EnviarAsync("POST", "/sesiones", cuerpo, config.TimeoutSegundos);
                if (r.Estado == 201)
                {
                    SessionId = LeerTexto(r.Cuerpo, "sessionId");
                    if (SessionId == null)
                    {
                        registro.Error("La API respondió 201 sin sessionId; el SDK queda deshabilitado.");
                        Deshabilitar();
                        return false;
                    }
                    foreach (var e in cola.Todos()) if (e.SessionId == null) e.SessionId = SessionId;
                    Estado = EstadoCliente.Activo;
                    ultimoEnvio = reloj.AhoraUtc;
                    forzarEnvio = true; // manda sesion_inicio y lo acumulado cuanto antes.
                    registro.Info("Sesión iniciada.");
                    return true;
                }
                if (r.Estado == 200)
                {
                    registro.Info("Sin consentimiento: la API no guarda nada y el SDK no enviará eventos.");
                    Deshabilitar();
                    return false;
                }
                if (PoliticaReintentos.DebeReintentar(r) && (consentimiento == true || intento < 3))
                {
                    intento++;
                    var espera = PoliticaReintentos.Espera(intento, config.EsperaInicialSegundos, config.EsperaMaximaSegundos, azar, r.RetryAfterSegundos);
                    registro.Advertencia("No se pudo iniciar la sesión (" + Describir(r) + "); reintento " + intento + " en " + espera.TotalSeconds.ToString("0.0", CultureInfo.InvariantCulture) + " s.");
                    await reloj.Esperar(espera);
                    if (consentimiento == true && Estado != EstadoCliente.IniciandoSesion) return false; // p. ej. retiró el consentimiento.
                    continue;
                }
                registro.Error("La API rechazó la sesión (" + Describir(r) + "); el SDK queda deshabilitado.");
                Deshabilitar();
                return false;
            }
        }

        // Manda sesion_fin y trata de vaciar la cola dentro del tiempo dado (al cerrar el juego).
        public async Task<bool> CerrarAsync(string motivo = "cierre_normal", double limiteSegundos = 4)
        {
            if (Estado == EstadoCliente.Cerrado) return true;
            if (PuedeRegistrar) Encolar("sesion_fin", new Dictionary<string, object> { { "motivo", motivo } });
            var vaciado = Estado == EstadoCliente.Activo && await VaciarAsync(limiteSegundos);
            if (Estado == EstadoCliente.Activo) Estado = EstadoCliente.Cerrado;
            return vaciado;
        }

        // ---------- Eventos genéricos (ESQUEMA_EVENTOS.md §3) ----------

        public void NivelInicio(string nivelId)
        {
            if (!PuedeRegistrar) return;
            int previo;
            var intento = (intentoPorNivel.TryGetValue(nivelId, out previo) ? previo : 0) + 1;
            intentoPorNivel[nivelId] = intento;
            inicioIntentoPorNivel[nivelId] = reloj.AhoraUtc;
            if (!primerInicioPorNivel.ContainsKey(nivelId)) primerInicioPorNivel[nivelId] = reloj.AhoraUtc;
            Encolar("nivel_inicio", new Dictionary<string, object> { { "nivelId", nivelId }, { "intento", intento } });
        }

        // Cada muerte cierra el intento (S-08): manda `muerte` y `nivel_fin` con resultado "muerte".
        // Al reaparecer, el juego vuelve a llamar NivelInicio (intento + 1).
        public void Muerte(string nivelId, string causa, double x, double y)
        {
            if (!PuedeRegistrar) return;
            var intento = IntentoActual(nivelId);
            Encolar("muerte", new Dictionary<string, object> { { "nivelId", nivelId }, { "intento", intento }, { "causa", causa }, { "x", Redondear(x) }, { "y", Redondear(y) } });
            FinDeIntento(nivelId, intento, "muerte");
        }

        public void NivelCompletado(string nivelId)
        {
            if (!PuedeRegistrar) return;
            FinDeIntento(nivelId, IntentoActual(nivelId), "completado");
            forzarEnvio = true; // siempre al cambiar de nivel.
        }

        public void NivelAbandonado(string nivelId)
        {
            if (!PuedeRegistrar) return;
            FinDeIntento(nivelId, IntentoActual(nivelId), "abandono");
            forzarEnvio = true;
        }

        public void Logro(string logroId)
        {
            Evento("logro", new Dictionary<string, object> { { "logroId", logroId } });
        }

        public void Pausa(long duracionMs, string nivelId = null)
        {
            Evento("pausa", ConNivel(new Dictionary<string, object> { { "duracionMs", Math.Max(0, duracionMs) } }, nivelId));
        }

        // Atajos: PausaInicio al abrir el menú de pausa y PausaFin al cerrarlo.
        public void PausaInicio() { inicioPausa = reloj.AhoraUtc; }

        public void PausaFin(string nivelId = null)
        {
            if (inicioPausa == null) return;
            Pausa(MsDesde(inicioPausa.Value), nivelId);
            inicioPausa = null;
        }

        public void Inactividad(long duracionMs, string nivelId = null)
        {
            Evento("inactividad", ConNivel(new Dictionary<string, object> { { "duracionMs", Math.Max(0, duracionMs) } }, nivelId));
        }

        public void Error(string codigo, string mensaje, bool fatal)
        {
            Evento("error", new Dictionary<string, object>
            {
                { "codigo", Recortar(string.IsNullOrEmpty(codigo) ? "DESCONOCIDO" : codigo, MaxCodigoError) },
                { "mensaje", Recortar(string.IsNullOrEmpty(mensaje) ? "(sin mensaje)" : mensaje, MaxMensajeError) },
                { "fatal", fatal },
            });
            if (fatal) forzarEnvio = true;
        }

        public void Rendimiento(double fpsPromedio, long? tiempoCargaMs = null, string nivelId = null)
        {
            var data = new Dictionary<string, object> { { "fpsPromedio", Redondear(Math.Max(0, fpsPromedio)) } };
            if (tiempoCargaMs.HasValue) data["tiempoCargaMs"] = Math.Max(0, tiempoCargaMs.Value);
            Evento("rendimiento", ConNivel(data, nivelId));
        }

        // ---------- Eventos de La Casa del Bosque (ESQUEMA_EVENTOS.md §4) ----------

        public void FlorRecogida(string nivelId)
        {
            Evento("flor_recogida", new Dictionary<string, object> { { "nivelId", nivelId }, { "duracionMs", MsDesdeInicioIntento(nivelId) } });
        }

        public void DialogoSaltado(string dialogoId, string nivelId)
        {
            Evento("dialogo_saltado", new Dictionary<string, object> { { "dialogoId", dialogoId }, { "nivelId", nivelId } });
        }

        public void ColeccionableEncontrado(string coleccionableId, string nivelId)
        {
            Evento("coleccionable_encontrado", new Dictionary<string, object> { { "coleccionableId", coleccionableId }, { "nivelId", nivelId } });
        }

        // duracionMs = desde el primer nivel_inicio del nivel del tutorial en la sesión (S-25).
        public void TutorialCompletado(string nivelIdDelTutorial)
        {
            DateTime primero;
            var duracion = primerInicioPorNivel.TryGetValue(nivelIdDelTutorial, out primero) ? MsDesde(primero) : 0;
            Evento("tutorial_completado", new Dictionary<string, object> { { "duracionMs", duracion } });
        }

        // Cualquier otro tipo registrado en el catálogo del juego.
        public void Evento(string tipo, Dictionary<string, object> data)
        {
            if (!PuedeRegistrar) return;
            Encolar(tipo, data ?? new Dictionary<string, object>());
        }

        // ---------- Envío ----------

        // Llamar con frecuencia (cada frame en Unity). Decide si toca enviar un lote.
        public void Tick()
        {
            if (Estado != EstadoCliente.Activo || enviando) return;
            var ahora = reloj.AhoraUtc;
            if (ahora < proximoIntento) return;
            if (cola.Cantidad == 0)
            {
                forzarEnvio = false;
                return;
            }
            if (forzarEnvio || cola.Cantidad >= config.TamanoLote || (ahora - ultimoEnvio).TotalSeconds >= config.IntervaloEnvioSegundos)
            {
                var _ = EnviarLoteAsync(config.TimeoutSegundos);
            }
        }

        // Envía todo lo pendiente (respetando las esperas) hasta vaciar o agotar el tiempo.
        public async Task<bool> VaciarAsync(double limiteSegundos)
        {
            var fin = reloj.AhoraUtc.AddSeconds(limiteSegundos);
            while (cola.Cantidad > 0 && Estado == EstadoCliente.Activo && reloj.AhoraUtc < fin)
            {
                if (enviando)
                {
                    await reloj.Esperar(TimeSpan.FromMilliseconds(50));
                    continue;
                }
                var ahora = reloj.AhoraUtc;
                if (ahora < proximoIntento)
                {
                    if (proximoIntento >= fin) break;
                    await reloj.Esperar(proximoIntento - ahora);
                    continue;
                }
                var restante = (int)Math.Ceiling((fin - reloj.AhoraUtc).TotalSeconds);
                var resultado = await EnviarLoteAsync(Math.Max(1, Math.Min(config.TimeoutSegundos, restante)));
                if (resultado == ResultadoEnvio.Deshabilitado) break;
            }
            return cola.Cantidad == 0;
        }

        public async Task<ResultadoEnvio> EnviarLoteAsync(int timeoutSegundos)
        {
            if (enviando || Estado != EstadoCliente.Activo) return ResultadoEnvio.NadaQueEnviar;
            var lote = cola.VerPrimeros(config.MaxEventosPorPeticion);
            if (lote.Count == 0) return ResultadoEnvio.NadaQueEnviar;
            enviando = true;
            try
            {
                var cuerpo = new List<object>(lote.Count);
                foreach (var e in lote) cuerpo.Add(Serializar(e));
                var r = await EnviarAsync("POST", "/eventos", cuerpo, timeoutSegundos);
                ultimoEnvio = reloj.AhoraUtc;

                if (r.Estado == 201)
                {
                    cola.Confirmar(lote);
                    reintentosEnvio = 0;
                    proximoIntento = DateTime.MinValue;
                    RegistrarRechazados(r.Cuerpo, lote);
                    if (cola.Cantidad == 0) forzarEnvio = false;
                    return ResultadoEnvio.Enviado;
                }
                if (PoliticaReintentos.DebeReintentar(r))
                {
                    reintentosEnvio++;
                    var espera = PoliticaReintentos.Espera(reintentosEnvio, config.EsperaInicialSegundos, config.EsperaMaximaSegundos, azar, r.RetryAfterSegundos);
                    proximoIntento = reloj.AhoraUtc + espera;
                    registro.Advertencia("Lote de " + lote.Count + " eventos no enviado (" + Describir(r) + "); reintento " + reintentosEnvio + " en " + espera.TotalSeconds.ToString("0.0", CultureInfo.InvariantCulture) + " s.");
                    return ResultadoEnvio.ReintentarDespues;
                }
                if (r.Estado == 401 || r.Estado == 403)
                {
                    registro.Error("La API rechazó la API key o el juego (" + Describir(r) + "); el SDK queda deshabilitado.");
                    Deshabilitar();
                    return ResultadoEnvio.Deshabilitado;
                }
                // Otros 4xx: reenviar daría el mismo error. Se descarta el lote, sin reintentar.
                registro.Error("Lote de " + lote.Count + " eventos descartado sin reintentar (" + Describir(r) + ").");
                cola.Confirmar(lote);
                return ResultadoEnvio.Descartado;
            }
            finally
            {
                enviando = false;
            }
        }

        // ---------- Internos ----------

        private bool PuedeRegistrar
        {
            get { return (Estado == EstadoCliente.Activo || Estado == EstadoCliente.IniciandoSesion) && Consentimiento == true; }
        }

        private void Encolar(string tipo, Dictionary<string, object> data)
        {
            cola.Encolar(new EventoPendiente
            {
                EventoId = Guid.NewGuid().ToString("D"), // Guid.NewGuid() genera UUID v4.
                SessionId = SessionId,
                Secuencia = ++secuencia,
                TimestampUtc = reloj.AhoraUtc,
                Tipo = tipo,
                Data = data,
            });
        }

        private Dictionary<string, object> Serializar(EventoPendiente e)
        {
            return new Dictionary<string, object>
            {
                { "eventoId", e.EventoId },
                { "juegoId", config.JuegoId },
                { "playerId", PlayerId },
                { "sessionId", e.SessionId ?? SessionId },
                { "secuencia", e.Secuencia },
                { "timestamp", FormatoTimestamp(e.TimestampUtc) },
                { "buildVersion", config.BuildVersion },
                { "plataforma", config.Plataforma },
                { "versionEsquema", 1 },
                { "tipo", e.Tipo },
                { "data", e.Data },
            };
        }

        // ISO 8601 en UTC con milisegundos y "Z" (ESQUEMA_EVENTOS.md §2).
        public static string FormatoTimestamp(DateTime utc)
        {
            return DateTime.SpecifyKind(utc, DateTimeKind.Utc).ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'", CultureInfo.InvariantCulture);
        }

        private void FinDeIntento(string nivelId, int intento, string resultado)
        {
            Encolar("nivel_fin", new Dictionary<string, object>
            {
                { "nivelId", nivelId },
                { "intento", intento },
                { "resultado", resultado },
                { "duracionMs", MsDesdeInicioIntento(nivelId) },
            });
        }

        private int IntentoActual(string nivelId)
        {
            int intento;
            if (intentoPorNivel.TryGetValue(nivelId, out intento)) return intento;
            registro.Advertencia("Evento de " + nivelId + " sin NivelInicio previo; se usa intento 1.");
            intentoPorNivel[nivelId] = 1;
            inicioIntentoPorNivel[nivelId] = reloj.AhoraUtc;
            return 1;
        }

        private long MsDesdeInicioIntento(string nivelId)
        {
            DateTime inicio;
            return inicioIntentoPorNivel.TryGetValue(nivelId, out inicio) ? MsDesde(inicio) : 0;
        }

        private long MsDesde(DateTime inicio)
        {
            return Math.Max(0, (long)Math.Round((reloj.AhoraUtc - inicio).TotalMilliseconds));
        }

        private void AsegurarPlayerId()
        {
            var guardado = almacen.Leer(ClaveJugador);
            Guid g;
            if (guardado != null && Guid.TryParseExact(guardado, "D", out g))
            {
                PlayerId = guardado;
                return;
            }
            PlayerId = Guid.NewGuid().ToString("D");
            almacen.Guardar(ClaveJugador, PlayerId);
        }

        private void Deshabilitar()
        {
            Estado = EstadoCliente.Deshabilitado;
            cola.Vaciar();
        }

        private async Task<ResultadoHttp> EnviarAsync(string metodo, string ruta, object cuerpo, int timeoutSegundos)
        {
            var encabezados = new Dictionary<string, string>
            {
                { "Content-Type", "application/json" },
                { "X-Api-Key", config.ApiKey },
            };
            try
            {
                var r = await transporte.EnviarAsync(metodo, config.UrlBase.TrimEnd('/') + ruta, JsonEscritor.Serializar(cuerpo), encabezados, timeoutSegundos);
                return r ?? ResultadoHttp.DeRed();
            }
            catch (Exception ex)
            {
                // Nunca se registra la API key; solo el tipo de error.
                registro.Advertencia("Error de transporte: " + ex.GetType().Name);
                return ResultadoHttp.DeRed();
            }
        }

        private void RegistrarRechazados(string cuerpo, List<EventoPendiente> lote)
        {
            try
            {
                var respuesta = JsonLector.Parsear(cuerpo ?? "{}") as Dictionary<string, object>;
                object valor;
                if (respuesta == null || !respuesta.TryGetValue("rechazados", out valor) || !(valor is List<object> rechazados)) return;
                foreach (var item in rechazados)
                {
                    var r = item as Dictionary<string, object>;
                    if (r == null) continue;
                    var indice = r.TryGetValue("indice", out valor) && valor is double d ? (int)d : -1;
                    var tipo = indice >= 0 && indice < lote.Count ? lote[indice].Tipo : "?";
                    // Un rechazo nunca se reintenta: el evento está mal y daría el mismo resultado.
                    registro.Advertencia("Evento rechazado por la API (" + tipo + ", " + Texto(r, "codigo") + "): " + Texto(r, "mensaje"));
                }
            }
            catch (FormatException)
            {
                registro.Advertencia("Respuesta 201 con un cuerpo que no es JSON.");
            }
        }

        private static string LeerTexto(string json, string clave)
        {
            try
            {
                var d = JsonLector.Parsear(json ?? "") as Dictionary<string, object>;
                return d == null ? null : Texto(d, clave);
            }
            catch (FormatException)
            {
                return null;
            }
        }

        private static string Texto(Dictionary<string, object> d, string clave)
        {
            object v;
            return d.TryGetValue(clave, out v) ? v as string : null;
        }

        private static string Describir(ResultadoHttp r)
        {
            if (r.ErrorDeRed) return "sin respuesta de la API";
            string mensaje = null;
            try
            {
                var d = JsonLector.Parsear(r.Cuerpo ?? "") as Dictionary<string, object>;
                object error;
                if (d != null && d.TryGetValue("error", out error) && error is Dictionary<string, object> e) mensaje = Texto(e, "codigo") + ": " + Texto(e, "mensaje");
            }
            catch (FormatException)
            {
            }
            return "HTTP " + r.Estado + (mensaje != null ? " " + mensaje : "");
        }

        private static Dictionary<string, object> ConNivel(Dictionary<string, object> data, string nivelId)
        {
            if (!string.IsNullOrEmpty(nivelId)) data["nivelId"] = nivelId;
            return data;
        }

        private static string Recortar(string s, int max) { return s.Length <= max ? s : s.Substring(0, max); }

        private static double Redondear(double v) { return Math.Round(v, 2); }
    }
}
