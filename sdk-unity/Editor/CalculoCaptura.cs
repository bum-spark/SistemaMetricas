// Cálculos de la captura de un nivel para el mapa de calor (docs/MAPAS_NIVELES.md), en C# puro
// (sin UnityEngine) para poder probarlos fuera de Unity. Los usa CapturaNivelXolos.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text.RegularExpressions;

namespace EstudioXolos.Metricas.Editor
{
    // Límites del nivel en unidades de MUNDO de Unity, con el eje Y hacia arriba: el mismo sistema
    // que transform.position, que es lo que el SDK manda como x, y de cada muerte
    // (XolosMetricas.Muerte(nivelId, causa, transform.position)).
    public readonly struct LimitesNivel
    {
        public readonly double MinX, MaxX, MinY, MaxY;

        public LimitesNivel(double minX, double maxX, double minY, double maxY)
        {
            MinX = minX; MaxX = maxX; MinY = minY; MaxY = maxY;
        }

        public double Ancho => MaxX - MinX;
        public double Alto => MaxY - MinY;
        public bool Valido => MinX < MaxX && MinY < MaxY;
    }

    public static class CalculoCaptura
    {
        // Mismo patrón que el catálogo de la API (PATRON_ID_CATALOGO: snake_case).
        private static readonly Regex IdCatalogo = new Regex("^[a-z0-9]+(_[a-z0-9]+)*$");

        public static bool NivelIdValido(string nivelId) => nivelId != null && IdCatalogo.IsMatch(nivelId);

        // Caja que contiene todos los puntos (por ejemplo, las esquinas en mundo de todas las celdas
        // ocupadas de todos los Tilemaps incluidos). null si no hay puntos.
        public static LimitesNivel? DesdePuntos(IEnumerable<(double x, double y)> puntos)
        {
            double minX = double.PositiveInfinity, maxX = double.NegativeInfinity, minY = double.PositiveInfinity, maxY = double.NegativeInfinity;
            var alguno = false;
            foreach (var (x, y) in puntos)
            {
                alguno = true;
                minX = Math.Min(minX, x); maxX = Math.Max(maxX, x);
                minY = Math.Min(minY, y); maxY = Math.Max(maxY, y);
            }
            return alguno ? new LimitesNivel(minX, maxX, minY, maxY) : (LimitesNivel?)null;
        }

        public static LimitesNivel ConMargen(LimitesNivel l, double margen) =>
            new LimitesNivel(l.MinX - margen, l.MaxX + margen, l.MinY - margen, l.MaxY + margen);

        // Tamaño en píxeles: pixelesPorUnidad del juego, sin pasar de anchoMaximo (docs/IMAGENES.md).
        // El alto sale del ancho para que la proporción de la imagen sea la de los límites.
        public static (int ancho, int alto) Pixeles(LimitesNivel l, double pixelesPorUnidad, int anchoMaximo)
        {
            if (!l.Valido) throw new ArgumentException("Límites vacíos o invertidos.");
            if (pixelesPorUnidad <= 0) throw new ArgumentException("pixelesPorUnidad debe ser mayor que 0.");
            var ancho = (int)Math.Round(l.Ancho * pixelesPorUnidad);
            ancho = Math.Max(1, Math.Min(anchoMaximo, ancho));
            var alto = Math.Max(1, (int)Math.Round(ancho * l.Alto / l.Ancho));
            return (ancho, alto);
        }

        // Diferencia relativa entre la proporción de la imagen y la de los límites (la misma cuenta que
        // hace actualizar-juego para avisar si pasa de 2 %).
        public static double DiferenciaProporcion(LimitesNivel l, int anchoPx, int altoPx) =>
            Math.Abs(((double)anchoPx / altoPx) / (l.Ancho / l.Alto) - 1);

        // Formato EXACTO de --limites: minX,maxX,minY,maxY con punto decimal (cultura invariante:
        // con una cultura de coma decimal, como es-ES, 12.5 saldría "12,5" y rompería la lista) y
        // hasta 3 decimales.
        public static string FormatoLimites(LimitesNivel l) =>
            string.Join(",", Numero(l.MinX), Numero(l.MaxX), Numero(l.MinY), Numero(l.MaxY));

        // Comando listo para copiar. Usa "--limites=" para que un minX negativo no se confunda con una opción.
        public static string Comando(string slug, string nivelId, string extension, LimitesNivel l) =>
            "npm run actualizar-juego -- --juego " + slug + " --nivel " + nivelId +
            " --imagen-url /niveles/" + slug + "/" + nivelId + "." + extension +
            " --limites=" + FormatoLimites(l);

        private static string Numero(double v)
        {
            var redondeado = Math.Round(v, 3, MidpointRounding.AwayFromZero);
            if (redondeado == 0) redondeado = 0; // evita "-0"
            return redondeado.ToString("0.###", CultureInfo.InvariantCulture);
        }
    }
}
