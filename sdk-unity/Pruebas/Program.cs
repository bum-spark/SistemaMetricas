// Pruebas del núcleo del SDK (sin Unity) y prueba e2e contra una API local real.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Text.RegularExpressions;
using System.Threading.Tasks;

namespace EstudioXolos.Metricas.Pruebas
{
    public static class Program
    {
        private static readonly Regex UuidV4 = new Regex("^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$");
        private static readonly Regex TimestampIso = new Regex(@"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$");
        private const string JuegoId = "8c4f2a1e-5d3b-4f7a-9e2c-1b6d8a0f3e57";

        public static async Task<int> Main(string[] args)
        {
            // Cultura con coma decimal: los números del JSON deben salir con punto igual.
            CultureInfo.CurrentCulture = CultureInfo.GetCultureInfo("es-ES");
            if (args.Length > 0 && args[0] == "e2e") return await E2e.Ejecutar(args);
            return await EjecutarPruebas();
        }

        // ---------- Mini marco de pruebas ----------

        private sealed class FalloPrueba : Exception { public FalloPrueba(string m) : base(m) { } }

        private static void Verificar(bool condicion, string mensaje) { if (!condicion) throw new FalloPrueba(mensaje); }

        private static void Igual<T>(T esperado, T real, string que)
        {
            if (!EqualityComparer<T>.Default.Equals(esperado, real)) throw new FalloPrueba(que + ": se esperaba <" + esperado + "> y llegó <" + real + ">");
        }

        private sealed class Entorno
        {
            public RelojFalso Reloj = new RelojFalso();
            public TransporteFalso Transporte;
            public AlmacenMemoria Almacen = new AlmacenMemoria();
            public RegistroMemoria Registro = new RegistroMemoria();
            public ConfiguracionMetricas Config = new ConfiguracionMetricas { JuegoId = JuegoId, ApiKey = "ak_prueba", BuildVersion = "1.0.1", Plataforma = "windows" };
            public ClienteMetricas Cliente;

            public Entorno(bool? consentimiento = true, Action<ConfiguracionMetricas> ajustar = null)
            {
                Transporte = new TransporteFalso(Reloj);
                ajustar?.Invoke(Config);
                if (consentimiento.HasValue) Almacen.Guardar(ClienteMetricas.ClaveConsentimiento, consentimiento.Value ? "1" : "0");
                Cliente = new ClienteMetricas(Config, Transporte, Almacen, Reloj, Registro, new Random(7));
            }

            // Sesión iniciada y sesion_inicio ya enviado: la cola queda vacía.
            public async Task<Entorno> Activo()
            {
                Verificar(await Cliente.IniciarAsync(), "la sesión debía iniciar");
                Cliente.Tick();
                Igual(0, Cliente.EventosEnCola, "cola tras enviar sesion_inicio");
                return this;
            }

            public List<Dictionary<string, object>> EventosEnviados
            {
                get { return Transporte.DeEventos.SelectMany(p => p.Lote).Cast<Dictionary<string, object>>().ToList(); }
            }
        }

        private static Dictionary<string, object> Data(Dictionary<string, object> evento) { return (Dictionary<string, object>)evento["data"]; }
        private static ResultadoHttp Rechazo(int estado, string codigo) { return ResultadoHttp.Con(estado, "{\"error\":{\"codigo\":\"" + codigo + "\",\"mensaje\":\"x\",\"detalles\":[]}}"); }

