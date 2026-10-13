// Prueba e2e: una partida simulada de La Casa del Bosque con el núcleo del SDK, por HTTP real,
// contra una API LOCAL. Así los JSON que genera el SDK pasan por el validador real de la API.
using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;

namespace EstudioXolos.Metricas.Pruebas
{
    public static class E2e
    {
        private sealed class RegistroConsola : IRegistro
        {
            public readonly List<string> Advertencias = new List<string>();
            public void Info(string m) { Console.WriteLine("    [info] " + m); }
            public void Advertencia(string m) { Advertencias.Add(m); Console.WriteLine("    [adv]  " + m); }
            public void Error(string m) { Console.WriteLine("    [error] " + m); }
        }

        public static async Task<int> Ejecutar(string[] args)
        {
            if (args.Length < 4)
            {
                Console.WriteLine("Uso: dotnet run --project Pruebas e2e <urlBase> <juegoId> <apiKey>");
                return 2;
            }
            var url = args[1];
            if (!url.StartsWith("http://localhost") && !url.StartsWith("http://127.0.0.1"))
            {
                Console.WriteLine("La prueba e2e solo corre contra una API local.");
                return 2;
            }
            var config = new ConfiguracionMetricas { UrlBase = url, JuegoId = args[2], ApiKey = args[3], BuildVersion = "1.0.1", Plataforma = "windows", TamanoLote = 15 };
            var transporte = new TransporteHttp();
            var almacen = new AlmacenMemoria();
            var registro = new RegistroConsola();
            var c = new ClienteMetricas(config, transporte, almacen, new RelojReal(), registro);
            c.EstablecerConsentimiento(true);

            Console.WriteLine("Partida simulada de La Casa del Bosque:");
            if (!await c.IniciarAsync()) { Console.WriteLine("No se pudo iniciar la sesión."); return 1; }

            // Nivel 1: casa abandonada (tutorial, una muerte, flor, logro).
            c.NivelInicio("casa_abandonada");
            c.TutorialCompletado("casa_abandonada");
            c.Logro("tutorial_superado");
            c.DialogoSaltado("abuela_intro", "casa_abandonada");
            c.Muerte("casa_abandonada", "fantasma", 46.2, 6.1);
            c.NivelInicio("casa_abandonada");
            c.FlorRecogida("casa_abandonada");
            c.NivelCompletado("casa_abandonada");
            c.Logro("casa_abandonada_completada");
            c.Rendimiento(58.3, 1800, "casa_abandonada");
            await Bombear(c);

            // Nivel 2: cuarto de hospital (pétalos, pausa, caída).
            c.NivelInicio("hospital_cuarto");
            for (var i = 1; i <= 4; i++) c.ColeccionableEncontrado("petalo_" + i, "hospital_cuarto");
            c.PausaInicio();
            c.PausaFin("hospital_cuarto");
            c.Inactividad(70000, "hospital_cuarto");
            c.Muerte("hospital_cuarto", "caida", 62.0, 1.8);
            c.NivelInicio("hospital_cuarto");
            c.FlorRecogida("hospital_cuarto");
            c.NivelCompletado("hospital_cuarto");
            c.Logro("hospital_cuarto_completado");
            await Bombear(c);

            // Nivel 3: habitación en llamas (piezas de carta → la_verdad, lava).
            c.NivelInicio("habitacion_llamas");
            for (var i = 1; i <= 4; i++) c.ColeccionableEncontrado("carta_pieza_" + i, "habitacion_llamas");
            c.Logro("la_verdad");
            c.Muerte("habitacion_llamas", "lava", 40.5, 1.2);
            c.NivelInicio("habitacion_llamas");
            c.Error("NULL_REF", "Referencia nula en el jefe (no fatal)", false);
            c.FlorRecogida("habitacion_llamas");
            c.NivelCompletado("habitacion_llamas");
            c.Logro("habitacion_llamas_completada");
            // Un tipo que el catálogo no tiene: la API lo rechaza y el SDK NO debe reintentarlo.
            c.Evento("palanca_activada", new Dictionary<string, object>());
            await Bombear(c);

            var cerrado = await c.CerrarAsync("cierre_normal", 10);

            // ---------- Verificación ----------
            var lotes = transporte.Peticiones.Where(p => p.Url.EndsWith("/eventos")).ToList();
            var enviados = lotes.SelectMany(p => p.Lote.Cast<Dictionary<string, object>>()).ToList();
            var respuestas = transporte.Respuestas.Skip(1).ToList();
            var aceptados = respuestas.Select(r => (Dictionary<string, object>)JsonLector.Parsear(r.Substring(4))).Sum(d => (int)(double)d["aceptados"]);
            var rechazados = respuestas.SelectMany(r => (List<object>)((Dictionary<string, object>)JsonLector.Parsear(r.Substring(4)))["rechazados"]).Cast<Dictionary<string, object>>().ToList();
            var palanca = enviados.Where(e => (string)e["tipo"] == "palanca_activada").ToList();

            var salida = Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "salida");
            Directory.CreateDirectory(salida);
            File.WriteAllText(Path.Combine(salida, "sesion.json"), transporte.Peticiones[0].Cuerpo);
            for (var i = 0; i < lotes.Count; i++) File.WriteAllText(Path.Combine(salida, "lote-" + (i + 1) + ".json"), lotes[i].Cuerpo);

            Console.WriteLine();
            Console.WriteLine("  Peticiones: 1 sesión + " + lotes.Count + " lotes; eventos enviados: " + enviados.Count);
            Console.WriteLine("  Respuestas: " + string.Join(" | ", respuestas.Select(r => r.Substring(0, Math.Min(r.Length, 70)))));
            var fallas = new List<string>();
            if (!respuestas.All(r => r.StartsWith("201"))) fallas.Add("no todas las respuestas fueron 201");
            if (aceptados != enviados.Count - 1) fallas.Add("aceptados " + aceptados + " ≠ enviados − 1 (" + (enviados.Count - 1) + ")");
            if (rechazados.Count != 1 || (string)rechazados[0]["codigo"] != "TIPO_NO_REGISTRADO") fallas.Add("se esperaba exactamente 1 rechazo TIPO_NO_REGISTRADO");
            if (palanca.Count != 1) fallas.Add("el evento rechazado se envió " + palanca.Count + " veces (debía ser 1: sin reintento)");
            if (enviados.Select(e => e["eventoId"]).Distinct().Count() != enviados.Count) fallas.Add("hay eventoId repetidos");
            if (!enviados.Select(e => (int)(double)e["secuencia"]).SequenceEqual(Enumerable.Range(1, enviados.Count))) fallas.Add("la secuencia no va de 1 en 1");
            if (!cerrado || (string)enviados.Last()["tipo"] != "sesion_fin") fallas.Add("no terminó con sesion_fin");
            if (lotes.Any(p => p.Lote.Count > 100)) fallas.Add("un lote superó 100 eventos");

            foreach (var f in fallas) Console.WriteLine("  FALLA " + f);
            Console.WriteLine(fallas.Count == 0
                ? "  OK: la API aceptó los " + aceptados + " eventos válidos del SDK, rechazó el inválido y el SDK no lo reintentó."
                : "  " + fallas.Count + " fallas.");
            return fallas.Count == 0 ? 0 : 1;
        }

        // Simula el Update de Unity: llama Tick hasta que no quede nada por enviar.
        private static async Task Bombear(ClienteMetricas c)
        {
            for (var i = 0; i < 200 && (c.EventosEnCola > 0 || c.Enviando); i++)
            {
                c.Tick();
                await Task.Delay(20);
            }
        }
    }
}
