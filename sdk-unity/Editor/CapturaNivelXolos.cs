// Herramientas → Xolos → Capturar nivel para el mapa de calor (docs/MAPAS_NIVELES.md).
// Captura el nivel abierto completo con una cámara ortográfica temporal y calcula sus límites en
// unidades de MUNDO desde los Tilemaps, con el eje Y hacia arriba: el mismo sistema que
// transform.position, que es lo que el SDK manda como x, y de cada muerte. Imprime los límites en
// el formato exacto de --limites del script actualizar-juego.
//
// Varios Tilemaps: los límites son la UNIÓN de las celdas ocupadas de los Tilemaps marcados. Por
// defecto se marcan los activos con TilemapRenderer habilitado (lo que se ve); los de solo
// colisión (sin renderer o con el renderer apagado) quedan fuera y se pueden marcar a mano. La
// cámara dibuja TODO lo que haya dentro de ese rectángulo (sprites de fondo incluidos), no solo
// los Tilemaps.
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEngine;
using UnityEngine.Tilemaps;

namespace EstudioXolos.Metricas.Editor
{
    public sealed class CapturaNivelXolos : EditorWindow
    {
        // docs/IMAGENES.md: las imágenes de nivel van a 1920 px de ancho como máximo.
        private const int AnchoMaximo = 1920;
        private const string CarpetaSalida = "CapturasXolos";

        private string slug = "la-casa-del-bosque";
        private string nivelId = "";
        private int pixelesPorUnidad = 32;
        private float margen;
        private bool fondoTransparente = true;
        private Color colorFondo = new Color(0.055f, 0.063f, 0.075f, 1f);
        private bool incluirCapaUi;
        private Vector2 desplazamiento;
        private readonly List<(Tilemap mapa, bool incluido)> tilemaps = new List<(Tilemap, bool)>();
        private LimitesNivel? limites;
        private string mensaje = "";

        [MenuItem("Herramientas/Xolos/Capturar nivel para el mapa de calor")]
        private static void Abrir()
        {
            GetWindow<CapturaNivelXolos>("Captura de nivel");
        }

        private void OnEnable() { Refrescar(); }

        private void OnHierarchyChange() { Refrescar(); Repaint(); }

        // Tilemaps de la escena abierta; conserva lo que el usuario ya marcó o desmarcó.
        private void Refrescar()
        {
            var previos = tilemaps.Where(t => t.mapa != null).ToDictionary(t => t.mapa, t => t.incluido);
#if UNITY_2023_1_OR_NEWER
            var actuales = FindObjectsByType<Tilemap>(FindObjectsInactive.Exclude, FindObjectsSortMode.None);
#else
            var actuales = FindObjectsOfType<Tilemap>();
#endif
            tilemaps.Clear();
            foreach (var t in actuales.OrderBy(t => t.name))
            {
                tilemaps.Add((t, previos.TryGetValue(t, out var marcado) ? marcado : SeVe(t)));
            }
        }

        private static bool SeVe(Tilemap t)
        {
            var renderer = t.GetComponent<TilemapRenderer>();
            return t.isActiveAndEnabled && renderer != null && renderer.enabled;
        }