        private static readonly List<(string nombre, Func<Task> prueba)> Casos = new List<(string, Func<Task>)>
        {
            ("JSON: escapes, null, listas y números con punto aunque la cultura use coma", () =>
            {
                var json = JsonEscritor.Serializar(new Dictionary<string, object> { { "x", 12.5 }, { "s", "a\"b\n\u0001" }, { "n", null }, { "b", true }, { "l", new List<object> { 1, 2L, 0.1 } } });
                Igual("{\"x\":12.5,\"s\":\"a\\\"b\\n\\u0001\",\"n\":null,\"b\":true,\"l\":[1,2,0.1]}", json, "JSON escrito");
                var leido = (Dictionary<string, object>)JsonLector.Parsear(json);
                Igual(12.5, (double)leido["x"], "número leído");
                Igual("a\"b\n\u0001", (string)leido["s"], "texto leído");
                Verificar(leido["n"] == null, "null leído");
                return Task.CompletedTask;
            }),

            ("Sin consentimiento guardado: no habla con la API ni registra eventos", async () =>
            {
                var e = new Entorno(consentimiento: null);
                Verificar(!await e.Cliente.IniciarAsync(), "no debía iniciar");
                e.Cliente.NivelInicio("casa_abandonada");
                Igual(0, e.Transporte.Peticiones.Count, "peticiones");
                Igual(0, e.Cliente.EventosEnCola, "cola");
                Verificar(e.Registro.Todo.Contains("Falta el consentimiento"), "debía avisar que falta el consentimiento");
            }),

            ("Consentimiento false: avisa a la API (consentimiento false) y no manda eventos", async () =>
            {
                var e = new Entorno(consentimiento: false);
                e.Transporte.Responder(ResultadoHttp.Con(200, "{\"sessionId\":null,\"consentimiento\":false}"));
                Verificar(!await e.Cliente.IniciarAsync(), "no debía quedar activo");
                Igual(false, (bool)e.Transporte.DeSesiones[0].Objeto["consentimiento"], "consentimiento enviado");
                e.Cliente.NivelInicio("casa_abandonada");
                e.Reloj.Avanzar(TimeSpan.FromMinutes(5));
                e.Cliente.Tick();
                Igual(EstadoCliente.Deshabilitado, e.Cliente.Estado, "estado");
                Igual(0, e.Transporte.DeEventos.Count, "peticiones de eventos");
            }),

            ("playerId: UUID v4 guardado en el almacén y reutilizado en la siguiente partida", async () =>
            {
                var e = new Entorno();
                await e.Cliente.IniciarAsync();
                Verificar(UuidV4.IsMatch(e.Cliente.PlayerId), "playerId debe ser UUID v4: " + e.Cliente.PlayerId);
                var otra = new ClienteMetricas(e.Config, e.Transporte, e.Almacen, e.Reloj, e.Registro);
                await otra.IniciarAsync();
                Igual(e.Cliente.PlayerId, otra.PlayerId, "playerId en la segunda partida");
                Igual(e.Cliente.PlayerId, (string)e.Transporte.DeSesiones[1].Objeto["playerId"], "playerId enviado");
            }),

            ("Sesión: sesion_inicio es secuencia 1; todos los campos comunes; X-Api-Key y timeout de 60 s", async () =>
            {
                var e = new Entorno();
                await e.Cliente.IniciarAsync();
                e.Cliente.NivelInicio("casa_abandonada");
                e.Cliente.Tick();
                var enviados = e.EventosEnviados;
                Igual("sesion_inicio", (string)enviados[0]["tipo"], "primer evento");
                Igual(1.0, (double)enviados[0]["secuencia"], "secuencia de sesion_inicio");
                Igual(2.0, (double)enviados[1]["secuencia"], "secuencia de nivel_inicio");
                foreach (var ev in enviados)
                {
                    Verificar(UuidV4.IsMatch((string)ev["eventoId"]), "eventoId v4");
                    Igual(TransporteFalso.SessionIdDePrueba, (string)ev["sessionId"], "sessionId");
                    Igual(JuegoId, (string)ev["juegoId"], "juegoId");
                    Verificar(TimestampIso.IsMatch((string)ev["timestamp"]), "timestamp ISO UTC: " + ev["timestamp"]);
                    Igual("windows", (string)ev["plataforma"], "plataforma");
                    Igual(1.0, (double)ev["versionEsquema"], "versionEsquema");
                }
                Igual(2, enviados.Select(x => x["eventoId"]).Distinct().Count(), "eventoId únicos");
                var p = e.Transporte.DeEventos[0];
                Igual("ak_prueba", p.Encabezados["X-Api-Key"], "header X-Api-Key");
                Igual(60, p.Timeout, "timeout");
            }),

            ("Eventos registrados mientras se espera el sessionId lo reciben al llegar la sesión", async () =>
            {
                var e = new Entorno();
                var respuesta = new TaskCompletionSource<ResultadoHttp>();
                e.Transporte.ResponderDespues(respuesta.Task);
                var iniciando = e.Cliente.IniciarAsync();
                Igual(EstadoCliente.IniciandoSesion, e.Cliente.Estado, "estado mientras espera");
                e.Cliente.NivelInicio("casa_abandonada");
                e.Cliente.Tick();
                Igual(0, e.Transporte.DeEventos.Count, "no se envía sin sessionId");
                respuesta.SetResult(ResultadoHttp.Con(201, "{\"sessionId\":\"" + TransporteFalso.SessionIdDePrueba + "\"}"));
                await iniciando;
                e.Cliente.Tick();
                Verificar(e.EventosEnviados.All(x => (string)x["sessionId"] == TransporteFalso.SessionIdDePrueba), "todos con sessionId");
                Igual(2, e.EventosEnviados.Count, "eventos enviados");
            }),

            ("Lote por tamaño: al juntar 20 eventos se envía sin esperar el intervalo", async () =>
            {
                var e = await new Entorno().Activo();
                for (var i = 0; i < 19; i++) e.Cliente.Pausa(10);
                e.Cliente.Tick();
                Igual(1, e.Transporte.DeEventos.Count, "con 19 no se envía (solo el lote de sesion_inicio)");
                e.Cliente.Pausa(10);
                e.Cliente.Tick();
                Igual(2, e.Transporte.DeEventos.Count, "con 20 sí");
                Igual(20, e.Transporte.DeEventos[1].Lote.Count, "tamaño del lote");
            }),

            ("Lote por tiempo: con pocos eventos se envía al cumplirse el intervalo (10 s)", async () =>
            {
                var e = await new Entorno().Activo();
                e.Cliente.Pausa(10); e.Cliente.Pausa(10); e.Cliente.Pausa(10);
                e.Reloj.Avanzar(TimeSpan.FromSeconds(9.9));
                e.Cliente.Tick();
                Igual(1, e.Transporte.DeEventos.Count, "antes del intervalo");
                e.Reloj.Avanzar(TimeSpan.FromSeconds(0.2));
                e.Cliente.Tick();
                Igual(2, e.Transporte.DeEventos.Count, "al cumplirse el intervalo");
                Igual(3, e.Transporte.DeEventos[1].Lote.Count, "eventos en el lote");
            }),

            ("Cambio de nivel: NivelCompletado fuerza el envío aunque haya pocos eventos", async () =>
            {
                var e = await new Entorno().Activo();
                e.Cliente.NivelInicio("casa_abandonada");
                e.Cliente.Tick();
                Igual(1, e.Transporte.DeEventos.Count, "un evento no se envía solo");
                e.Cliente.NivelCompletado("casa_abandonada");
                e.Cliente.Tick();
                Igual(2, e.Transporte.DeEventos.Count, "se envía al completar el nivel");
            }),

            ("Nunca más de 100 eventos por petición (límite de la API)", async () =>
            {
                var e = await new Entorno().Activo();
                for (var i = 0; i < 250; i++) e.Cliente.Pausa(1);
                Verificar(await e.Cliente.VaciarAsync(30), "debía vaciar la cola");
                Igual("100,100,50", string.Join(",", e.Transporte.DeEventos.Skip(1).Select(p => p.Lote.Count)), "tamaños de lote");
            }),

            ("Fallo de red: reintenta con espera creciente (2, 4, 8 s con jitter) y reenvía los mismos eventoId", async () =>
            {
                var e = await new Entorno().Activo();
                e.Transporte.Responder(ResultadoHttp.DeRed()).Responder(ResultadoHttp.DeRed()).Responder(ResultadoHttp.DeRed());
                e.Cliente.NivelCompletado("casa_abandonada");
                for (var i = 0; i < 400; i++)
                {
                    e.Cliente.Tick();
                    e.Reloj.Avanzar(TimeSpan.FromMilliseconds(100));
                }
                var intentos = e.Transporte.DeEventos.Skip(1).ToList();
                Igual(4, intentos.Count, "3 fallos + 1 éxito, sin envíos extra");
                var ids = intentos.Select(p => string.Join(",", p.Lote.Cast<Dictionary<string, object>>().Select(x => x["eventoId"]))).Distinct().Count();
                Igual(1, ids, "los reintentos llevan los mismos eventoId");
                var esperas = Enumerable.Range(1, 3).Select(i => (intentos[i].EnviadaEn - intentos[i - 1].EnviadaEn).TotalSeconds).ToList();
                Verificar(esperas[0] >= 1 && esperas[0] <= 2.2, "1.ª espera en [1, 2] s: " + esperas[0]);
                Verificar(esperas[1] >= 2 && esperas[1] <= 4.2, "2.ª espera en [2, 4] s: " + esperas[1]);
                Verificar(esperas[2] >= 4 && esperas[2] <= 8.2, "3.ª espera en [4, 8] s: " + esperas[2]);
                Igual(0, e.Cliente.EventosEnCola, "cola vacía al final");
            }),

            ("La espera nunca pasa de 60 s y 429 respeta Retry-After", () =>
            {
                var azar = new Random(1);
                for (var intento = 1; intento <= 30; intento++)
                {
                    var s = PoliticaReintentos.Espera(intento, 2, 60, azar).TotalSeconds;
                    Verificar(s <= 60 && s >= 1, "espera fuera de rango en el intento " + intento + ": " + s);
                }
                Verificar(PoliticaReintentos.Espera(1, 2, 60, azar, 30).TotalSeconds >= 30, "Retry-After de 30 s");
                Verificar(PoliticaReintentos.Espera(1, 2, 60, azar, 600).TotalSeconds <= 60, "Retry-After acotado a 60 s");
                return Task.CompletedTask;
            }),

            ("429 (con Retry-After) y 5xx se reintentan; luego se envía", async () =>
            {
                var e = await new Entorno().Activo();
                e.Transporte.Responder(ResultadoHttp.Con(429, "{}", "30")).Responder(Rechazo(503, "X"));
                e.Cliente.NivelCompletado("casa_abandonada");
                e.Cliente.Tick();
                e.Reloj.Avanzar(TimeSpan.FromSeconds(29));
                e.Cliente.Tick();
                Igual(2, e.Transporte.DeEventos.Count, "no reintenta antes del Retry-After");
                e.Reloj.Avanzar(TimeSpan.FromSeconds(31));
                e.Cliente.Tick();
                Igual(3, e.Transporte.DeEventos.Count, "reintento tras el 429");
                e.Reloj.Avanzar(TimeSpan.FromSeconds(10));
                e.Cliente.Tick();
                Igual(4, e.Transporte.DeEventos.Count, "reintento tras el 503");
                Igual(0, e.Cliente.EventosEnCola, "enviado");
            }),

            ("Otros 4xx: el lote se descarta sin reintentar (400, 413)", async () =>
            {
                foreach (var estado in new[] { 400, 413 })
                {
                    var e = await new Entorno().Activo();
                    e.Transporte.Responder(Rechazo(estado, "VALIDACION_FALLIDA"));
                    e.Cliente.NivelCompletado("casa_abandonada");
                    e.Cliente.Tick();
                    e.Reloj.Avanzar(TimeSpan.FromMinutes(10));
                    e.Cliente.Tick();
                    Igual(2, e.Transporte.DeEventos.Count, "sin reintento para " + estado);
                    Igual(0, e.Cliente.EventosEnCola, "lote descartado para " + estado);
                    Igual(EstadoCliente.Activo, e.Cliente.Estado, "sigue activo tras " + estado);
                }
            }),

            ("401 (API key inválida o revocada) deshabilita el SDK y vacía la cola", async () =>
            {
                var e = await new Entorno().Activo();
                e.Transporte.Responder(Rechazo(401, "API_KEY_INVALIDA"));
                e.Cliente.NivelCompletado("casa_abandonada");
                e.Cliente.Tick();
                Igual(EstadoCliente.Deshabilitado, e.Cliente.Estado, "estado");
                e.Cliente.NivelInicio("hospital_cuarto");
                e.Reloj.Avanzar(TimeSpan.FromMinutes(1));
                e.Cliente.Tick();
                Igual(2, e.Transporte.DeEventos.Count, "no vuelve a enviar");
                Igual(0, e.Cliente.EventosEnCola, "cola");
                Verificar(!e.Registro.Todo.Contains("ak_prueba"), "la API key nunca aparece en los registros");
            }),

            ("Eventos rechazados dentro de un 201 no se reenvían (se registran como advertencia)", async () =>
            {
                var e = await new Entorno().Activo();
                e.Transporte.Responder(ResultadoHttp.Con(201, "{\"aceptados\":1,\"rechazados\":[{\"indice\":1,\"codigo\":\"TIPO_NO_REGISTRADO\",\"mensaje\":\"tipo 'palanca' no está registrado\"}]}"));
                e.Cliente.NivelInicio("casa_abandonada");
                e.Cliente.Evento("palanca", null);
                e.Cliente.NivelCompletado("casa_abandonada");
                e.Cliente.Tick();
                e.Reloj.Avanzar(TimeSpan.FromMinutes(10));
                e.Cliente.Tick();
                Igual(2, e.Transporte.DeEventos.Count, "sin reenvío");
                Igual(0, e.Cliente.EventosEnCola, "cola");
                Verificar(e.Registro.Todo.Contains("Evento rechazado por la API (palanca, TIPO_NO_REGISTRADO)"), "advertencia del rechazo");
            }),

            ("Muerte cierra el intento: muerte + nivel_fin(muerte); el siguiente NivelInicio es el intento 2; duraciones", async () =>
            {
                var e = await new Entorno().Activo();
                e.Cliente.NivelInicio("casa_abandonada");
                e.Reloj.Avanzar(TimeSpan.FromSeconds(95));
                e.Cliente.Muerte("casa_abandonada", "fantasma", 46.237, 6.1);
                e.Reloj.Avanzar(TimeSpan.FromSeconds(2));
                e.Cliente.NivelInicio("casa_abandonada");
                e.Reloj.Avanzar(TimeSpan.FromSeconds(150));
                e.Cliente.FlorRecogida("casa_abandonada");
                e.Cliente.NivelCompletado("casa_abandonada");
                e.Cliente.Tick();
                var ev = e.EventosEnviados.Skip(1).ToList();
                Igual("nivel_inicio,muerte,nivel_fin,nivel_inicio,flor_recogida,nivel_fin", string.Join(",", ev.Select(x => x["tipo"])), "secuencia de tipos");
                Igual(1.0, (double)Data(ev[1])["intento"], "intento de la muerte");
                Igual(46.24, (double)Data(ev[1])["x"], "x redondeada");
                Igual("muerte", (string)Data(ev[2])["resultado"], "resultado del primer intento");
                Igual(95000.0, (double)Data(ev[2])["duracionMs"], "duración del intento con muerte");
                Igual(2.0, (double)Data(ev[3])["intento"], "segundo intento");
                Igual(150000.0, (double)Data(ev[4])["duracionMs"], "duración de flor_recogida");
                Igual("completado", (string)Data(ev[5])["resultado"], "resultado final");
                Igual(150000.0, (double)Data(ev[5])["duracionMs"], "duración del intento completado");
            }),

            ("Tutorial: duracionMs desde el primer nivel_inicio del nivel; pausa con PausaInicio/PausaFin", async () =>
            {
                var e = await new Entorno().Activo();
                e.Cliente.NivelInicio("casa_abandonada");
                e.Reloj.Avanzar(TimeSpan.FromSeconds(55));
                e.Cliente.TutorialCompletado("casa_abandonada");
                e.Cliente.PausaInicio();
                e.Reloj.Avanzar(TimeSpan.FromSeconds(12.5));
                e.Cliente.PausaFin("casa_abandonada");
                e.Cliente.NivelCompletado("casa_abandonada");
                e.Cliente.Tick();
                var ev = e.EventosEnviados;
                Igual(55000.0, (double)Data(ev.First(x => (string)x["tipo"] == "tutorial_completado"))["duracionMs"], "duración del tutorial");
                Igual(12500.0, (double)Data(ev.First(x => (string)x["tipo"] == "pausa"))["duracionMs"], "duración de la pausa");
            }),

            ("API dormida: la sesión se reintenta con espera creciente hasta que responde", async () =>
            {
                var e = new Entorno();
                e.Transporte.Responder(ResultadoHttp.DeRed()).Responder(ResultadoHttp.DeRed()).Responder(Rechazo(502, "X"));
                Verificar(await e.Cliente.IniciarAsync(), "debía iniciar al cuarto intento");
                Igual(4, e.Transporte.DeSesiones.Count, "intentos de sesión");
                Verificar(e.Reloj.Esperas.Count == 3 && e.Reloj.Esperas[2] > e.Reloj.Esperas[0], "esperas crecientes");
                Igual(60, e.Transporte.DeSesiones[0].Timeout, "timeout largo para la API dormida");
            }),

            ("Cerrar: sesion_fin con el motivo y la cola vaciada; con la API caída no se queda colgado", async () =>
            {
                var e = await new Entorno().Activo();
                e.Cliente.NivelInicio("casa_abandonada");
                Verificar(await e.Cliente.CerrarAsync("menu_salir", 4), "debía vaciar");
                var ultimo = e.EventosEnviados.Last();
                Igual("sesion_fin", (string)ultimo["tipo"], "último evento");
                Igual("menu_salir", (string)Data(ultimo)["motivo"], "motivo");
                Igual(EstadoCliente.Cerrado, e.Cliente.Estado, "estado");

                var caida = await new Entorno().Activo();
                for (var i = 0; i < 20; i++) caida.Transporte.Responder(ResultadoHttp.DeRed());
                var inicio = caida.Reloj.AhoraUtc;
                Verificar(!await caida.Cliente.CerrarAsync("cierre_normal", 4), "no podía vaciar con la API caída");
                Verificar((caida.Reloj.AhoraUtc - inicio).TotalSeconds <= 4.1, "respeta el límite de 4 s");
            }),

            ("Cola llena: se descartan los eventos más viejos; retirar el consentimiento vacía la cola", async () =>
            {
                var e = await new Entorno(ajustar: c => c.MaxEventosEnCola = 5).Activo();
                for (var i = 0; i < 20; i++) e.Transporte.Responder(ResultadoHttp.DeRed());
                for (var i = 0; i < 8; i++) e.Cliente.Pausa(i);
                Igual(5, e.Cliente.EventosEnCola, "cola acotada");
                Igual(3, e.Cliente.EventosDescartados, "descartados");
                e.Cliente.EstablecerConsentimiento(false);
                Igual(0, e.Cliente.EventosEnCola, "cola tras retirar el consentimiento");
                Igual(EstadoCliente.Deshabilitado, e.Cliente.Estado, "estado");
                e.Cliente.NivelInicio("casa_abandonada");
                Igual(0, e.Cliente.EventosEnCola, "no registra más");
            }),

            ("Configuración: lee el JSON de ejemplo, detecta lo que falta y recorta los textos de error", async () =>
            {
                var ejemplo = File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "Configuracion", "xolos-metricas.example.json"));
                var c = ConfiguracionMetricas.DesdeJson(ejemplo);
                Igual("http://localhost:3000/api/v1", c.UrlBase, "urlBase del ejemplo (local, nunca producción)");
                var problemas = string.Join("; ", c.Problemas());
                Verificar(problemas.Contains("juegoId vacío") && problemas.Contains("apiKey vacía"), "el ejemplo no trae juegoId ni apiKey: " + problemas);

                var e = new Entorno(ajustar: x => x.ApiKey = null);
                Verificar(!await e.Cliente.IniciarAsync(), "sin apiKey no inicia");
                Igual(EstadoCliente.Deshabilitado, e.Cliente.Estado, "estado con configuración inválida");

                var ok = await new Entorno().Activo();
                ok.Cliente.Error(new string('C', 80), new string('m', 600), true);
                ok.Cliente.Tick();
                var data = Data(ok.EventosEnviados.Last());
                Igual(64, ((string)data["codigo"]).Length, "codigo recortado a 64");
                Igual(500, ((string)data["mensaje"]).Length, "mensaje recortado a 500");
            }),
        };

        private static async Task<int> EjecutarPruebas()
        {
            var fallas = 0;
            foreach (var (nombre, prueba) in Casos)
            {
                try
                {
                    await prueba();
                    Console.WriteLine("  OK    " + nombre);
                }
                catch (Exception ex)
                {
                    fallas++;
                    Console.WriteLine("  FALLA " + nombre + "\n        " + ex.Message);
                }
            }
            Console.WriteLine();
            Console.WriteLine((Casos.Count - fallas) + "/" + Casos.Count + " pruebas OK");
            return fallas == 0 ? 0 : 1;
        }
    }
}
