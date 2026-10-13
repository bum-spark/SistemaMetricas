// SDK de métricas de Estudio Xolos — núcleo sin dependencias de Unity.
using System;
using System.Collections.Generic;

namespace EstudioXolos.Metricas
{
    // Un evento ya armado (eventoId, secuencia y timestamp fijos desde que se creó: un reintento
    // reenvía exactamente lo mismo y la API descarta el duplicado por eventoId).
    public sealed class EventoPendiente
    {
        public string EventoId;
        public string SessionId; // null mientras la API no entrega el sessionId (se completa al enviar).
        public int Secuencia;
        public DateTime TimestampUtc;
        public string Tipo;
        public Dictionary<string, object> Data;
    }

    // Cola en memoria, FIFO, con tope: si se llena se descartan los eventos más viejos.
    public sealed class ColaEventos
    {
        private readonly List<EventoPendiente> eventos = new List<EventoPendiente>();
        private readonly int maximo;

        public ColaEventos(int maximo) { this.maximo = Math.Max(1, maximo); }

        public int Cantidad { get { return eventos.Count; } }
        public int Descartados { get; private set; }

        public void Encolar(EventoPendiente evento)
        {
            eventos.Add(evento);
            if (eventos.Count > maximo)
            {
                var sobran = eventos.Count - maximo;
                eventos.RemoveRange(0, sobran);
                Descartados += sobran;
            }
        }

        // Los primeros N sin quitarlos: se confirman solo si la API respondió.
        public List<EventoPendiente> VerPrimeros(int n)
        {
            return eventos.GetRange(0, Math.Min(n, eventos.Count));
        }

        // Quita exactamente los eventos enviados (por referencia, no por posición): si mientras el
        // lote viajaba la cola descartó los más viejos, las posiciones ya no coinciden.
        public void Confirmar(IEnumerable<EventoPendiente> enviados)
        {
            var conjunto = new HashSet<EventoPendiente>(enviados);
            eventos.RemoveAll(conjunto.Contains);
        }

        public void Vaciar() { eventos.Clear(); }

        public IEnumerable<EventoPendiente> Todos() { return eventos; }
    }

    // ESQUEMA_EVENTOS.md §1.3 (R-06): reintenta ante fallo de red, 429 y 5xx con espera
    // creciente; nunca ante otros 4xx ni por eventos rechazados.
    public static class PoliticaReintentos
    {
        public static bool DebeReintentar(ResultadoHttp r)
        {
            return r.ErrorDeRed || r.Estado == 429 || r.Estado >= 500;
        }

        // Espera exponencial con tope y "jitter" (entre 50 % y 100 % del valor) para que muchos
        // jugadores no reintenten todos en el mismo segundo. Retry-After manda si es mayor.
        public static TimeSpan Espera(int intento, double esperaInicial, double esperaMaxima, Random azar, double? retryAfter = null)
        {
            var exponente = Math.Min(Math.Max(intento, 1) - 1, 20);
            var baseSegundos = Math.Min(esperaMaxima, esperaInicial * Math.Pow(2, exponente));
            var conJitter = baseSegundos * (0.5 + 0.5 * azar.NextDouble());
            var segundos = retryAfter.HasValue ? Math.Max(conJitter, Math.Min(retryAfter.Value, esperaMaxima)) : conJitter;
            return TimeSpan.FromSeconds(segundos);
        }
    }
}
