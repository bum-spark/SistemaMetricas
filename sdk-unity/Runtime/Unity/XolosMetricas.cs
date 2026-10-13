// SDK de métricas de Estudio Xolos — punto de entrada para el juego (docs/SDK_UNITY.md).
using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using UnityEngine;

namespace EstudioXolos.Metricas.Unity
{
    // Uso:
    //   XolosMetricas.EstablecerConsentimiento(true);  // después del aviso de privacidad
    //   XolosMetricas.Iniciar();                        // al arrancar el juego
    //   XolosMetricas.NivelInicio("casa_abandonada");   // y el resto de eventos
    // El componente se crea solo (DontDestroyOnLoad) la primera vez que se usa.
    [DisallowMultipleComponent]
    public sealed class XolosMetricas : MonoBehaviour
    {
        // Resources/xolos-metricas.json: urlBase, juegoId y apiKey. Está en .gitignore.
        public const string RecursoConfiguracion = "xolos-metricas";
        public const double SegundosParaCerrar = 4;

        private static XolosMetricas instancia;
        private ClienteMetricas cliente;
        private IRegistro registro;
        private bool cerrando;
        private bool cerrado;

        public static XolosMetricas Instancia
        {
            get
            {
                if (instancia == null)
                {
                    var objeto = new GameObject("XolosMetricas");
                    instancia = objeto.AddComponent<XolosMetricas>();
                }
                return instancia;
            }
        }

        public static ClienteMetricas Cliente { get { return Instancia.cliente; } }

        private void Awake()
        {
            if (instancia != null && instancia != this)
            {
                Destroy(gameObject);
                return;
            }
            instancia = this;
            DontDestroyOnLoad(gameObject);
            registro = new RegistroUnity();
            cliente = new ClienteMetricas(LeerConfiguracion(), new TransporteUnity(), new AlmacenPlayerPrefs(), new RelojUnity(this), registro);
            Application.wantsToQuit += AlQuererSalir;
        }

        private ConfiguracionMetricas LeerConfiguracion()
        {
            ConfiguracionMetricas config;
            var archivo = Resources.Load<TextAsset>(RecursoConfiguracion);
            if (archivo == null)
            {
                registro.Error("No existe Resources/" + RecursoConfiguracion + ".json: copia xolos-metricas.example.json y llena juegoId y apiKey.");
                config = new ConfiguracionMetricas();
            }
            else
            {
                try
                {
                    config = ConfiguracionMetricas.DesdeJson(archivo.text);
                }
                catch (FormatException ex)
                {
                    registro.Error("Resources/" + RecursoConfiguracion + ".json no es JSON válido: " + ex.Message);
                    config = new ConfiguracionMetricas();
                }
            }
            if (string.IsNullOrEmpty(config.BuildVersion)) config.BuildVersion = Application.version;
            if (string.IsNullOrEmpty(config.Plataforma)) config.Plataforma = PlataformaActual();
            return config;
        }

        public static string PlataformaActual()
        {
            switch (Application.platform)
            {
                case RuntimePlatform.OSXPlayer:
                case RuntimePlatform.OSXEditor:
                    return "macos";
                case RuntimePlatform.LinuxPlayer:
                case RuntimePlatform.LinuxEditor:
                    return "linux";
                case RuntimePlatform.Android:
                    return "android";
                case RuntimePlatform.IPhonePlayer:
                    return "ios";
                case RuntimePlatform.WebGLPlayer:
                    return "webgl";
                default:
                    return "windows";
            }
        }

        private void Update()
        {
            if (cliente != null) cliente.Tick();
        }

        // En móviles el juego puede morir en segundo plano: se manda lo pendiente al pausar.
        private void OnApplicationPause(bool enPausa)
        {
            if (enPausa && cliente != null) Lanzar(cliente.VaciarAsync(3));
        }

        // Al cerrar: se detiene el cierre, se manda sesion_fin y lo pendiente (máx. ~4 s) y se cierra.
        private bool AlQuererSalir()
        {
            if (cerrado || cliente == null || cliente.Estado != EstadoCliente.Activo) return true;
            if (!cerrando)
            {
                cerrando = true;
                Lanzar(CerrarYSalir("cierre_normal"));
            }
            return false;
        }

        private async Task CerrarYSalir(string motivo)
        {
            try
            {
                await cliente.CerrarAsync(motivo, SegundosParaCerrar);
            }
            finally
            {
                cerrado = true;
                Application.Quit();
            }
        }

        private void OnDestroy()
        {
            Application.wantsToQuit -= AlQuererSalir;
            if (instancia == this) instancia = null;
        }

        private void Lanzar(Task tarea)
        {
            tarea.ContinueWith(t =>
            {
                if (t.Exception != null && registro != null) registro.Error("Error interno del SDK: " + t.Exception.GetBaseException().Message);
            }, TaskContinuationOptions.OnlyOnFaulted);
        }

        // ---------- Fachada estática ----------

        public static bool? Consentimiento { get { return Cliente.Consentimiento; } }

        public static void EstablecerConsentimiento(bool acepta) { Cliente.EstablecerConsentimiento(acepta); }

        public static void Iniciar() { Instancia.Lanzar(Cliente.IniciarAsync()); }

        // Salir desde el menú: sesion_fin con motivo "menu_salir" y cierra el juego.
        public static void SalirDesdeMenu()
        {
            var yo = Instancia;
            if (yo.cerrando) return;
            yo.cerrando = true;
            yo.Lanzar(yo.CerrarYSalir("menu_salir"));
        }

        public static void NivelInicio(string nivelId) { Cliente.NivelInicio(nivelId); }
        public static void Muerte(string nivelId, string causa, Vector2 posicion) { Cliente.Muerte(nivelId, causa, posicion.x, posicion.y); }
        public static void NivelCompletado(string nivelId) { Cliente.NivelCompletado(nivelId); }
        public static void NivelAbandonado(string nivelId) { Cliente.NivelAbandonado(nivelId); }
        public static void Logro(string logroId) { Cliente.Logro(logroId); }
        public static void PausaInicio() { Cliente.PausaInicio(); }
        public static void PausaFin(string nivelId = null) { Cliente.PausaFin(nivelId); }
        public static void Inactividad(long duracionMs, string nivelId = null) { Cliente.Inactividad(duracionMs, nivelId); }
        public static void Error(string codigo, string mensaje, bool fatal) { Cliente.Error(codigo, mensaje, fatal); }
        public static void Rendimiento(double fpsPromedio, long? tiempoCargaMs = null, string nivelId = null) { Cliente.Rendimiento(fpsPromedio, tiempoCargaMs, nivelId); }
        public static void FlorRecogida(string nivelId) { Cliente.FlorRecogida(nivelId); }
        public static void DialogoSaltado(string dialogoId, string nivelId) { Cliente.DialogoSaltado(dialogoId, nivelId); }
        public static void ColeccionableEncontrado(string coleccionableId, string nivelId) { Cliente.ColeccionableEncontrado(coleccionableId, nivelId); }
        public static void TutorialCompletado(string nivelIdDelTutorial) { Cliente.TutorialCompletado(nivelIdDelTutorial); }
        public static void Evento(string tipo, Dictionary<string, object> data) { Cliente.Evento(tipo, data); }
    }
}
