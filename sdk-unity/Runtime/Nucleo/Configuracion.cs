// SDK de métricas de Estudio Xolos — núcleo sin dependencias de Unity.
using System;
using System.Collections.Generic;

namespace EstudioXolos.Metricas
{
    // Configuración del cliente. En Unity se lee de Resources/xolos-metricas.json (en .gitignore):
    // la API key y el juegoId NUNCA van en el código ni en el repositorio.
    public sealed class ConfiguracionMetricas
    {
        public string UrlBase = "http://localhost:3000/api/v1";
        public string JuegoId;
        public string ApiKey;
        public string BuildVersion;
        public string Plataforma;

        public int TamanoLote = 20;              // envía al juntar este número de eventos…
        public double IntervaloEnvioSegundos = 10; // …o cada este tiempo si hay eventos.
        public int MaxEventosPorPeticion = 100;  // límite de la API por lote.
        public int MaxEventosEnCola = 1000;      // tope de memoria; se descartan los más viejos.
        public int TimeoutSegundos = 60;         // la API gratuita puede tardar ~1 min en despertar.
        public double EsperaInicialSegundos = 2; // backoff: 2, 4, 8, 16, 32, 60, 60…
        public double EsperaMaximaSegundos = 60;

        public static readonly string[] PlataformasValidas = { "windows", "macos", "linux", "webgl", "android", "ios" };

        public List<string> Problemas()
        {
            var problemas = new List<string>();
            if (string.IsNullOrWhiteSpace(UrlBase)) problemas.Add("urlBase vacía");
            if (string.IsNullOrWhiteSpace(JuegoId)) problemas.Add("juegoId vacío");
            if (string.IsNullOrWhiteSpace(ApiKey)) problemas.Add("apiKey vacía");
            if (string.IsNullOrWhiteSpace(BuildVersion) || BuildVersion.Length > 32) problemas.Add("buildVersion debe tener 1-32 caracteres");
            if (Array.IndexOf(PlataformasValidas, Plataforma) < 0) problemas.Add("plataforma inválida: " + Plataforma);
            if (TamanoLote < 1 || TamanoLote > MaxEventosPorPeticion) problemas.Add("tamanoLote debe estar entre 1 y " + MaxEventosPorPeticion);
            if (MaxEventosPorPeticion < 1 || MaxEventosPorPeticion > 100) problemas.Add("maxEventosPorPeticion debe estar entre 1 y 100");
            if (TimeoutSegundos < 5) problemas.Add("timeoutSegundos debe ser al menos 5");
            return problemas;
        }

        // Lee el JSON de configuración (claves en camelCase, ver xolos-metricas.example.json).
        public static ConfiguracionMetricas DesdeJson(string json)
        {
            var d = JsonLector.Parsear(json) as Dictionary<string, object>;
            if (d == null) throw new FormatException("La configuración debe ser un objeto JSON.");
            var c = new ConfiguracionMetricas();
            c.UrlBase = Texto(d, "urlBase") ?? c.UrlBase;
            c.JuegoId = Texto(d, "juegoId");
            c.ApiKey = Texto(d, "apiKey");
            c.BuildVersion = Texto(d, "buildVersion");
            c.Plataforma = Texto(d, "plataforma");
            c.TamanoLote = (int)(Numero(d, "tamanoLote") ?? c.TamanoLote);
            c.IntervaloEnvioSegundos = Numero(d, "intervaloEnvioSegundos") ?? c.IntervaloEnvioSegundos;
            c.MaxEventosEnCola = (int)(Numero(d, "maxEventosEnCola") ?? c.MaxEventosEnCola);
            c.TimeoutSegundos = (int)(Numero(d, "timeoutSegundos") ?? c.TimeoutSegundos);
            c.EsperaInicialSegundos = Numero(d, "esperaInicialSegundos") ?? c.EsperaInicialSegundos;
            c.EsperaMaximaSegundos = Numero(d, "esperaMaximaSegundos") ?? c.EsperaMaximaSegundos;
            return c;
        }

        private static string Texto(Dictionary<string, object> d, string clave)
        {
            object v;
            var s = d.TryGetValue(clave, out v) ? v as string : null;
            return string.IsNullOrWhiteSpace(s) ? null : s.Trim();
        }

        private static double? Numero(Dictionary<string, object> d, string clave)
        {
            object v;
            return d.TryGetValue(clave, out v) && v is double n ? n : (double?)null;
        }
    }
}
