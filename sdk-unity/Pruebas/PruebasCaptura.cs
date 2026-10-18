// Pruebas de los cálculos de la herramienta de captura de nivel (Editor/CalculoCaptura.cs), fuera de Unity.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Threading.Tasks;
using EstudioXolos.Metricas.Editor;

namespace EstudioXolos.Metricas.Pruebas
{
    public static class PruebasCaptura
    {
        private static void Igual<T>(T esperado, T real, string que)
        {
            if (!EqualityComparer<T>.Default.Equals(esperado, real)) throw new Exception(que + ": se esperaba <" + esperado + "> y llegó <" + real + ">");
        }

        public static readonly List<(string nombre, Func<Task> prueba)> Casos = new List<(string, Func<Task>)>
        {
            ("Captura: límites = unión de las esquinas de las celdas de varios Tilemaps (Y hacia arriba)", () =>
            {
                // Suelo de x 0..120, y 0..2 y plataformas de x 10..30, y 8..10 (otro Tilemap).
                var puntos = new List<(double, double)> { (0, 0), (120, 0), (0, 2), (120, 2), (10, 8), (30, 8), (10, 10), (30, 10) };
                var l = CalculoCaptura.DesdePuntos(puntos).Value;
                Igual("0,120,0,10", CalculoCaptura.FormatoLimites(l), "límites unidos");
                Igual(false, CalculoCaptura.DesdePuntos(new List<(double, double)>()).HasValue, "sin celdas no hay límites");
                Igual("-1,121,-1,11", CalculoCaptura.FormatoLimites(CalculoCaptura.ConMargen(l, 1)), "margen en los 4 lados");
                return Task.CompletedTask;
            }),
            ("Captura: formato exacto de --limites con punto decimal aunque la cultura use coma, sin -0", () =>
            {
                var antes = CultureInfo.CurrentCulture;
                try
                {
                    CultureInfo.CurrentCulture = CultureInfo.GetCultureInfo("es-ES");
                    Igual("12,5", 12.5.ToString(), "la cultura es-ES usaría coma");
                    var l = new LimitesNivel(-2.25, 118.1234, -0.0001, 30);
                    Igual("-2.25,118.123,0,30", CalculoCaptura.FormatoLimites(l), "punto decimal, 3 decimales y sin -0");
                    Igual("npm run actualizar-juego -- --juego la-casa-del-bosque --nivel casa_abandonada --imagen-url /niveles/la-casa-del-bosque/casa_abandonada.webp --limites=-2.25,118.123,0,30",
                        CalculoCaptura.Comando("la-casa-del-bosque", "casa_abandonada", "webp", l), "comando con --limites= (minX negativo)");
                }
                finally { CultureInfo.CurrentCulture = antes; }
                return Task.CompletedTask;
            }),
            ("Captura: píxeles con la proporción de los límites y sin pasar de 1920 de ancho", () =>
            {
                var l = new LimitesNivel(0, 120, 0, 30);
                Igual((1920, 480), CalculoCaptura.Pixeles(l, 32, 1920), "120 u × 32 px = 3840 → recortado a 1920");
                Igual((1200, 300), CalculoCaptura.Pixeles(l, 10, 1920), "sin recorte");
                var raro = new LimitesNivel(0, 97.3, 0, 31.1);
                var (ancho, alto) = CalculoCaptura.Pixeles(raro, 16, 1920);
                Igual(true, CalculoCaptura.DiferenciaProporcion(raro, ancho, alto) < 0.002, "el redondeo a píxeles deja la proporción dentro de 0.2 % (el script avisa con 2 %)");
                return Task.CompletedTask;
            }),
            ("Captura: nivelId con el mismo patrón que el catálogo", () =>
            {
                Igual(true, CalculoCaptura.NivelIdValido("casa_abandonada"), "snake_case");
                Igual(false, CalculoCaptura.NivelIdValido("Casa Abandonada"), "espacios y mayúsculas");
                Igual(false, CalculoCaptura.NivelIdValido(""), "vacío");
                return Task.CompletedTask;
            }),
        };
    }
}
