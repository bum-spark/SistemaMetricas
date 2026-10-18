# Mapas de los niveles (imagen y límites del mapa de calor)

Cómo reemplazar la imagen de un nivel en el mapa de calor del dashboard (pantalla Muertes) por
una captura real del juego. Hoy los niveles usan imágenes **provisionales** en SVG (A-07).

## Cómo encaja todo

El mapa de calor necesita dos cosas por nivel, guardadas en el catálogo del juego:

- **`imagenUrl`**: la imagen del nivel completo, servida por el dashboard
  (`/niveles/<slug>/<nivelId>.webp`).
- **`limites`** (`minX,maxX,minY,maxY`): el rectángulo del mundo de Unity que cubre esa imagen,
  en las mismas unidades que `transform.position`. La esquina inferior izquierda de la imagen es
  `(minX, minY)` y la superior derecha, `(maxX, maxY)`.

**Eje Y:** hacia arriba, igual que en Unity. El SDK manda la posición de cada muerte con
`XolosMetricas.Muerte(nivelId, causa, transform.position)` (coordenadas de **mundo**), y el
dashboard dibuja `y = maxY` arriba y `y = minY` abajo. La herramienta de captura calcula los
límites en ese mismo sistema. Si el juego mandara otra cosa (posición local de un hijo,
coordenadas de pantalla o de la cámara), las muertes no caerían en su lugar.

La imagen y los límites deben tener **la misma proporción** (ancho/alto). El script
`actualizar-juego` avisa si difieren más de 2 %.

## Paso a paso

### 1. Instalar la herramienta de captura en Unity

Viene con el paquete del SDK, en `sdk-unity/Editor/` (ensamblado solo de editor
`EstudioXolos.Metricas.Editor`). Si el juego instaló el paquete (docs/SDK_UNITY.md §1), ya
aparece el menú. Sin el paquete: copia `CapturaNivelXolos.cs` y `CalculoCaptura.cs` a
`Assets/Editor/` del juego. **No las dos cosas a la vez**: habría dos menús iguales.

### 2. Capturar el nivel

