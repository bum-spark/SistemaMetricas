// Dobles de prueba: transporte con respuestas programadas, reloj manual, almacén en memoria.
using System;
using System.Collections.Generic;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Threading.Tasks;

namespace EstudioXolos.Metricas.Pruebas
{
    public sealed class Peticion
    {
        public string Metodo;
        public string Url;
        public string Cuerpo;
        public Dictionary<string, string> Encabezados;
        public int Timeout;
        public DateTime EnviadaEn;

        public List<object> Lote { get { return (List<object>)JsonLector.Parsear(Cuerpo); } }
        public Dictionary<string, object> Objeto { get { return (Dictionary<string, object>)JsonLector.Parsear(Cuerpo); } }
    }

    public sealed class TransporteFalso : ITransporte
    {
        public readonly List<Peticion> Peticiones = new List<Peticion>();
        private readonly Queue<Func<Peticion, Task<ResultadoHttp>>> programadas = new Queue<Func<Peticion, Task<ResultadoHttp>>>();
        private readonly RelojFalso reloj;

        public TransporteFalso(RelojFalso reloj) { this.reloj = reloj; }

        // Respuesta para la siguiente petición; si no hay programada: 201 con todo aceptado.
        public TransporteFalso Responder(Func<Peticion, ResultadoHttp> respuesta) { programadas.Enqueue(p => Task.FromResult(respuesta(p))); return this; }
        public TransporteFalso Responder(ResultadoHttp r) { return Responder(_ => r); }
        // Respuesta que llega cuando la prueba completa la tarea (simula una petición en vuelo).
        public TransporteFalso ResponderDespues(Task<ResultadoHttp> tarea) { programadas.Enqueue(_ => tarea); return this; }

        public static readonly string SessionIdDePrueba = "0b9e4c7a-1d2f-4a3b-9c8d-7e6f5a4b3c2d";

        public Task<ResultadoHttp> EnviarAsync(string metodo, string url, string cuerpoJson, IDictionary<string, string> encabezados, int timeoutSegundos)
        {
            var p = new Peticion { Metodo = metodo, Url = url, Cuerpo = cuerpoJson, Encabezados = new Dictionary<string, string>(encabezados), Timeout = timeoutSegundos, EnviadaEn = reloj.AhoraUtc };
            Peticiones.Add(p);
            if (programadas.Count > 0) return programadas.Dequeue()(p);
            if (url.EndsWith("/sesiones")) return Task.FromResult(ResultadoHttp.Con(201, "{\"sessionId\":\"" + SessionIdDePrueba + "\"}"));
            return Task.FromResult(ResultadoHttp.Con(201, "{\"aceptados\":" + p.Lote.Count + ",\"rechazados\":[]}"));
        }

        public List<Peticion> DeEventos { get { return Peticiones.Where(x => x.Url.EndsWith("/eventos")).ToList(); } }
        public List<Peticion> DeSesiones { get { return Peticiones.Where(x => x.Url.EndsWith("/sesiones")).ToList(); } }
    }

    // El tiempo solo avanza cuando la prueba lo pide (o cuando el SDK "espera").
    public sealed class RelojFalso : IReloj
    {
        public DateTime AhoraUtc { get; private set; } = new DateTime(2026, 10, 12, 18, 0, 0, DateTimeKind.Utc);
        public readonly List<TimeSpan> Esperas = new List<TimeSpan>();

        public void Avanzar(TimeSpan t) { AhoraUtc += t; }

        public Task Esperar(TimeSpan duracion)
        {
            Esperas.Add(duracion);
            AhoraUtc += duracion;
            return Task.CompletedTask;
        }
    }

    public sealed class AlmacenMemoria : IAlmacen
    {
        public readonly Dictionary<string, string> Datos = new Dictionary<string, string>();
        public string Leer(string clave) { string v; return Datos.TryGetValue(clave, out v) ? v : null; }
        public void Guardar(string clave, string valor) { Datos[clave] = valor; }
    }

    public sealed class RegistroMemoria : IRegistro
    {
        public readonly List<string> Lineas = new List<string>();
        public void Info(string m) { Lineas.Add("INFO " + m); }
        public void Advertencia(string m) { Lineas.Add("ADV " + m); }
        public void Error(string m) { Lineas.Add("ERROR " + m); }
        public string Todo { get { return string.Join("\n", Lineas); } }
    }

    // Transporte real con HttpClient, para la prueba contra la API local (modo e2e).
    public sealed class TransporteHttp : ITransporte
    {
        private static readonly HttpClient Cliente = new HttpClient();
        public readonly List<Peticion> Peticiones = new List<Peticion>();
        public readonly List<string> Respuestas = new List<string>();

        public async Task<ResultadoHttp> EnviarAsync(string metodo, string url, string cuerpoJson, IDictionary<string, string> encabezados, int timeoutSegundos)
        {
            Peticiones.Add(new Peticion { Metodo = metodo, Url = url, Cuerpo = cuerpoJson, Encabezados = new Dictionary<string, string>(encabezados), Timeout = timeoutSegundos });
            using (var mensaje = new HttpRequestMessage(new HttpMethod(metodo), url))
            using (var cts = new System.Threading.CancellationTokenSource(TimeSpan.FromSeconds(timeoutSegundos)))
            {
                mensaje.Content = new StringContent(cuerpoJson ?? "", Encoding.UTF8, "application/json");
                foreach (var par in encabezados)
                {
                    if (par.Key != "Content-Type") mensaje.Headers.TryAddWithoutValidation(par.Key, par.Value);
                }
                try
                {
                    using (var r = await Cliente.SendAsync(mensaje, cts.Token))
                    {
                        var cuerpo = await r.Content.ReadAsStringAsync();
                        Respuestas.Add((int)r.StatusCode + " " + cuerpo);
                        IEnumerable<string> retry;
                        return ResultadoHttp.Con((int)r.StatusCode, cuerpo, r.Headers.TryGetValues("Retry-After", out retry) ? retry.FirstOrDefault() : null);
                    }
                }
                catch (Exception ex) when (ex is HttpRequestException || ex is TaskCanceledException)
                {
                    Respuestas.Add("SIN RESPUESTA " + ex.GetType().Name);
                    return ResultadoHttp.DeRed();
                }
            }
        }
    }

    public sealed class RelojReal : IReloj
    {
        public DateTime AhoraUtc { get { return DateTime.UtcNow; } }
        public Task Esperar(TimeSpan duracion) { return Task.Delay(duracion); }
    }
}
