// SDK de métricas de Estudio Xolos — núcleo sin dependencias de Unity.
// Interfaces que la capa de Unity implementa (UnityWebRequest, PlayerPrefs, corrutinas,
// Debug.Log). Así la lógica del cliente se prueba fuera del motor.
using System;
using System.Collections.Generic;
using System.Globalization;
using System.Threading.Tasks;

namespace EstudioXolos.Metricas
{
    public sealed class ResultadoHttp
    {
        public int Estado;           // 0 si no hubo respuesta.
        public string Cuerpo;
        public bool ErrorDeRed;      // sin respuesta: red caída, DNS, timeout (API dormida)…
        public string RetryAfter;    // valor del header Retry-After, si vino.

        public static ResultadoHttp DeRed() { return new ResultadoHttp { ErrorDeRed = true }; }

        public static ResultadoHttp Con(int estado, string cuerpo, string retryAfter = null)
        {
            return new ResultadoHttp { Estado = estado, Cuerpo = cuerpo, RetryAfter = retryAfter };
        }

        // Retry-After en segundos (solo el formato numérico; la fecha HTTP se ignora).
        public double? RetryAfterSegundos
        {
            get
            {
                double s;
                if (RetryAfter != null && double.TryParse(RetryAfter, NumberStyles.Float, CultureInfo.InvariantCulture, out s) && s >= 0) return s;
                return null;
            }
        }
    }

    public interface ITransporte
    {
        Task<ResultadoHttp> EnviarAsync(string metodo, string url, string cuerpoJson, IDictionary<string, string> encabezados, int timeoutSegundos);
    }

    // Almacenamiento local persistente (PlayerPrefs en Unity).
    public interface IAlmacen
    {
        string Leer(string clave);
        void Guardar(string clave, string valor);
    }

    public interface IReloj
    {
        DateTime AhoraUtc { get; }
        Task Esperar(TimeSpan duracion);
    }

    public interface IRegistro
    {
        void Info(string mensaje);
        void Advertencia(string mensaje);
        void Error(string mensaje);
    }
}
