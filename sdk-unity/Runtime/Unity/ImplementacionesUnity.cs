// SDK de métricas de Estudio Xolos — implementaciones con APIs de Unity.
using System;
using System.Collections;
using System.Collections.Generic;
using System.Text;
using System.Threading.Tasks;
using UnityEngine;
using UnityEngine.Networking;

namespace EstudioXolos.Metricas.Unity
{
    // HTTP con UnityWebRequest (funciona en todas las plataformas sin paquetes extra).
    public sealed class TransporteUnity : ITransporte
    {
        public Task<ResultadoHttp> EnviarAsync(string metodo, string url, string cuerpoJson, IDictionary<string, string> encabezados, int timeoutSegundos)
        {
            var tcs = new TaskCompletionSource<ResultadoHttp>();
            var peticion = new UnityWebRequest(url, metodo)
            {
                uploadHandler = new UploadHandlerRaw(Encoding.UTF8.GetBytes(cuerpoJson ?? string.Empty)),
                downloadHandler = new DownloadHandlerBuffer(),
                // Largo a propósito: la API en el plan gratuito puede tardar ~1 min en despertar.
                timeout = timeoutSegundos,
            };
            foreach (var par in encabezados) peticion.SetRequestHeader(par.Key, par.Value);

            var operacion = peticion.SendWebRequest();
            operacion.completed += _ =>
            {
                try
                {
                    // ConnectionError = sin respuesta (red, DNS, timeout); ProtocolError = 4xx/5xx con código.
                    var sinRespuesta = peticion.result == UnityWebRequest.Result.ConnectionError || peticion.responseCode == 0;
                    tcs.TrySetResult(sinRespuesta
                        ? ResultadoHttp.DeRed()
                        : ResultadoHttp.Con((int)peticion.responseCode, peticion.downloadHandler != null ? peticion.downloadHandler.text : null, peticion.GetResponseHeader("Retry-After")));
                }
                catch (Exception)
                {
                    tcs.TrySetResult(ResultadoHttp.DeRed());
                }
                finally
                {
                    peticion.Dispose();
                }
            };
            return tcs.Task;
        }
    }

    // playerId y consentimiento persistidos entre partidas.
    public sealed class AlmacenPlayerPrefs : IAlmacen
    {
        public string Leer(string clave)
        {
            return PlayerPrefs.HasKey(clave) ? PlayerPrefs.GetString(clave) : null;
        }

        public void Guardar(string clave, string valor)
        {
            PlayerPrefs.SetString(clave, valor);
            PlayerPrefs.Save();
        }
    }

    // Esperas con corrutinas en tiempo real (no se afectan por Time.timeScale = 0 en la pausa).
    public sealed class RelojUnity : IReloj
    {
        private readonly MonoBehaviour anfitrion;

        public RelojUnity(MonoBehaviour anfitrion) { this.anfitrion = anfitrion; }

        public DateTime AhoraUtc { get { return DateTime.UtcNow; } }

        public Task Esperar(TimeSpan duracion)
        {
            var tcs = new TaskCompletionSource<bool>();
            anfitrion.StartCoroutine(EsperarCorrutina(duracion, tcs));
            return tcs.Task;
        }

        private static IEnumerator EsperarCorrutina(TimeSpan duracion, TaskCompletionSource<bool> tcs)
        {
            yield return new WaitForSecondsRealtime((float)duracion.TotalSeconds);
            tcs.TrySetResult(true);
        }
    }

    public sealed class RegistroUnity : IRegistro
    {
        private const string Prefijo = "[XolosMetricas] ";

        public void Info(string mensaje) { Debug.Log(Prefijo + mensaje); }
        public void Advertencia(string mensaje) { Debug.LogWarning(Prefijo + mensaje); }
        public void Error(string mensaje) { Debug.LogError(Prefijo + mensaje); }
    }
}