        private void OnGUI()
        {
            EditorGUILayout.LabelField("Nivel", EditorStyles.boldLabel);
            slug = EditorGUILayout.TextField("Slug del juego", slug);
            nivelId = EditorGUILayout.TextField("nivelId del catálogo", nivelId);
            pixelesPorUnidad = EditorGUILayout.IntField(new GUIContent("Píxeles por unidad", "El Pixels Per Unit de los sprites del nivel. El ancho final no pasa de 1920 px."), pixelesPorUnidad);
            margen = EditorGUILayout.FloatField(new GUIContent("Margen (unidades)", "Se suma a los cuatro lados; úsalo si hay sprites que sobresalen de su celda."), margen);
            fondoTransparente = EditorGUILayout.Toggle("Fondo transparente", fondoTransparente);
            if (!fondoTransparente) colorFondo = EditorGUILayout.ColorField("Color de fondo", colorFondo);
            incluirCapaUi = EditorGUILayout.Toggle("Incluir la capa UI", incluirCapaUi);

            EditorGUILayout.Space();
            EditorGUILayout.LabelField("Tilemaps que definen los límites", EditorStyles.boldLabel);
            if (tilemaps.Count == 0) EditorGUILayout.HelpBox("No hay Tilemaps activos en la escena abierta.", MessageType.Warning);
            desplazamiento = EditorGUILayout.BeginScrollView(desplazamiento, GUILayout.MaxHeight(160));
            for (var i = 0; i < tilemaps.Count; i++)
            {
                var (mapa, incluido) = tilemaps[i];
                if (mapa == null) continue;
                var etiqueta = mapa.name + (SeVe(mapa) ? "" : "  (no se ve: solo colisión o apagado)");
                tilemaps[i] = (mapa, EditorGUILayout.ToggleLeft(etiqueta, incluido));
            }
            EditorGUILayout.EndScrollView();

            EditorGUILayout.Space();
            if (GUILayout.Button("Calcular límites")) Calcular();
            using (new EditorGUI.DisabledScope(!limites.HasValue || !CalculoCaptura.NivelIdValido(nivelId)))
            {
                if (GUILayout.Button("Capturar PNG")) Capturar();
            }
            if (!string.IsNullOrEmpty(nivelId) && !CalculoCaptura.NivelIdValido(nivelId))
            {
                EditorGUILayout.HelpBox("nivelId debe estar en snake_case, igual que en el catálogo (ej. casa_abandonada).", MessageType.Error);
            }

            if (limites.HasValue)
            {
                var l = limites.Value;
                var (ancho, alto) = CalculoCaptura.Pixeles(l, pixelesPorUnidad, AnchoMaximo);
                EditorGUILayout.Space();
                EditorGUILayout.LabelField("Límites (minX,maxX,minY,maxY), mundo, Y hacia arriba", EditorStyles.boldLabel);
                EditorGUILayout.SelectableLabel(CalculoCaptura.FormatoLimites(l), EditorStyles.textField, GUILayout.Height(EditorGUIUtility.singleLineHeight));
                EditorGUILayout.LabelField("Tamaño de la captura", ancho + " × " + alto + " px");
                if (GUILayout.Button("Copiar --limites")) EditorGUIUtility.systemCopyBuffer = "--limites=" + CalculoCaptura.FormatoLimites(l);
                if (CalculoCaptura.NivelIdValido(nivelId) && GUILayout.Button("Copiar comando de actualizar-juego"))
                {
                    EditorGUIUtility.systemCopyBuffer = CalculoCaptura.Comando(slug, nivelId, "webp", l);
                }
            }
            if (!string.IsNullOrEmpty(mensaje)) EditorGUILayout.HelpBox(mensaje, MessageType.Info);
        }