1. Abre la escena del nivel en el editor (sin entrar a Play).
2. **Herramientas → Xolos → Capturar nivel para el mapa de calor**.
3. Llena:
   - **Slug del juego** (`la-casa-del-bosque`) y **nivelId** del catálogo (`casa_abandonada`).
   - **Píxeles por unidad**: el *Pixels Per Unit* de los sprites del nivel. El ancho final no
     pasa de 1920 px aunque el nivel sea muy largo.
   - **Margen**: unidades extra en los cuatro lados, por si hay sprites que sobresalen de su
     celda (árboles, decoración).
   - **Tilemaps que definen los límites**: ver [Varios Tilemaps](#varios-tilemaps).
4. **Calcular límites**: muestra `minX,maxX,minY,maxY` y el tamaño de la captura.
5. **Capturar PNG**: guarda `CapturasXolos/<nivelId>.png` en la carpeta del proyecto (fuera de
   `Assets/`, para que Unity no la importe) y la abre en el explorador. La consola imprime:

   ```
   [Xolos] Captura de casa_abandonada: …/CapturasXolos/casa_abandonada.png (1920×480 px). --limites=0,120,0,30
   ```

   El botón **Copiar comando de actualizar-juego** deja en el portapapeles el comando del paso 5
   con esos límites.

### 3. Convertir la imagen

Formato, peso y comando: [`IMAGENES.md`, "Imágenes de nivel"](IMAGENES.md#imágenes-de-nivel-mapa-de-calor).
En resumen: WebP (o PNG) de máximo ~500 KB y 1920 px de ancho, **sin recortar ni agregar
bordes**, guardado como `dashboard/public/niveles/<slug>/<nivelId>.webp`.

### 4. Publicar la imagen con el dashboard

```
git add dashboard/public/niveles/<slug>/<nivelId>.webp
git commit -m "feat: captura real del nivel <nivelId>"
git push
```

Vercel publica desde `main`. Comprueba que
`https://sistemametricas-dashboard.vercel.app/niveles/<slug>/<nivelId>.webp` muestra la imagen.
Si aparece el dashboard en lugar de la imagen, la ruta o el nombre están mal (Vercel responde
`index.html` a lo que no existe).

### 5. Actualizar el catálogo

Desde `api/`, en la **misma copia del repo** donde está la imagen (el script lee el archivo en
`dashboard/public` para comparar la proporción). Primero sin `--confirmar` para revisar el destino:

```powershell
npm run actualizar-juego -- --juego la-casa-del-bosque --nivel casa_abandonada --imagen-url /niveles/la-casa-del-bosque/casa_abandonada.webp --limites=0,120,0,30
npm run actualizar-juego -- --juego la-casa-del-bosque --nivel casa_abandonada --imagen-url /niveles/la-casa-del-bosque/casa_abandonada.webp --limites=0,120,0,30 --confirmar
```

- Usa `--limites=` con el signo igual: si `minX` es negativo (`-2,118,0,30`), sin él Node lo
  confunde con una opción.
- El script imprime la imagen y los límites **antes y después**, y solo modifica ese nivel.
- Si avisa que la proporción difiere, no sigas: revisa que la imagen no se haya recortado y que
  los límites sean los de esa captura.
- En Git Bash antepón `MSYS_NO_PATHCONV=1`.

### 6. Comprobar en el mapa

1. Dashboard → el juego → **Muertes** → mapa de calor → elige el nivel. Debe verse la imagen
   nueva (las imágenes de `public/` no se quedan en caché vieja: se revalidan en cada visita).
2. Las zonas calientes deben caer sobre lo que mata: fosos, lava, fantasmas. Si todo está
   corrido o estirado, los límites no corresponden a la captura.
3. Prueba rápida: en Play, muere a propósito en un punto fácil de reconocer (el borde
   izquierdo, una plataforma alta) y busca esa muerte en el mapa con origen "Reales".

La imagen SVG provisional anterior puede quedarse o borrarse; el catálogo ya no la usa.

## Varios Tilemaps

Los límites son la **unión** de las celdas ocupadas de todos los Tilemaps marcados: se toman las
cuatro esquinas en mundo de cada celda con tile (`CellToWorld`, que considera la posición, la
escala y la rotación del Tilemap y del Grid) y se calcula la caja que las contiene.

- **Por defecto** se marcan los Tilemaps activos con `TilemapRenderer` habilitado, es decir, lo
  que se ve. Los de solo colisión (sin renderer o con el renderer apagado) quedan fuera; la
  ventana los marca como "no se ve" y se pueden marcar a mano.
- Desmarca los que no deben ampliar los límites (por ejemplo, un fondo enorme que se sale del
  área jugable).
- La cámara dibuja **todo** lo que hay dentro del rectángulo (sprites sueltos y fondos incluidos),
  no solo los Tilemaps; pero solo los Tilemaps marcados definen el rectángulo. Si hay arte fuera
  de los Tilemaps que quieres en la imagen, usa **Margen**.
- Solo se probó el diseño para cuadrícula **rectangular**; con isométrica o hexagonal la ventana
  avisa que los límites pueden no ser exactos.

## Qué se probó y qué no

**Probado (sin abrir Unity):**

- La herramienta compila contra las DLL de **Unity 6000.0.45f1** (`UnityEngine.dll` y
  `UnityEditor.dll`) con C# 9, en sus dos ramas: Unity 6 (`FindObjectsByType`) y Unity
  2021.3/2022 (`FindObjectsOfType`). 0 errores y 0 advertencias. Comando en
  docs/SDK_UNITY.md §7.
- Los cálculos (unión de esquinas, margen, píxeles con la proporción de los límites, formato de
  `--limites` con punto decimal aunque la cultura use coma, comando sugerido): 4 pruebas en .NET
  fuera de Unity.
- `actualizar-juego --nivel`: tests con MongoDB en memoria y corrida real del script.

**No probado (no se ejecutó Unity):**

- La ventana del editor y la captura en sí: `Camera.Render`, `ReadPixels`, `EncodeToPNG` y el
  PNG resultante.
- Tilemaps reales: `cellBounds`, `HasTile` y `CellToWorld` con Grids movidos, escalados o rotados.
- Proyectos con **URP o HDRP** (incluido el 2D Renderer y sus luces): `Camera.Render` con un
  pipeline programable puede comportarse distinto que con el pipeline integrado.
- Scripts de *parallax*, tiles animados o efectos que solo se acomodan en Play: en el editor se
  capturan en su posición de edición.
- Cuadrículas isométricas o hexagonales.
- Un editor real de Unity 2021.3 o 2022: esa rama solo se compiló contra las DLL de Unity 6.
- Que el juego de verdad mande `transform.position` del jugador al morir: eso está en el código
  del juego (entrega 2), no en este repo.