        // Unión de las esquinas en mundo de cada celda ocupada de los Tilemaps marcados.
        private void Calcular()
        {
            var puntos = new List<(double x, double y)>();
            var avisos = new List<string>();
            foreach (var (mapa, incluido) in tilemaps)
            {
                if (!incluido || mapa == null) continue;
                if (mapa.layoutGrid != null && mapa.layoutGrid.cellLayout != GridLayout.CellLayout.Rectangle)
                {
                    avisos.Add(mapa.name + ": la cuadrícula no es rectangular; los límites pueden no ser exactos.");
                }
                var celdas = 0;
                foreach (var celda in mapa.cellBounds.allPositionsWithin)
                {
                    if (!mapa.HasTile(celda)) continue;
                    celdas++;
                    // Las 4 esquinas: cubre la posición, escala y rotación del Tilemap y del Grid.
                    foreach (var esquina in new[] { Vector3Int.zero, Vector3Int.right, Vector3Int.up, Vector3Int.right + Vector3Int.up })
                    {
                        var p = mapa.CellToWorld(celda + esquina);
                        puntos.Add((p.x, p.y));
                    }
                }
                if (celdas == 0) avisos.Add(mapa.name + ": no tiene tiles; no aporta a los límites.");
            }
            var calculados = CalculoCaptura.DesdePuntos(puntos);
            limites = calculados.HasValue ? CalculoCaptura.ConMargen(calculados.Value, margen) : (LimitesNivel?)null;
            mensaje = limites.HasValue ? "--limites=" + CalculoCaptura.FormatoLimites(limites.Value) : "Ningún Tilemap marcado tiene tiles.";
            if (avisos.Count > 0) mensaje += "\n" + string.Join("\n", avisos);
            if (limites.HasValue) Debug.Log("[Xolos] Límites de " + (string.IsNullOrEmpty(nivelId) ? "el nivel" : nivelId) + ": --limites=" + CalculoCaptura.FormatoLimites(limites.Value));
        }

        // Cámara ortográfica temporal centrada en los límites: su alto visible es el alto de los
        // límites y su proporción la de los límites, así cada píxel corresponde a una posición del
        // mundo y el dashboard puede dibujar las muertes encima.
        private void Capturar()
        {
            var l = limites.Value;
            var (ancho, alto) = CalculoCaptura.Pixeles(l, pixelesPorUnidad, AnchoMaximo);
            var objeto = new GameObject("CapturaXolos (temporal)") { hideFlags = HideFlags.HideAndDontSave };
            var textura = new Texture2D(ancho, alto, TextureFormat.RGBA32, false);
            var destino = RenderTexture.GetTemporary(ancho, alto, 24, RenderTextureFormat.ARGB32);
            var activaAntes = RenderTexture.active;
            try
            {
                var camara = objeto.AddComponent<Camera>();
                camara.enabled = false;
                camara.orthographic = true;
                camara.orthographicSize = (float)(l.Alto / 2);
                camara.aspect = (float)(l.Ancho / l.Alto);
                camara.transform.SetPositionAndRotation(new Vector3((float)((l.MinX + l.MaxX) / 2), (float)((l.MinY + l.MaxY) / 2), -1000f), Quaternion.identity);
                camara.nearClipPlane = 0.01f;
                camara.farClipPlane = 2000f;
                camara.clearFlags = CameraClearFlags.SolidColor;
                camara.backgroundColor = fondoTransparente ? Color.clear : colorFondo;
                var ui = LayerMask.NameToLayer("UI");
                camara.cullingMask = incluirCapaUi || ui < 0 ? ~0 : ~(1 << ui);
                camara.targetTexture = destino;
                camara.Render();

                RenderTexture.active = destino;
                textura.ReadPixels(new Rect(0, 0, ancho, alto), 0, 0);
                textura.Apply();
                camara.targetTexture = null;

                var carpeta = Path.GetFullPath(Path.Combine(Application.dataPath, "..", CarpetaSalida));
                Directory.CreateDirectory(carpeta);
                var archivo = Path.Combine(carpeta, nivelId + ".png");
                File.WriteAllBytes(archivo, textura.EncodeToPNG());
                var formato = CalculoCaptura.FormatoLimites(l);
                mensaje = "Guardada: " + archivo + " (" + ancho + " × " + alto + " px)\n--limites=" + formato;
                Debug.Log("[Xolos] Captura de " + nivelId + ": " + archivo + " (" + ancho + "×" + alto + " px). --limites=" + formato);
                EditorUtility.RevealInFinder(archivo);
            }
            finally
            {
                RenderTexture.active = activaAntes;
                RenderTexture.ReleaseTemporary(destino);
                DestroyImmediate(textura);
                DestroyImmediate(objeto);
            }
        }
    }
}
